/**
 * Analizador de texto plano. Detecta BOM/codificación y, en UTF-8, localiza con precisión cada rango de bytes inválido
 * (secuencias rotas, bytes nulos, caracteres de control). Recupera las líneas íntegras tal cual y propone un texto reparado
 * en el que los bytes perdidos se marcan con «�»: nunca se adivina su contenido. Nunca interpreta ni ejecuta el texto.
 */
import { damaged, type DamagedRange } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

const MAX_RANGES = 40;
const isCtrl = (c: number) => c === 0 || (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127;

/** Valida UTF-8 estricto (RFC 3629). Devuelve rangos [inicio, fin) de bytes inválidos y cuántas secuencias multibyte válidas hay. */
export function scanUtf8(b: Uint8Array, start = 0): { bad: Array<[number, number]>; multibyte: number } {
  const bad: Array<[number, number]> = []; let multibyte = 0, i = start;
  const mark = (s: number, e: number) => { const l = bad[bad.length - 1]; if (l && l[1] === s) l[1] = e; else bad.push([s, e]); };
  const cont = (o: number, lo = 0x80, hi = 0xbf) => o < b.length && b[o] >= lo && b[o] <= hi;
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) { if (isCtrl(c)) mark(i, i + 1); i++; continue; }
    let n = 0;
    if (c >= 0xc2 && c <= 0xdf) n = cont(i + 1) ? 2 : 0;
    else if (c === 0xe0) n = cont(i + 1, 0xa0) && cont(i + 2) ? 3 : 0;
    else if (c === 0xed) n = cont(i + 1, 0x80, 0x9f) && cont(i + 2) ? 3 : 0;
    else if (c >= 0xe1 && c <= 0xef) n = cont(i + 1) && cont(i + 2) ? 3 : 0;
    else if (c === 0xf0) n = cont(i + 1, 0x90) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    else if (c === 0xf4) n = cont(i + 1, 0x80, 0x8f) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    else if (c >= 0xf1 && c <= 0xf3) n = cont(i + 1) && cont(i + 2) && cont(i + 3) ? 4 : 0;
    if (n) { multibyte++; i += n; } else { mark(i, i + 1); i++; }
  }
  return { bad, multibyte };
}

export function analyzeText(b: Uint8Array): AnalysisResult {
  let enc = 'utf-8', start = 0, basis = 'UTF-8 válido';
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { start = 3; basis = 'BOM UTF-8'; }
  else if (b[0] === 0xff && b[1] === 0xfe) { enc = 'utf-16le'; start = 2; basis = 'BOM UTF-16 LE'; }
  else if (b[0] === 0xfe && b[1] === 0xff) { enc = 'utf-16be'; start = 2; basis = 'BOM UTF-16 BE'; }
  const limitations = ['La codificación se estima; sin BOM no hay forma de confirmarla.', 'Los bytes sobrescritos o a cero no contienen información: se marcan, no se reconstruyen.'];

  if (enc !== 'utf-8') {                       // UTF-16: sin localización fina de daños
    const text = new TextDecoder(enc, { fatal: false }).decode(b.subarray(start)), bad = (text.match(/�/g) ?? []).length, nul = (text.match(/\u0000/g) ?? []).length;
    return { integrity: bad === 0 && nul === 0 ? 'integro' : bad / Math.max(text.length, 1) < 0.05 ? 'parcial' : 'danado',
      findings: [...(bad ? [{ severity: 'dano' as const, code: 'secuencias_invalidas', message: `${bad} secuencia(s) inválidas en ${enc}.` }] : []), ...(nul ? [{ severity: 'aviso' as const, code: 'bytes_nulos', message: `${nul} carácter(es) nulo(s).` }] : [])],
      damaged: bad ? [damaged(0, Math.min(b.length, 1), `${bad} secuencias inválidas (posición exacta no localizada)`)] : [],
      items: [{ kind: 'texto', name: 'contenido', size: b.length, verified: bad === 0 && nul === 0, basis, preview: text.slice(0, 300) }], limitations, meta: { codificacion: enc, caracteres: text.length } };
  }

  const { bad, multibyte } = scanUtf8(b, start);
  const badBytes = bad.reduce((n, [s, e]) => n + (e - s), 0);
  const allHigh = bad.every(([s, e]) => { for (let i = s; i < e; i++) if (b[i] < 0x80) return false; return true; });
  if (bad.length > 0 && multibyte === 0 && allHigh) {  // sin UTF-8 multibyte válido y solo bytes altos: lo típico de un texto heredado
    const text = new TextDecoder('windows-1252').decode(b.subarray(start));
    return { integrity: 'integro', findings: [{ severity: 'aviso', code: 'codificacion_estimada', message: 'No es UTF-8 válido y no contiene secuencias UTF-8: se interpreta como Windows-1252 (estimación, no confirmada).' }], damaged: [],
      items: [{ kind: 'texto', name: 'contenido', size: b.length, verified: false, basis: 'no es UTF-8 válido; decodificado como Windows-1252 (estimación)', preview: text.slice(0, 300) }], limitations, meta: { codificacion: 'windows-1252', caracteres: text.length } };
  }

  const findings: AnalysisResult['findings'] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const dec = new TextDecoder('utf-8', { fatal: false }), enc8 = new TextEncoder();
  // líneas sobre los bytes originales; una línea es íntegra si ningún rango inválido la toca
  const lines: Array<{ s: number; e: number; ok: boolean }> = []; let ls = start;
  for (let i = start; i <= b.length; i++) if (i === b.length || b[i] === 10) { if (i > ls || i < b.length) lines.push({ s: ls, e: Math.min(i + 1, b.length), ok: true }); ls = i + 1; }
  let bi = 0; for (const l of lines) { while (bi < bad.length && bad[bi][1] <= l.s) bi++; if (bi < bad.length && bad[bi][0] < l.e) l.ok = false; }
  const okLines = lines.filter(l => l.ok), nulBytes = bad.reduce((n, [s, e]) => { for (let i = s; i < e; i++) if (b[i] === 0) n++; return n; }, 0);

  bad.slice(0, MAX_RANGES).forEach(([s, e]) => {
    const kind = b.subarray(s, e).every(x => x === 0) ? 'bytes a cero' : b.subarray(s, e).every(x => isCtrl(x) || x >= 0x80) ? 'bytes inválidos' : 'bytes inválidos o de control';
    dmg.push(damaged(s, e, `${e - s} ${kind}`));
  });
  if (bad.length > MAX_RANGES) findings.push({ severity: 'aviso', code: 'rangos_omitidos', message: `Se listan ${MAX_RANGES} de ${bad.length} rangos dañados.` });
  if (bad.length) findings.push({ severity: 'dano', code: 'secuencias_invalidas', message: `${badBytes} byte(s) inválidos en ${bad.length} rango(s) (nulos: ${nulBytes}); ${lines.length - okLines.length} de ${lines.length} línea(s) afectadas.` });

  const intactBytes = okLines.length ? Uint8Array.from(okLines.flatMap(l => Array.from(b.subarray(l.s, l.e)))) : new Uint8Array(0);
  const text = dec.decode(b.subarray(start));
  if (!bad.length) items.push({ kind: 'texto', name: 'contenido', size: b.length, verified: true, basis, preview: text.slice(0, 300), bytes: b.length <= 1_048_576 ? b.slice(start) : undefined });
  else {
    items.push({ kind: 'texto', name: `líneas íntegras (${okLines.length} de ${lines.length})`, size: intactBytes.length, verified: okLines.length > 0, basis: 'UTF-8 estricto sin bytes inválidos ni de control en toda la línea', preview: dec.decode(intactBytes).slice(0, 300), bytes: intactBytes.length <= 1_048_576 ? intactBytes : undefined });
    if (lines.length > okLines.length) items.push({ kind: 'texto', name: `líneas con daño (${lines.length - okLines.length})`, size: badBytes, verified: false, basis: 'contienen bytes que no se pueden interpretar; lo legible de ellas se conserva en el texto reparado', preview: lines.filter(l => !l.ok).slice(0, 3).map(l => dec.decode(b.subarray(l.s, l.e)).replace(/\n$/, '')).join(' ⏎ ').slice(0, 240) });
  }

  let repaired: AnalysisResult['repaired'];
  if (bad.length) {
    const parts: string[] = []; let p = start;
    for (const [s, e] of bad) { parts.push(dec.decode(b.subarray(p, s)), '�'); p = e; }
    parts.push(dec.decode(b.subarray(p)));
    const out = enc8.encode(parts.join('')); let strict = true; try { new TextDecoder('utf-8', { fatal: true }).decode(out); } catch { strict = false; }
    repaired = { name: 'recuperado.txt', bytes: out, structureVerified: strict, note: `Texto UTF-8 con los ${badBytes} byte(s) perdidos sustituidos por «�» (un marcador por rango). El contenido original de esos bytes no existe en el archivo y no se adivina. Decodifica como UTF-8 estricto.` };
  }
  const ratio = badBytes / Math.max(b.length, 1);
  return { integrity: bad.length === 0 ? 'integro' : ratio < 0.05 || okLines.length / Math.max(lines.length, 1) >= 0.5 ? 'parcial' : 'danado', findings, damaged: dmg, items, repaired, limitations,
    meta: { codificacion: enc, caracteres: text.length, lineas: lines.length, lineasIntegras: okLines.length, bytesDanados: badBytes } };
}
export const textAnalyzer: Analyzer = { id: 'text', label: 'Texto', analyze: b => analyzeText(b) };
