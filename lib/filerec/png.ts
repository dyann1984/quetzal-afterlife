/**
 * Analizador PNG: CRC-32 por chunk, estructura IHDR/IDAT/IEND, decodificación de filas y reparación verificada.
 * Recuperable = filas cuyo flujo IDAT está íntegro (CRC de los chunks + inflate correcto + byte de filtro válido).
 * No se inventan píxeles: las filas ausentes no existen en el archivo y no se reconstruyen.
 */
import { concat, crc32, damaged, deflateStored, inflateZlib, matches, u32be, DEFAULT_LIMITS, type DamagedRange, type FileFinding } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
export interface Chunk { type: string; offset: number; length: number; crcOk: boolean; complete: boolean }

function walk(b: Uint8Array): Chunk[] {
  const out: Chunk[] = []; let p = 8;
  while (p + 8 <= b.length && out.length < 100000) {
    const len = u32be(b, p), type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) break;
    const complete = len <= 0x7fffffff && p + 12 + len <= b.length;
    const crcOk = complete && crc32(b, p + 4, p + 8 + len) === u32be(b, p + 8 + len);
    out.push({ type, offset: p, length: len, crcOk, complete });
    if (!complete) break;
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function chunkBytes(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8); dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length)); return out;
}

export function analyzePng(b: Uint8Array, verifyOnly = false): AnalysisResult {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['Imágenes entrelazadas (Adam7) no se decodifican por filas.', 'No se renderiza la imagen: se verifica estructura, CRC y flujo comprimido.'];
  if (!matches(b, 0, SIG)) return { integrity: 'irrecuperable', findings: [{ severity: 'dano', code: 'firma_invalida', message: 'La firma PNG de 8 bytes no es válida.', offset: 0 }], damaged: [damaged(0, Math.min(8, b.length), 'firma PNG inválida')], items, limitations };
  const chunks = walk(b);
  const ihdr = chunks.find(c => c.type === 'IHDR');
  if (!ihdr || !ihdr.crcOk || ihdr.length !== 13) {
    findings.push({ severity: 'dano', code: 'ihdr_invalido', message: 'IHDR ausente, con CRC incorrecto o de longitud inválida: sin dimensiones no se puede interpretar la imagen.', offset: 8 });
    dmg.push(damaged(8, Math.min(b.length, 33), 'IHDR inválido'));
    return { integrity: 'irrecuperable', findings, damaged: dmg, items, limitations };
  }
  const w = u32be(b, ihdr.offset + 8), h = u32be(b, ihdr.offset + 12), depth = b[ihdr.offset + 16], ctype = b[ihdr.offset + 17], interlace = b[ihdr.offset + 20];
  const channels = CHANNELS[ctype];
  if (!channels || ![1, 2, 4, 8, 16].includes(depth) || w < 1 || h < 1 || w > 16384 || h > 16384) {
    findings.push({ severity: 'dano', code: 'ihdr_fuera_de_rango', message: `Parámetros IHDR no admitidos (${w}×${h}, profundidad ${depth}, color ${ctype}).`, offset: ihdr.offset });
    return { integrity: 'irrecuperable', findings, damaged: [damaged(ihdr.offset, ihdr.offset + 25, 'IHDR fuera de rango')], items, limitations };
  }
  const rowBytes = Math.ceil((w * channels * depth) / 8) + 1;
  items.push({ kind: 'metadatos', name: 'IHDR', size: 13, verified: true, basis: 'CRC-32 del chunk IHDR válido', preview: `${w}×${h} px, ${depth} bits, tipo de color ${ctype}${interlace ? ', entrelazado' : ''}` });

  let bad = 0;
  for (const c of chunks) {
    if (!c.complete) { findings.push({ severity: 'dano', code: 'chunk_truncado', message: `El chunk ${c.type} se declara de ${c.length} bytes pero el archivo termina antes.`, offset: c.offset }); dmg.push(damaged(c.offset, b.length, `chunk ${c.type} truncado`)); bad++; }
    else if (!c.crcOk) { findings.push({ severity: 'dano', code: 'crc_invalido', message: `CRC-32 incorrecto en el chunk ${c.type}.`, offset: c.offset }); dmg.push(damaged(c.offset, c.offset + 12 + c.length, `CRC inválido en ${c.type}`)); bad++; }
  }
  const last = chunks[chunks.length - 1], iendOk = !!last && last.type === 'IEND' && last.crcOk;
  if (!iendOk && !chunks.some(c => !c.complete)) { findings.push({ severity: 'dano', code: 'sin_iend', message: 'Falta el chunk IEND: el archivo está truncado o no termina correctamente.', offset: b.length }); dmg.push(damaged(chunks.length ? last.offset + 12 + last.length : 8, Math.max(b.length, 9), 'IEND ausente')); }
  if (iendOk && last.offset + 12 + last.length < b.length) findings.push({ severity: 'info', code: 'datos_tras_iend', message: `Hay ${b.length - last.offset - 12 - last.length} bytes tras IEND (se ignoran).`, offset: last.offset + 12 });

  for (const c of chunks) if (c.type === 'tEXt' && c.crcOk) {
    const d = b.subarray(c.offset + 8, c.offset + 8 + c.length), z = d.indexOf(0);
    if (z > 0) items.push({ kind: 'texto', name: `tEXt:${String.fromCharCode(...d.subarray(0, Math.min(z, 80)))}`, size: d.length - z - 1, verified: true, basis: 'CRC-32 del chunk tEXt válido', preview: String.fromCharCode(...d.subarray(z + 1, Math.min(d.length, z + 201))) });
  }

  // Flujo IDAT: solo el prefijo contiguo de chunks IDAT íntegros es fiable
  const idats = chunks.filter(c => c.type === 'IDAT');
  const good: Uint8Array[] = []; let stream = true;
  for (const c of idats) { if (stream && c.crcOk) good.push(b.subarray(c.offset + 8, c.offset + 8 + c.length)); else stream = false; }
  if (idats.length && good.length < idats.length) findings.push({ severity: 'dano', code: 'idat_interrumpido', message: `Solo ${good.length} de ${idats.length} chunks IDAT son utilizables; los posteriores a un daño no se usan (el flujo comprimido depende de los bytes anteriores).` });
  if (interlace) { findings.push({ severity: 'aviso', code: 'entrelazado', message: 'PNG entrelazado: se verifica la estructura pero no se recuperan filas.' }); return { integrity: bad || !iendOk ? 'parcial' : 'integro', findings, damaged: dmg, items, limitations }; }
  if (!good.length) { findings.push({ severity: 'dano', code: 'sin_idat', message: 'No hay datos de imagen (IDAT) utilizables.' }); return { integrity: 'irrecuperable', findings, damaged: dmg, items, limitations }; }

  const z = inflateZlib(concat(good), 0, Math.min(DEFAULT_LIMITS.maxEntryBytes, rowBytes * h + 16));
  // filas completas con byte de filtro válido (0..4)
  let rows = Math.min(h, Math.floor(z.out.length / rowBytes)), validRows = 0;
  for (; validRows < rows; validRows++) if (z.out[validRows * rowBytes] > 4) break;
  if (validRows < rows) { findings.push({ severity: 'dano', code: 'filtro_invalido', message: `Byte de filtro inválido en la fila ${validRows + 1}: las filas desde ahí no son fiables.` }); rows = validRows; }
  if (!z.complete && z.error) findings.push({ severity: 'dano', code: 'flujo_idat_danado', message: `El flujo comprimido termina antes de lo declarado: ${z.error}.` });
  const lost = h - rows;
  const full = rows === h && bad === 0 && iendOk && z.complete && z.adlerOk === true && z.out.length === rowBytes * h;
  if (lost > 0) findings.push({ severity: 'dano', code: 'filas_ausentes', message: `Se recuperan ${rows} de ${h} filas; las ${lost} restantes no existen en el archivo y no se reconstruyen.` });

  if (rows > 0) items.push({ kind: 'imagen-parcial', name: rows === h ? 'imagen completa' : `filas 1–${rows} de ${h}`, size: rows * rowBytes, verified: true,
    basis: `${rows} filas decodificadas de un flujo IDAT con CRC válido, filtros válidos${z.adlerOk ? ' y Adler-32 correcto' : ''}`, preview: `${w}×${rows} px recuperables (${((rows / h) * 100).toFixed(1)} % de la altura)` });

  let repaired: AnalysisResult['repaired'];
  if (!full && rows > 0 && !verifyOnly) {
    const plte = chunks.find(c => c.type === 'PLTE' && c.crcOk);
    const ih = b.slice(ihdr.offset + 8, ihdr.offset + 21); new DataView(ih.buffer).setUint32(4, rows);
    const out = concat([Uint8Array.from(SIG), chunkBytes('IHDR', ih), ...(plte ? [b.subarray(plte.offset, plte.offset + 12 + plte.length)] : []), chunkBytes('IDAT', deflateStored(z.out.subarray(0, rows * rowBytes))), chunkBytes('IEND', new Uint8Array(0))]);
    const re = analyzePng(out, true), reRows = re.items.find(i => i.kind === 'imagen-parcial');
    repaired = { name: 'reparado.png', bytes: out, structureVerified: re.integrity === 'integro' && !!reRows && reRows.size === rows * rowBytes,
      note: `PNG nuevo con las ${rows} filas íntegras (altura ${rows}). Estructura y CRC verificados al re-analizarlo; no se comprobó con un visor externo.` };
  }
  return { integrity: full ? 'integro' : rows > 0 ? (rows === h ? 'danado' : 'parcial') : 'irrecuperable', findings, damaged: dmg, items, repaired, limitations,
    meta: { ancho: w, alto: h, filasRecuperables: rows, chunks: chunks.length } };
}

export const pngAnalyzer: Analyzer = { id: 'png', label: 'PNG', analyze: b => analyzePng(b) };
export { walk as walkPngChunks };

