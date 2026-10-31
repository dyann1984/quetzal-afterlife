/**
 * Carving por firmas sobre una imagen en bruto (solo lectura, sobre una copia en memoria).
 * Localiza PNG, JPEG, PDF y ZIP/Office incrustados, delimita su extensión por la propia estructura del formato
 * y los analiza. NO interpreta sistemas de archivos (FAT/NTFS/ext) ni reensambla archivos fragmentados:
 * un archivo cuyos bloques no sean contiguos se reportará truncado o dañado.
 */
import { Deadline, DEFAULT_LIMITS, indexOfSeq, matches, SECTOR, u16le, u32le, type Limits } from './core';
import { analyzeJpeg } from './jpeg';
import { walkPngChunks } from './png';
import type { Integrity } from './types';

export interface Carved {
  offset: number; length: number; sectorStart: number; sectorEnd: number; aligned: boolean;
  format: 'png' | 'jpeg' | 'pdf' | 'zip'; endFound: boolean;
  bytes: Uint8Array;                      // vista (no copia) del rango carvado
  integrity?: Integrity; sha256?: string;
}
export interface CarveResult { candidates: Carved[]; scanned: number; truncatedScan: boolean; notes: string[] }

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], PDF = [0x25, 0x50, 0x44, 0x46, 0x2d], LOC = [0x50, 0x4b, 0x03, 0x04], EOCD = [0x50, 0x4b, 0x05, 0x06];

export function carve(disk: Uint8Array, lim: Limits = DEFAULT_LIMITS, dl: Deadline = new Deadline(lim.maxMillis)): CarveResult {
  const out: Carved[] = [], notes: string[] = []; let i = 0, truncated = false;
  const push = (format: Carved['format'], start: number, length: number, endFound: boolean) => out.push({ offset: start, length, sectorStart: Math.floor(start / SECTOR), sectorEnd: Math.floor((start + length - 1) / SECTOR), aligned: start % SECTOR === 0, format, endFound, bytes: disk.subarray(start, start + length) });
  while (i < disk.length - 4) {
    if (dl.expired || out.length >= lim.maxEntries) { truncated = true; notes.push(dl.expired ? 'Presupuesto de tiempo agotado: el escaneo es parcial.' : `Límite de ${lim.maxEntries} candidatos alcanzado.`); break; }
    const c = disk[i];
    if (c !== 0x89 && c !== 0xff && c !== 0x25 && c !== 0x50) { i++; continue; }
    if (matches(disk, i, PNG)) {
      const ch = walkPngChunks(disk.subarray(i)), last = ch[ch.length - 1];
      if (ch.length && ch[0].type === 'IHDR') { const done = last.type === 'IEND' && last.crcOk, len = done ? last.offset + 12 + last.length : last.complete ? last.offset + 12 + last.length : last.offset; if (len > 33) { push('png', i, len, done); i += done ? len : 8; continue; } }
    } else if (c === 0xff && disk[i + 1] === 0xd8 && disk[i + 2] === 0xff) {
      const window = disk.subarray(i, Math.min(disk.length, i + 16 * 1024 * 1024)), r = analyzeJpeg(window), ext = Number(r.meta?.extension ?? 0);
      if (r.items.some(x => x.name === 'SOF') && ext > 100) { const done = !r.findings.some(f => f.code === 'sin_eoi'); push('jpeg', i, ext, done); i += done ? ext : 3; continue; }
    } else if (matches(disk, i, PDF)) {
      let next = indexOfSeq(disk, PDF, i + 5); if (next < 0) next = disk.length;
      let eof = -1; for (let p = i; ;) { const q = indexOfSeq(disk, [0x25, 0x25, 0x45, 0x4f, 0x46], p, next); if (q < 0) break; eof = q; p = q + 5; }
      if (eof >= 0) { let end = eof + 5; while (end < next && (disk[end] === 0x0a || disk[end] === 0x0d)) end++; push('pdf', i, end - i, true); i = end; continue; }
      push('pdf', i, Math.min(next - i, lim.maxFileBytes), false); i += 5; continue;
    } else if (matches(disk, i, LOC)) {
      let e = indexOfSeq(disk, EOCD, i + 30), found = -1;
      while (e >= 0) { const cdOff = u32le(disk, e + 16), cdSize = u32le(disk, e + 12); if (i + cdOff + 4 <= e && matches(disk, i + cdOff, [0x50, 0x4b, 0x01, 0x02]) && i + cdOff + cdSize <= e) { found = e; break; } e = indexOfSeq(disk, EOCD, e + 4); }
      if (found >= 0) { const end = found + 22 + u16le(disk, found + 20); push('zip', i, Math.min(end, disk.length) - i, true); i = Math.min(end, disk.length); continue; }
      push('zip', i, Math.min(lim.maxFileBytes, 64 * 1024, disk.length - i), false); i += 4; continue;
    }
    i++;
  }
  return { candidates: out, scanned: Math.min(i, disk.length), truncatedScan: truncated, notes: [...notes, 'Solo archivos contiguos: no hay reensamblado de fragmentos ni lectura de sistemas de archivos.', 'Un candidato es un hallazgo por firma; "recuperable" solo se afirma tras analizarlo.'] };
}
