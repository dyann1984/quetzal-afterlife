/**
 * lib/filerec/core.ts — Utilidades del módulo de recuperación de archivos
 * Quetzal Afterlife · Universal Digital Recovery
 *
 * Todo opera sobre bytes en memoria, en solo lectura: nada se ejecuta, nada se escribe en disco.
 * `inflate` es propio (no usa DecompressionStream) porque en forense hace falta recuperar el
 * PREFIJO válido de un flujo dañado y saber en qué byte falló; los flujos nativos lanzan sin dar eso.
 */

// ─── Límites configurables ───────────────────────────────────────────────────
export interface Limits {
  maxFileBytes: number;      // tamaño máximo de entrada
  maxEntries: number;        // entradas ZIP / candidatos de carving
  maxEntryBytes: number;     // salida máxima por flujo descomprimido
  maxTotalBytes: number;     // salida total descomprimida por archivo
  maxRatio: number;          // relación descomprimido/comprimido considerada sospechosa
  maxMillis: number;         // presupuesto de tiempo por archivo
}
export const DEFAULT_LIMITS: Limits = {
  maxFileBytes: 8 * 1024 * 1024, maxEntries: 1000, maxEntryBytes: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024, maxRatio: 200, maxMillis: 8000,
};

export class Deadline {
  private end: number;
  constructor(ms: number) { this.end = performance.now() + ms; }
  get expired() { return performance.now() > this.end; }
}

// ─── Hallazgos ───────────────────────────────────────────────────────────────
export type Severity = 'info' | 'aviso' | 'dano';
export interface FileFinding { severity: Severity; code: string; message: string; offset?: number }
export interface DamagedRange { start: number; end: number; reason: string; sectors?: [number, number] }

export const SECTOR = 512;
/** Rango de sectores de 512 B (inclusive) que toca un rango de bytes [start, end). */
export const sectorsOf = (start: number, end: number): [number, number] => [Math.floor(start / SECTOR), Math.floor(Math.max(end - 1, start) / SECTOR)];
export const damaged = (start: number, end: number, reason: string): DamagedRange => ({ start, end, reason, sectors: sectorsOf(start, end) });

// ─── CRC-32 y Adler-32 ───────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(data: Uint8Array, start = 0, end = data.length, seed = 0): number {
  let c = ~seed >>> 0;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}
export function adler32(data: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < data.length; i++) { a = (a + data[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}

// ─── Lectura segura ──────────────────────────────────────────────────────────
export const u16le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8)) >>> 0;
export const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export const u16be = (b: Uint8Array, o: number) => ((b[o] << 8) | b[o + 1]) >>> 0;
export const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
export const matches = (b: Uint8Array, o: number, sig: ArrayLike<number>) => { if (o < 0 || o + sig.length > b.length) return false; for (let i = 0; i < sig.length; i++) if (b[o + i] !== sig[i]) return false; return true; };
export const ascii = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff);
export const latin1 = (b: Uint8Array, start = 0, end = b.length) => { let s = ''; for (let i = start; i < end; i += 8192) s += String.fromCharCode(...b.subarray(i, Math.min(end, i + 8192))); return s; };
export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; } return out;
}
export function indexOfSeq(b: Uint8Array, sig: ArrayLike<number>, from = 0, to = b.length): number {
  const last = Math.min(to, b.length) - sig.length;
  outer: for (let i = Math.max(0, from); i <= last; i++) { for (let k = 0; k < sig.length; k++) if (b[i + k] !== sig[k]) continue outer; return i; }
  return -1;
}
export function lastIndexOfSeq(b: Uint8Array, sig: ArrayLike<number>, from = b.length - sig.length, to = 0): number {
  for (let i = Math.min(from, b.length - sig.length); i >= Math.max(0, to); i--) { let ok = true; for (let k = 0; k < sig.length; k++) if (b[i + k] !== sig[k]) { ok = false; break; } if (ok) return i; }
  return -1;
}

// ─── Nombres seguros (anti zip-slip) ─────────────────────────────────────────
/** Devuelve un nombre relativo sin escapes de directorio, sin unidades ni caracteres de control. */
export function safeName(name: string, maxLen = 200): string {
  const parts = name.replace(/\\/g, '/').replace(/[\u0000-\u001f\u007f]/g, '').split('/')
    .filter(p => p !== '' && p !== '.' && p !== '..' && !/^[a-zA-Z]:$/.test(p));
  const joined = parts.join('/').slice(0, maxLen);
  return joined || 'sin-nombre';
}

// ─── inflate (RFC 1951) con salida parcial ───────────────────────────────────
export interface InflateResult { out: Uint8Array; complete: boolean; end: number; error?: string }
class Stop extends Error {}
const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
interface Huff { count: Uint16Array; symbol: Uint16Array }
function build(lengths: number[]): Huff {
  const count = new Uint16Array(16), symbol = new Uint16Array(lengths.length);
  for (const l of lengths) count[l]++;
  const offs = new Uint16Array(16);
  for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + count[l];
  for (let s = 0; s < lengths.length; s++) if (lengths[s] !== 0) symbol[offs[lengths[s]]++] = s;
  return { count, symbol };
}
let FIXED: { lit: Huff; dist: Huff } | null = null;
const fixed = () => FIXED ??= (() => { const l: number[] = []; for (let i = 0; i < 288; i++) l.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8); return { lit: build(l), dist: build(new Array(30).fill(5)) }; })();

export function inflateRaw(src: Uint8Array, start = 0, maxOut = DEFAULT_LIMITS.maxEntryBytes): InflateResult {
  let p = start, bb = 0, bc = 0;
  let out = new Uint8Array(Math.min(Math.max(src.length * 4, 1024), maxOut)), n = 0;
  const bits = (need: number): number => {
    let v = bb;
    while (bc < need) { if (p >= src.length) throw new Stop('fin de datos antes de completar el flujo'); v |= src[p++] << bc; bc += 8; }
    bb = v >>> need; bc -= need; return v & ((1 << need) - 1);
  };
  const decode = (h: Huff): number => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len <= 15; len++) {
      code |= bits(1); const c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Stop('código Huffman inválido');
  };
  const put = (b: number) => {
    if (n >= out.length) {
      if (out.length >= maxOut) throw new Stop('límite de salida alcanzado (posible bomba de descompresión)');
      const bigger = new Uint8Array(Math.min(out.length * 2, maxOut)); bigger.set(out); out = bigger;
    }
    out[n++] = b;
  };
  try {
    let last = 0;
    do {
      last = bits(1); const type = bits(2);
      if (type === 0) {
        bb = 0; bc = 0;
        if (p + 4 > src.length) throw new Stop('bloque almacenado truncado');
        const len = src[p] | (src[p + 1] << 8), nlen = src[p + 2] | (src[p + 3] << 8); p += 4;
        if ((len ^ 0xffff) !== nlen) throw new Stop('longitud de bloque almacenado inconsistente');
        for (let i = 0; i < len; i++) { if (p >= src.length) throw new Stop('bloque almacenado truncado'); put(src[p++]); }
      } else if (type === 1 || type === 2) {
        let lit: Huff, dist: Huff;
        if (type === 1) ({ lit, dist } = fixed());
        else {
          const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
          if (nlen > 286 || ndist > 30) throw new Stop('tablas dinámicas inválidas');
          const cl = new Array(19).fill(0); for (let i = 0; i < ncode; i++) cl[CLORDER[i]] = bits(3);
          const clh = build(cl), lens: number[] = [];
          while (lens.length < nlen + ndist) {
            const sym = decode(clh);
            if (sym < 16) lens.push(sym);
            else {
              let prev = 0, rep: number;
              if (sym === 16) { if (!lens.length) throw new Stop('repetición sin valor previo'); prev = lens[lens.length - 1]; rep = 3 + bits(2); }
              else if (sym === 17) rep = 3 + bits(3); else rep = 11 + bits(7);
              if (lens.length + rep > nlen + ndist) throw new Stop('repetición de longitudes excede las tablas');
              for (let i = 0; i < rep; i++) lens.push(prev);
            }
          }
          lit = build(lens.slice(0, nlen)); dist = build(lens.slice(nlen));
        }
        for (;;) {
          const sym = decode(lit);
          if (sym < 256) put(sym);
          else if (sym === 256) break;
          else {
            const s = sym - 257; if (s >= 29) throw new Stop('símbolo de longitud inválido');
            const len = LBASE[s] + bits(LEXT[s]);
            const ds = decode(dist); if (ds >= 30) throw new Stop('símbolo de distancia inválido');
            const d = DBASE[ds] + bits(DEXT[ds]);
            if (d > n) throw new Stop('distancia anterior al inicio de los datos');
            for (let i = 0; i < len; i++) put(out[n - d]);
          }
        }
      } else throw new Stop('tipo de bloque reservado');
    } while (!last);
    return { out: out.slice(0, n), complete: true, end: p };
  } catch (e) {
    if (e instanceof Stop) return { out: out.slice(0, n), complete: false, end: p, error: e.message };
    throw e;
  }
}

/** Flujo zlib (RFC 1950). `adlerOk` indica si la suma de comprobación final coincide. */
export function inflateZlib(src: Uint8Array, start = 0, maxOut = DEFAULT_LIMITS.maxEntryBytes): InflateResult & { adlerOk: boolean | null } {
  if (src.length - start < 2) return { out: new Uint8Array(0), complete: false, end: start, error: 'flujo zlib vacío', adlerOk: null };
  const cmf = src[start], flg = src[start + 1];
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) return { out: new Uint8Array(0), complete: false, end: start, error: 'cabecera zlib inválida', adlerOk: null };
  const r = inflateRaw(src, start + 2 + ((flg & 0x20) ? 4 : 0), maxOut);
  let adlerOk: boolean | null = null;
  if (r.complete && r.end + 4 <= src.length) adlerOk = u32be(src, r.end) === adler32(r.out);
  return { ...r, adlerOk };
}

/**
 * Compresor Deflate propio (LZ77 con cadena de hash + Huffman fijo). Determinista: la misma entrada da siempre los mismos bytes.
 * Se usa para generar ejemplos con compresión REAL (el motor los descomprime con `inflateRaw`, no con una copia del original).
 */
export function deflateRawFixed(data: Uint8Array): Uint8Array {
  const out: number[] = []; let bb = 0, bc = 0;
  const put = (v: number, n: number) => { bb |= v << bc; bc += n; while (bc >= 8) { out.push(bb & 255); bb >>>= 8; bc -= 8; } };
  const huff = (code: number, len: number) => { for (let i = len - 1; i >= 0; i--) put((code >> i) & 1, 1); };
  const lit = (s: number) => { if (s < 144) huff(0x30 + s, 8); else if (s < 256) huff(0x190 + s - 144, 9); else if (s < 280) huff(s - 256, 7); else huff(0xc0 + s - 280, 8); };
  put(1, 1); put(1, 2);
  const head = new Int32Array(1 << 15).fill(-1), prev = new Int32Array(data.length).fill(-1);
  const hash = (i: number) => ((data[i] << 10) ^ (data[i + 1] << 5) ^ data[i + 2]) & 0x7fff;
  const insert = (i: number) => { if (i + 2 < data.length) { const h = hash(i); prev[i] = head[h]; head[h] = i; } };
  let i = 0;
  while (i < data.length) {
    let bestLen = 0, bestDist = 0;
    if (i + 2 < data.length) {
      let cand = head[hash(i)], tries = 24;
      while (cand >= 0 && tries-- > 0 && i - cand <= 32768) {
        let l = 0; while (l < 258 && i + l < data.length && data[cand + l] === data[i + l]) l++;
        if (l > bestLen) { bestLen = l; bestDist = i - cand; if (l === 258) break; }
        cand = prev[cand];
      }
    }
    if (bestLen >= 3) {
      let s = 28; while (LBASE[s] > bestLen) s--;
      lit(257 + s); put(bestLen - LBASE[s], LEXT[s]);
      let d = 29; while (DBASE[d] > bestDist) d--;
      huff(d, 5); put(bestDist - DBASE[d], DEXT[d]);
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
    } else { lit(data[i]); insert(i); i++; }
  }
  lit(256); if (bc > 0) out.push(bb & 255);
  return Uint8Array.from(out);
}
/** Flujo zlib (RFC 1950) con compresión Deflate real. */
export function deflateZlib(data: Uint8Array): Uint8Array {
  const ad = adler32(data);
  return concat([Uint8Array.of(0x78, 0x9c), deflateRawFixed(data), Uint8Array.of(ad >>> 24, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255)]);
}
/** Entropía de Shannon en bits por byte (0–8): ≈8 indica datos aleatorios o cifrados, sin estructura aprovechable. */
export function entropy(b: Uint8Array): number {
  if (!b.length) return 0;
  const c = new Uint32Array(256); for (let i = 0; i < b.length; i++) c[b[i]]++;
  let h = 0; for (let k = 0; k < 256; k++) if (c[k]) { const p = c[k] / b.length; h -= p * Math.log2(p); }
  return h;
}

/** Flujo zlib válido con bloques almacenados (sin compresión): para reparaciones deterministas. */
export function deflateStored(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(0x78, 0x01)];
  for (let o = 0; o < data.length || o === 0; o += 65535) {
    const chunk = data.subarray(o, Math.min(o + 65535, data.length)), last = o + 65535 >= data.length ? 1 : 0;
    parts.push(Uint8Array.of(last, chunk.length & 255, chunk.length >> 8, ~chunk.length & 255, (~chunk.length >> 8) & 255), chunk);
    if (last) break;
  }
  const ad = adler32(data); parts.push(Uint8Array.of(ad >>> 24, (ad >>> 16) & 255, (ad >>> 8) & 255, ad & 255));
  return concat(parts);
}
