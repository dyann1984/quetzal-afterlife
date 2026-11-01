/**
 * Analizador XML de buena formación (sin DTD externas, sin resolver entidades externas: inmune a XXE).
 * Comprueba etiquetas, anidamiento, atributos (comillas, duplicados), entidades, comentarios, CDATA y PI.
 * Reparación verificable:
 *   · `&` sin escapar → `&amp;` (no cambia el texto que se lee);
 *   · truncado o error: se conserva el prefijo hasta el último nodo completo y se cierran las etiquetas abiertas
 *     en orden inverso; lo descartado se informa como rango dañado.
 * La versión reparada se vuelve a analizar; además, en el navegador se contrasta con DOMParser cuando existe.
 */
import { damaged } from './core';
import type { AnalysisResult, Analyzer } from './types';
import { byteOffset, decodeText, lineCol } from './textutil';

const NAME = /[A-Za-z_:À-￯][\w:.\-·À-￯]*/y;
const ENTITY = /&(?:[A-Za-z_][\w.-]*|#\d+|#x[0-9a-fA-F]+);/y;
const MAX_DEPTH = 1024;

export interface XmlScan {
  ok: boolean;
  error?: { index: number; message: string; eof: boolean };
  cut: number; cutStack: string[];
  elements: number; maxDepth: number; root: string | null;
  /** Posiciones de `&` sin escapar (se pueden reparar sin perder datos). */
  bareAmps: number[];
}

export function scanXml(s: string): XmlScan {
  const stack: string[] = [], bareAmps: number[] = [];
  let i = 0, cut = 0, cutStack: string[] = [], elements = 0, maxDepth = 0, root: string | null = null, rootClosed = false;
  const safe = () => { cut = i; cutStack = [...stack]; };
  const fail = (message: string, eof = i >= s.length): XmlScan => ({ ok: false, error: { index: Math.min(i, s.length), message, eof }, cut, cutStack, elements, maxDepth, root, bareAmps });
  const name = (): string | null => { NAME.lastIndex = i; const m = NAME.exec(s); if (!m) return null; i += m[0].length; return m[0]; };
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };

  if (s.charCodeAt(0) === 0xfeff) i = 1;
  while (i < s.length) {
    if (s[i] !== '<') {
      // texto
      const start = i;
      while (i < s.length && s[i] !== '<') {
        if (s[i] === '&') { ENTITY.lastIndex = i; const m = ENTITY.exec(s); if (m) { i += m[0].length; continue; } bareAmps.push(i); }
        i++;
      }
      if (stack.length === 0 && s.slice(start, i).trim()) { i = start; return fail(rootClosed ? 'texto después del elemento raíz' : 'texto antes del elemento raíz', false); }
      if (i < s.length) safe();
      continue;
    }
    if (s.startsWith('<!--', i)) { const e = s.indexOf('-->', i + 4); if (e < 0) return fail('comentario sin cerrar', true); i = e + 3; safe(); continue; }
    if (s.startsWith('<![CDATA[', i)) { if (!stack.length) return fail('CDATA fuera del elemento raíz', false); const e = s.indexOf(']]>', i + 9); if (e < 0) return fail('sección CDATA sin cerrar', true); i = e + 3; safe(); continue; }
    if (s.startsWith('<?', i)) { const e = s.indexOf('?>', i + 2); if (e < 0) return fail('instrucción de procesamiento sin cerrar', true); i = e + 2; safe(); continue; }
    if (s.startsWith('<!DOCTYPE', i)) {
      if (root) return fail('DOCTYPE después del elemento raíz', false);
      let depth = 0, j = i + 9;
      for (; j < s.length; j++) { if (s[j] === '[') depth++; else if (s[j] === ']') depth--; else if (s[j] === '>' && depth <= 0) break; }
      if (j >= s.length) { i = j; return fail('DOCTYPE sin cerrar', true); }
      i = j + 1; safe(); continue;
    }
    if (s[i + 1] === '/') {
      const at = i; i += 2; const n = name();
      if (!n) return i >= s.length ? fail('etiqueta de cierre cortada', true) : fail('etiqueta de cierre sin nombre');
      ws(); if (i >= s.length) return fail('etiqueta de cierre cortada', true);
      if (s[i] !== '>') return fail('se esperaba «>» en la etiqueta de cierre');
      const open = stack[stack.length - 1];
      if (open !== n) { i = at; return fail(open ? `</${n}> no corresponde a <${open}>` : `</${n}> sin etiqueta de apertura`, false); }
      stack.pop(); i++; if (!stack.length) rootClosed = true; safe(); continue;
    }
    // etiqueta de apertura
    const at = i; i++;
    const n = name();
    if (!n) return i >= s.length ? fail('etiqueta cortada al final', true) : fail('nombre de etiqueta inválido');
    if (rootClosed || (stack.length === 0 && root)) { i = at; return fail('más de un elemento raíz', false); }
    const attrs = new Set<string>();
    for (;;) {
      ws();
      if (i >= s.length) return fail('etiqueta cortada al final', true);
      if (s[i] === '>' || s.startsWith('/>', i)) break;
      const an = name();
      if (!an) return fail(`atributo inválido en <${n}>`);
      if (attrs.has(an)) return fail(`atributo «${an}» duplicado en <${n}>`);
      attrs.add(an); ws();
      if (s[i] !== '=') return i >= s.length ? fail('etiqueta cortada al final', true) : fail(`falta «=» en el atributo «${an}»`);
      i++; ws();
      const q = s[i]; if (q !== '"' && q !== "'") return i >= s.length ? fail('etiqueta cortada al final', true) : fail(`valor sin comillas en el atributo «${an}»`);
      const e = s.indexOf(q, i + 1); if (e < 0) { i = s.length; return fail('valor de atributo sin cerrar', true); }
      const val = s.slice(i + 1, e); if (val.includes('<')) return fail(`«<» dentro del atributo «${an}»`);
      for (let k = val.indexOf('&'); k >= 0; k = val.indexOf('&', k + 1)) { ENTITY.lastIndex = i + 1 + k; if (!ENTITY.exec(s)) bareAmps.push(i + 1 + k); }
      i = e + 1;
    }
    elements++; if (!root) root = n;
    if (s.startsWith('/>', i)) { i += 2; if (!stack.length) rootClosed = true; safe(); continue; }
    i++; stack.push(n); maxDepth = Math.max(maxDepth, stack.length);
    if (stack.length > MAX_DEPTH) return fail(`profundidad mayor que ${MAX_DEPTH}`);
    safe();
  }
  if (!root) return fail('no hay elemento raíz', true);
  if (stack.length) return fail(`fin del archivo con ${stack.length} etiqueta(s) sin cerrar (<${stack[stack.length - 1]}>)`, true);
  return { ok: true, cut: s.length, cutStack: [], elements, maxDepth, root, bareAmps };
}

const escapeAmps = (s: string, at: number[]) => { let out = '', p = 0; for (const a of at) { out += s.slice(p, a) + '&amp;'; p = a + 1; } return out + s.slice(p); };

/** Verificador independiente cuando existe (navegador): DOMParser marca errores con <parsererror>. */
function domParserOk(text: string): boolean | null {
  const DP = (globalThis as { DOMParser?: new () => { parseFromString(t: string, m: string): { getElementsByTagName(n: string): { length: number } } } }).DOMParser;
  if (!DP) return null;
  try { return new DP().parseFromString(text, 'application/xml').getElementsByTagName('parsererror').length === 0; } catch { return null; }
}

export function analyzeXml(b: Uint8Array, name = 'datos.xml'): AnalysisResult {
  const d = decodeText(b), s = d.text, findings: AnalysisResult['findings'] = [], dmg: AnalysisResult['damaged'] = [];
  const limitations = ['No se validan DTD ni esquemas XSD; solo buena formación.', 'Las entidades externas no se resuelven nunca.', 'Lo descartado tras un error no se reconstruye.'];
  if (d.invalid.total) findings.push({ severity: 'dano', code: 'secuencias_invalidas', message: `${d.invalid.total} secuencia(s) UTF-8 inválidas; la primera en el byte ${d.invalid.offsets[0]}.`, offset: d.invalid.offsets[0] });
  const sc = scanXml(s);
  const meta: Record<string, string | number> = { codificacion: d.encoding, elementos: sc.elements, 'profundidad máxima': sc.maxDepth };
  if (sc.root) meta.raiz = sc.root;
  if (sc.ok && !sc.bareAmps.length && !d.invalid.total)
    return { integrity: 'integro', findings, damaged: [], meta, limitations: limitations.slice(0, 2),
      items: [{ kind: 'estructura', name: 'documento XML', size: b.length, verified: true, basis: 'buena formación comprobada de principio a fin', preview: s.slice(0, 300) }] };

  if (sc.bareAmps.length) findings.push({ severity: 'aviso', code: 'xml_ampersand', message: `${sc.bareAmps.length} «&» sin escapar.`, offset: byteOffset(s, sc.bareAmps[0], d.bomBytes) });
  if (sc.error) {
    const lc = lineCol(s, sc.error.index);
    findings.push({ severity: 'dano', code: sc.error.eof ? 'xml_truncado' : 'xml_sintaxis', message: `Error XML en línea ${lc.line}, columna ${lc.col}: ${sc.error.message}.`, offset: byteOffset(s, sc.error.index, d.bomBytes) });
  }
  const end = sc.ok ? s.length : sc.cut;
  const amps = sc.bareAmps.filter(a => a < end);
  let text = escapeAmps(s.slice(0, end), amps).replace(/\s+$/, '');
  const closers = [...sc.cutStack].reverse().map(n => `</${n}>`).join('');
  text += closers + '\n';
  const re = scanXml(text);
  if (!re.root) {
    dmg.push(damaged(d.bomBytes, b.length, 'sin ningún elemento XML completo'));
    return { integrity: 'irrecuperable', findings, damaged: dmg, items: [], meta, limitations };
  }
  if (!sc.ok) dmg.push(damaged(byteOffset(s, end, d.bomBytes), b.length, sc.error?.eof ? 'final truncado: nodo incompleto' : `descartado desde el error: ${sc.error?.message}`));
  const dom = domParserOk(text), valid = re.ok && re.bareAmps.length === 0 && dom !== false;
  const parts: string[] = [];
  if (amps.length) parts.push(`se escaparon ${amps.length} «&»`);
  if (!sc.ok) parts.push(`se conservaron ${end} de ${s.length} caracteres hasta el último nodo completo`);
  if (closers) parts.push(`se cerraron ${sc.cutStack.length} etiqueta(s) abiertas`);
  const lossless = sc.ok;
  return {
    integrity: lossless ? 'parcial' : end / Math.max(s.length, 1) >= 0.5 ? 'parcial' : 'danado',
    findings, damaged: dmg, meta, limitations,
    items: [{ kind: 'estructura', name: lossless ? 'documento XML (entidades escapadas)' : 'prefijo XML bien formado', size: text.length, verified: valid,
      basis: valid ? (dom === true ? 'bien formado según el analizador y DOMParser' : 'bien formado al volver a analizarlo') : 'la versión reparada no es bien formada', preview: text.slice(0, 300) }],
    repaired: { name: `${name.replace(/\.[^.]*$/, '')}.reparado.xml`, bytes: new TextEncoder().encode(text), structureVerified: valid,
      note: `${parts.join('; ')}. ${lossless ? 'No se perdió ningún dato.' : 'Los datos posteriores al corte no se conservan.'}` },
  };
}
export const xmlAnalyzer: Analyzer = { id: 'xml', label: 'XML', analyze: (b, ctx) => analyzeXml(b, ctx.name) };
