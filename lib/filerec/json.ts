/**
 * Analizador JSON con reparación verificable.
 *
 * Un escáner propio recorre el texto con una pila de contenedores y recuerda el último «punto de corte seguro»
 * (justo después de un valor completo). Reparaciones deterministas, siempre enumeradas en la nota:
 *   · quitar comentarios // y /* *\/ y comas finales (`[1,2,]`) — no cambian datos;
 *   · si el archivo está truncado o tiene un error de sintaxis, conservar el prefijo hasta el último valor completo y
 *     añadir solo los cierres `}` / `]` que faltan — lo descartado se informa como rango dañado.
 * La reparación se VALIDA con `JSON.parse` (verificador independiente del escáner). Nunca se inventan valores.
 */
import { damaged } from './core';
import type { AnalysisResult, Analyzer } from './types';
import { byteOffset, decodeText, lineCol } from './textutil';

const MAX_DEPTH = 512;
type Expect = 'value' | 'valueOrClose' | 'key' | 'keyOrClose' | 'colon' | 'commaOrClose' | 'done';

export interface JsonScan {
  ok: boolean;
  error?: { index: number; message: string; eof: boolean };
  /** Último índice tras un valor completo, y la pila de contenedores abiertos en ese punto. */
  cut: number; cutStack: string;
  /** Rangos [inicio, fin) que se omiten en modo tolerante (comentarios, comas finales). */
  skips: Array<[number, number, 'comentario' | 'coma-final']>;
  values: number; maxDepth: number;
}

const isWs = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function scanJson(s: string, lenient: boolean): JsonScan {
  const stack: string[] = [], skips: JsonScan['skips'] = [];
  const st = { expect: 'value' as Expect };
  let i = 0, cut = 0, cutStack = '', values = 0, maxDepth = 0;
  const fail = (message: string, eof = i >= s.length): JsonScan => ({ ok: false, error: { index: Math.min(i, s.length), message, eof }, cut, cutStack, skips, values, maxDepth });
  const completed = () => {
    values++;
    if (stack.length === 0) { st.expect = 'done'; cut = i; cutStack = ''; return; }
    st.expect = 'commaOrClose'; cut = i; cutStack = stack.join('');
  };
  const skipWsAndComments = (): boolean => {
    for (;;) {
      while (i < s.length && isWs(s[i])) i++;
      if (lenient && s[i] === '/' && s[i + 1] === '/') { const a = i; while (i < s.length && s[i] !== '\n') i++; skips.push([a, i, 'comentario']); continue; }
      if (lenient && s[i] === '/' && s[i + 1] === '*') { const a = i, e = s.indexOf('*/', i + 2); if (e < 0) { i = s.length; return false; } i = e + 2; skips.push([a, i, 'comentario']); continue; }
      return true;
    }
  };
  const readString = (): boolean => {
    i++; // comilla de apertura
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 34) { i++; return true; }
      if (c === 92) { const n = s[i + 1]; if (n === undefined) { i = s.length; return false; } if (n === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) return false; i += 6; } else if ('"\\/bfnrt'.includes(n)) i += 2; else return false; continue; }
      if (c < 0x20) return false;
      i++;
    }
    return false;
  };

  while (true) {
    if (!skipWsAndComments()) return fail('comentario sin cerrar', true);
    if (i >= s.length) {
      if (st.expect === 'done') return { ok: true, cut, cutStack, skips, values, maxDepth };
      return fail(stack.length ? `fin del archivo con ${stack.length} contenedor(es) sin cerrar` : 'el archivo está vacío o termina antes del primer valor', true);
    }
    const c = s[i];
    if (st.expect === 'done') return fail('contenido adicional después del valor raíz', false);
    if (st.expect === 'colon') { if (c !== ':') return fail('se esperaba «:»'); i++; st.expect = 'value'; continue; }
    if (st.expect === 'commaOrClose') {
      if (c === ',') {
        if (lenient) { const a = i; i++; skipWsAndComments(); if (s[i] === '}' || s[i] === ']') { skips.push([a, a + 1, 'coma-final']); continue; } st.expect = stack[stack.length - 1] === '{' ? 'key' : 'value'; continue; }
        i++; st.expect = stack[stack.length - 1] === '{' ? 'key' : 'value'; continue;
      }
      if (c === '}' || c === ']') {
        const open = stack[stack.length - 1];
        if ((c === '}') !== (open === '{')) return fail(`cierre «${c}» no corresponde a «${open}»`);
        stack.pop(); i++; completed(); continue;
      }
      return fail('se esperaba «,» o un cierre');
    }
    if (st.expect === 'key' || st.expect === 'keyOrClose') {
      if (c === '}' && st.expect === 'keyOrClose') { stack.pop(); i++; completed(); continue; }
      if (c !== '"') return fail('se esperaba una clave entre comillas');
      if (!readString()) return fail('cadena de clave inválida o sin cerrar');
      st.expect = 'colon'; continue;
    }
    // value | valueOrClose
    if (c === ']' && st.expect === 'valueOrClose') { stack.pop(); i++; completed(); continue; }
    if (c === '{' || c === '[') {
      if (stack.length >= MAX_DEPTH) return fail(`profundidad mayor que ${MAX_DEPTH}`);
      stack.push(c); maxDepth = Math.max(maxDepth, stack.length); i++;
      st.expect = c === '{' ? 'keyOrClose' : 'valueOrClose'; cut = i; cutStack = stack.join(''); continue;
    }
    if (c === '"') { if (!readString()) return fail('cadena inválida o sin cerrar'); completed(); continue; }
    NUM.lastIndex = i; const m = NUM.exec(s);
    if (m) { i += m[0].length; if (i < s.length && /[\w.]/.test(s[i])) return fail('número mal formado'); completed(); continue; }
    const lit = ['true', 'false', 'null'].find(l => s.startsWith(l, i));
    if (lit) { i += lit.length; completed(); continue; }
    const partialLit = ['true', 'false', 'null'].some(l => l.startsWith(s.slice(i)) && s.length - i < l.length);
    return fail(partialLit ? 'literal cortado al final' : 'valor inesperado', partialLit);
  }
}

const close = (stack: string) => [...stack].reverse().map(c => (c === '{' ? '}' : ']')).join('');

/** Aplica las omisiones y el corte; devuelve el texto reparado (sin validar). */
export function buildJsonRepair(s: string, scan: JsonScan): { text: string; kept: number; removedComments: number; removedCommas: number; closers: string } | null {
  const end = scan.ok ? s.length : scan.cut;
  if (!scan.ok && scan.values === 0) return null;   // no hay ningún valor completo que conservar
  let out = '', pos = 0, removedComments = 0, removedCommas = 0;
  for (const [a, b, why] of scan.skips) { if (a >= end) break; out += s.slice(pos, a); pos = Math.min(b, end); if (why === 'comentario') removedComments++; else removedCommas++; }
  out += s.slice(pos, end);
  const closers = scan.ok ? '' : close(scan.cutStack);
  return { text: out.replace(/\s+$/, '') + closers + (scan.ok ? '' : '\n'), kept: end, removedComments, removedCommas, closers };
}

export function analyzeJson(b: Uint8Array, name = 'datos.json'): AnalysisResult {
  const d = decodeText(b), s = d.text, findings: AnalysisResult['findings'] = [], dmg: AnalysisResult['damaged'] = [];
  const limitations = ['Lo descartado tras un error no se reconstruye: solo se conserva el prefijo válido.', 'Las claves y valores no se interpretan ni se corrigen.'];
  if (d.invalid.total) findings.push({ severity: 'dano', code: 'secuencias_invalidas', message: `${d.invalid.total} secuencia(s) UTF-8 inválidas; la primera en el byte ${d.invalid.offsets[0]}.`, offset: d.invalid.offsets[0] });
  const meta: Record<string, string | number> = { codificacion: d.encoding, caracteres: s.length };

  let strictOk = false; try { JSON.parse(s); strictOk = true; } catch { /* se diagnostica abajo */ }
  const strict = scanJson(s, false);
  if (strictOk && d.invalid.total === 0) {
    meta.valores = strict.values; meta['profundidad máxima'] = strict.maxDepth;
    return { integrity: 'integro', findings, damaged: [], meta, limitations: [],
      items: [{ kind: 'estructura', name: 'documento JSON', size: b.length, verified: true, basis: 'JSON.parse acepta el documento completo', preview: s.slice(0, 300) }] };
  }
  const loose = scanJson(s, true);
  meta.valores = loose.values; meta['profundidad máxima'] = loose.maxDepth;
  if (strict.error) {
    const lc = lineCol(s, strict.error.index), at = byteOffset(s, strict.error.index, d.bomBytes);
    findings.push({ severity: 'dano', code: strict.error.eof ? 'json_truncado' : 'json_sintaxis', message: `Error JSON en línea ${lc.line}, columna ${lc.col}: ${strict.error.message}.`, offset: at });
  }
  const comments = loose.skips.filter(x => x[2] === 'comentario').length, commas = loose.skips.length - comments;
  if (comments) findings.push({ severity: 'aviso', code: 'json_comentarios', message: `${comments} comentario(s), no permitidos en JSON estándar.` });
  if (commas) findings.push({ severity: 'aviso', code: 'json_comas_finales', message: `${commas} coma(s) final(es) antes de un cierre.` });

  const rep = buildJsonRepair(s, loose);
  if (!rep) {
    if (loose.error) dmg.push(damaged(d.bomBytes, b.length, 'sin ningún valor JSON completo'));
    return { integrity: 'irrecuperable', findings, damaged: dmg, items: [], meta, limitations };
  }
  if (!loose.ok) {
    const from = byteOffset(s, rep.kept, d.bomBytes);
    dmg.push(damaged(from, b.length, loose.error?.eof ? 'final truncado: valor incompleto' : `descartado desde el error: ${loose.error?.message}`));
  }
  let valid = false; try { JSON.parse(rep.text); valid = true; } catch { valid = false; }
  const parts: string[] = [];
  if (rep.removedComments) parts.push(`se quitaron ${rep.removedComments} comentario(s)`);
  if (rep.removedCommas) parts.push(`se quitaron ${rep.removedCommas} coma(s) final(es)`);
  if (!loose.ok) parts.push(`se conservaron ${rep.kept} de ${s.length} caracteres hasta el último valor completo`);
  if (rep.closers) parts.push(`se añadieron los cierres «${rep.closers}»`);
  const lossless = loose.ok;
  const base = name.replace(/\.[^.]*$/, '');
  return {
    integrity: lossless ? 'parcial' : rep.kept / Math.max(s.length, 1) >= 0.5 ? 'parcial' : 'danado',
    findings, damaged: dmg, meta, limitations,
    items: [{ kind: 'estructura', name: lossless ? 'documento JSON (sintaxis normalizada)' : 'prefijo JSON válido', size: rep.text.length, verified: valid,
      basis: valid ? 'JSON.parse acepta la versión reparada' : 'la versión reparada no supera JSON.parse', preview: rep.text.slice(0, 300) }],
    repaired: { name: `${base}.reparado.json`, bytes: new TextEncoder().encode(rep.text), structureVerified: valid,
      note: `${parts.join('; ')}. ${lossless ? 'No se perdió ningún dato.' : 'Los datos posteriores al corte no se conservan.'}` },
  };
}
export const jsonAnalyzer: Analyzer = { id: 'json', label: 'JSON', analyze: (b, ctx) => analyzeJson(b, ctx.name) };
