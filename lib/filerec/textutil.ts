/**
 * Utilidades de texto compartidas por los analizadores de TXT, JSON, XML y CSV.
 * Validación UTF-8 con offsets exactos, decodificación y reversión verificable de la doble codificación (mojibake).
 */

/** Offsets (en bytes) de las secuencias UTF-8 inválidas, hasta `max`. Sigue RFC 3629 (sin sobrelargas ni sustitutos). */
export function invalidUtf8(b: Uint8Array, start = 0, max = 64): { offsets: number[]; total: number } {
  const offsets: number[] = []; let total = 0, i = start;
  const bad = (at: number) => { total++; if (offsets.length < max) offsets.push(at); };
  while (i < b.length) {
    const c = b[i];
    if (c < 0x80) { i++; continue; }
    let need = 0, min = 0;
    if (c >= 0xc2 && c <= 0xdf) { need = 1; min = 0x80; }
    else if (c >= 0xe0 && c <= 0xef) { need = 2; min = 0x800; }
    else if (c >= 0xf0 && c <= 0xf4) { need = 3; min = 0x10000; }
    else { bad(i); i++; continue; }
    if (i + need > b.length - 1) { bad(i); break; }   // secuencia cortada al final del archivo
    let cp = c & (0x3f >> need), ok = true;
    for (let k = 1; k <= need; k++) { const x = b[i + k]; if (x === undefined || (x & 0xc0) !== 0x80) { ok = false; break; } cp = (cp << 6) | (x & 0x3f); }
    if (!ok || cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) { bad(i); i++; continue; }
    i += need + 1;
  }
  return { offsets, total };
}

export interface Decoded { text: string; encoding: string; bomBytes: number; basis: string; estimated: boolean; invalid: { offsets: number[]; total: number } }

/** Decodifica bytes de texto: BOM → codificación; sin BOM, UTF-8 estricto o, si no es válido, Windows-1252 (estimación). */
export function decodeText(b: Uint8Array): Decoded {
  const none = { offsets: [], total: 0 };
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    const inv = invalidUtf8(b, 3);
    return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'utf-8', bomBytes: 3, basis: 'BOM UTF-8', estimated: false, invalid: inv };
  }
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le', bomBytes: 2, basis: 'BOM UTF-16 LE', estimated: false, invalid: none };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be', bomBytes: 2, basis: 'BOM UTF-16 BE', estimated: false, invalid: none };
  const inv = invalidUtf8(b);
  if (inv.total === 0) return { text: new TextDecoder('utf-8').decode(b), encoding: 'utf-8', bomBytes: 0, basis: 'UTF-8 válido', estimated: false, invalid: inv };
  return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252', bomBytes: 0, basis: 'no es UTF-8 válido; decodificado como Windows-1252 (estimación)', estimated: true, invalid: inv };
}

// ─── Mojibake: UTF-8 leído como Windows-1252 y vuelto a guardar como UTF-8 ("Ã©" en lugar de "é") ─────
let CP1252: Map<string, number> | null = null;
const cp1252 = () => {
  if (CP1252) return CP1252;
  const dec = new TextDecoder('windows-1252'), m = new Map<string, number>();
  for (let i = 0; i < 256; i++) m.set(dec.decode(Uint8Array.of(i)), i);
  return (CP1252 = m);
};
/** Codifica a Windows-1252; null si algún carácter no existe en esa tabla. */
export function encode1252(s: string): Uint8Array | null {
  const m = cp1252(), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) { const v = m.get(s[i]); if (v === undefined) return null; out[i] = v; }
  return out;
}
const MOJI = /[ÂÃÅÆ][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/g;
export const mojibakeCount = (s: string) => (s.match(MOJI) ?? []).length;

export interface MojibakeFix { text: string; segments: number; before: number; after: number; roundTrip: boolean }
/**
 * Revierte la doble codificación por líneas (solo en las líneas afectadas). Cada línea corregida se acepta solo si:
 *  1) sus caracteres existen en Windows-1252, 2) esos bytes son UTF-8 válido, 3) el resultado tiene menos mojibake y
 *  4) la ida y vuelta (corregido → UTF-8 → leído como 1252) reproduce EXACTAMENTE la línea original.
 */
export function fixMojibake(text: string): MojibakeFix | null {
  const before = mojibakeCount(text); if (before === 0) return null;
  const utf8 = new TextDecoder('utf-8', { fatal: true }), dec1252 = new TextDecoder('windows-1252'), enc = new TextEncoder();
  let segments = 0, roundTrip = true;
  const lines = text.split('\n').map(line => {
    if (mojibakeCount(line) === 0) return line;
    const bytes = encode1252(line); if (!bytes) return line;
    let fixed: string; try { fixed = utf8.decode(bytes); } catch { return line; }
    if (mojibakeCount(fixed) >= mojibakeCount(line)) return line;
    if (dec1252.decode(enc.encode(fixed)) !== line) { roundTrip = false; return line; }
    segments++; return fixed;
  });
  if (segments === 0) return null;
  const out = lines.join('\n');
  return { text: out, segments, before, after: mojibakeCount(out), roundTrip };
}

/** Línea y columna (1-based) de un índice de carácter. */
export function lineCol(text: string, index: number): { line: number; col: number } {
  let line = 1, last = -1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return { line, col: index - last };
}
/** Offset en bytes UTF-8 del carácter `index` (para rangos dañados exactos). */
export const byteOffset = (text: string, index: number, bom = 0) => bom + new TextEncoder().encode(text.slice(0, index)).length;
