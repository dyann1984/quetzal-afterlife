/**
 * Analizadores estructurales de GIF, BMP y WAV.
 * Se verifica la ESTRUCTURA (cabeceras, bloques, tamaños declarados contra los presentes). No se decodifica LZW
 * (GIF) ni se interpretan los datos de muestra (WAV), así que el contenido de píxeles/audio nunca se marca verificado.
 */
import { damaged, matches, u16le, u32le, type DamagedRange, type FileFinding } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

const MAX_PIXELS = 1 << 28;
const bad = (code: string, message: string, offset?: number): FileFinding => ({ severity: 'dano', code, message, offset });

// ── GIF ─────────────────────────────────────────────────────────────────────
export function analyzeGif(b: Uint8Array): AnalysisResult {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['No hay decodificación LZW: se verifica la estructura de bloques, no los píxeles de cada cuadro.'];
  if (!(matches(b, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || matches(b, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) || b.length < 13)
    return { integrity: 'irrecuperable', findings: [bad('firma_invalida', 'Cabecera GIF87a/GIF89a ausente o incompleta.', 0)], damaged: [damaged(0, Math.min(6, b.length), 'cabecera inválida')], items, limitations };
  const w = u16le(b, 6), h = u16le(b, 8), flags = b[10];
  let p = 13;
  if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
  if (w < 1 || h < 1) findings.push(bad('dimensiones_invalidas', `Dimensiones inválidas (${w}×${h}).`, 6));
  // Recorre sub-bloques (longitud + datos) hasta el terminador 0. Devuelve la posición tras él, o -1 si se corta.
  const skipSub = (q: number): number => { while (q < b.length) { const n = b[q]; if (n === 0) return q + 1; q += 1 + n; if (q > b.length) return -1; } return -1; };
  let frames = 0, trailer = -1, lastGoodEnd = Math.min(p, b.length), cut = -1, comments = 0;
  if (p > b.length) { findings.push(bad('tabla_color_truncada', 'La tabla de colores global se corta antes de terminar.', 13)); cut = 13; }
  while (cut < 0 && p < b.length) {
    const t = b[p];
    if (t === 0x3b) { trailer = p; break; }
    if (t === 0x21) {
      if (p + 2 > b.length) { cut = p; break; }
      const label = b[p + 1], q = skipSub(p + 2);
      if (q < 0) { cut = p; break; }
      if (label === 0xfe) comments++;
      p = q; lastGoodEnd = p; continue;
    }
    if (t === 0x2c) {
      if (p + 10 > b.length) { cut = p; break; }
      let q = p + 10; const lf = b[p + 9];
      if (lf & 0x80) q += 3 * (1 << ((lf & 7) + 1));
      if (q + 1 > b.length) { cut = p; break; }
      q = skipSub(q + 1);
      if (q < 0) { cut = p; break; }
      frames++; p = q; lastGoodEnd = p; continue;
    }
    findings.push(bad('bloque_desconocido', `Byte 0x${t.toString(16)} en ${p}: no es un bloque GIF válido.`, p));
    dmg.push(damaged(p, b.length, 'estructura de bloques interrumpida')); cut = p; break;
  }
  if (cut >= 0 && !dmg.length) { findings.push(bad('bloque_truncado', `Un bloque en ${cut} se corta antes de terminar.`, cut)); dmg.push(damaged(cut, Math.max(b.length, cut + 1), 'bloque truncado')); }
  if (trailer < 0 && cut < 0) { findings.push(bad('sin_trailer', 'Falta el terminador 0x3B.', b.length)); dmg.push(damaged(b.length, b.length + 1, 'terminador ausente')); }
  else if (trailer >= 0 && trailer + 1 < b.length) findings.push({ severity: 'info', code: 'datos_tras_trailer', message: `Hay ${b.length - trailer - 1} bytes tras el terminador (se ignoran).`, offset: trailer + 1 });
  if (frames === 0) findings.push(bad('sin_cuadros', 'No se encontró ningún cuadro de imagen completo.'));
  items.push({ kind: 'metadatos', name: 'pantalla lógica', size: 0, verified: true, basis: 'cabecera GIF consistente', preview: `${w}×${h} px, ${frames} cuadro(s) completo(s)` });
  const closed = trailer >= 0 && cut < 0;
  const integrity = frames === 0 ? (w > 0 && h > 0 ? 'danado' : 'irrecuperable') : closed ? 'integro' : 'parcial';
  let repaired: AnalysisResult['repaired'];
  if (!closed && frames > 0) {
    const out = new Uint8Array(lastGoodEnd + 1); out.set(b.subarray(0, lastGoodEnd)); out[lastGoodEnd] = 0x3b;
    repaired = { name: 'reparado.gif', bytes: out, structureVerified: analyzeGif(out).integrity === 'integro',
      note: `Se conservaron los ${frames} cuadro(s) completos y se añadió el terminador 0x3B; lo posterior al último bloque íntegro se descartó. Los píxeles no se decodificaron.` };
  }
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: { ancho: w, alto: h, cuadros: frames, comentarios: comments } };
}

// ── BMP ─────────────────────────────────────────────────────────────────────
export function analyzeBmp(b: Uint8Array): AnalysisResult {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['Solo se calcula el tamaño de filas sin compresión; los BMP con RLE se validan únicamente por cabecera.', 'Las filas ausentes no se pueden reconstruir: la reparación las rellena con ceros.'];
  if (!matches(b, 0, [0x42, 0x4d]) || b.length < 26)
    return { integrity: 'irrecuperable', findings: [bad('firma_invalida', 'Cabecera BM ausente o incompleta.', 0)], damaged: [damaged(0, Math.min(2, b.length), 'cabecera inválida')], items, limitations };
  const declared = u32le(b, 2), offBits = u32le(b, 10), dib = u32le(b, 14);
  if (dib !== 12 && dib < 40) return { integrity: 'irrecuperable', findings: [bad('dib_invalida', `Tamaño de cabecera DIB no reconocido (${dib}).`, 14)], damaged: [damaged(14, Math.min(b.length, 18), 'DIB inválida')], items, limitations };
  const core = dib === 12;
  if (b.length < 14 + (core ? 12 : 40)) return { integrity: 'danado', findings: [bad('cabecera_truncada', 'La cabecera DIB está incompleta.', 14)], damaged: [damaged(14, b.length, 'cabecera truncada')], items, limitations };
  const w = core ? u16le(b, 18) : u32le(b, 18) | 0, hRaw = core ? u16le(b, 20) : u32le(b, 22) | 0, h = Math.abs(hRaw);
  const bpp = u16le(b, core ? 22 : 28), comp = core ? 0 : u32le(b, 30);
  if (w < 1 || h < 1 || w * h > MAX_PIXELS) return { integrity: 'danado', findings: [bad('dimensiones_invalidas', `Dimensiones fuera de rango (${w}×${hRaw}).`, 18)], damaged: [damaged(18, 26, 'dimensiones')], items, limitations };
  if (![1, 4, 8, 16, 24, 32].includes(bpp)) findings.push(bad('bpp_invalido', `Bits por píxel no válidos (${bpp}).`, core ? 22 : 28));
  items.push({ kind: 'metadatos', name: 'cabecera BMP', size: 0, verified: true, basis: 'cabeceras BM + DIB consistentes', preview: `${w}×${h} px, ${bpp} bpp` });
  const uncompressed = comp === 0 || comp === 3;
  const rowSize = Math.ceil((w * bpp) / 32) * 4, need = offBits + rowSize * h;
  let integrity: AnalysisResult['integrity'] = 'integro', repaired: AnalysisResult['repaired'];
  let rows = h;
  if (offBits < 14 + dib || offBits > b.length) { findings.push(bad('offset_invalido', `El inicio de píxeles declarado (${offBits}) cae fuera del archivo.`, 10)); integrity = 'danado'; rows = 0; dmg.push(damaged(10, 14, 'offset de píxeles')); }
  else if (uncompressed && b.length < need) {
    rows = Math.floor((b.length - offBits) / rowSize);
    findings.push(bad('filas_ausentes', `Faltan ${h - rows} de ${h} filas: el archivo mide ${b.length} B y se esperaban ${need} B.`, b.length));
    dmg.push(damaged(offBits + rows * rowSize, need, `${h - rows} fila(s) ausente(s)`)); integrity = rows > 0 ? 'parcial' : 'danado';
    if (rows > 0) {
      const out = new Uint8Array(need); out.set(b.subarray(0, offBits + rows * rowSize));
      out[2] = need & 0xff; out[3] = (need >>> 8) & 0xff; out[4] = (need >>> 16) & 0xff; out[5] = (need >>> 24) & 0xff;
      repaired = { name: 'reparado.bmp', bytes: out, structureVerified: analyzeBmp(out).integrity === 'integro',
        note: `Las ${h - rows} fila(s) ausentes se rellenaron con ceros (no son datos recuperados) y se corrigió el tamaño de archivo declarado.` };
    }
  } else if (declared !== b.length) findings.push({ severity: 'aviso', code: 'tamano_declarado', message: `El tamaño declarado (${declared} B) no coincide con el real (${b.length} B).`, offset: 2 });
  if (rows > 0 && uncompressed) items.push({ kind: 'imagen-parcial', name: `${rows} de ${h} filas`, size: rows * rowSize, verified: false, basis: 'filas presentes por aritmética de tamaño; el BMP sin compresión no lleva suma de comprobación' });
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: { ancho: w, alto: h, bpp, compresion: comp, arribaAbajo: hRaw < 0 ? 1 : 0, filasPresentes: rows } };
}

// ── WAV ─────────────────────────────────────────────────────────────────────
export function analyzeWav(b: Uint8Array): AnalysisResult {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['No se reproduce ni decodifica el audio; las muestras PCM no tienen suma de comprobación.', 'Tras un corte, la reparación recorta el audio a un número entero de muestras y corrige los tamaños declarados.'];
  if (!matches(b, 0, [0x52, 0x49, 0x46, 0x46]) || !matches(b, 8, [0x57, 0x41, 0x56, 0x45]) || b.length < 12)
    return { integrity: 'irrecuperable', findings: [bad('firma_invalida', 'Cabecera RIFF/WAVE ausente.', 0)], damaged: [damaged(0, Math.min(12, b.length), 'cabecera inválida')], items, limitations };
  let p = 12, fmt: { tag: number; ch: number; rate: number; byteRate: number; align: number; bits: number } | null = null;
  let dataAt = -1, dataDeclared = 0, dataAvail = 0;
  while (p + 8 <= b.length) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), size = u32le(b, p + 4), body = p + 8;
    if (!/^[\x20-\x7e]{4}$/.test(id)) { findings.push(bad('chunk_invalido', `Identificador de chunk no válido en ${p}.`, p)); dmg.push(damaged(p, b.length, 'estructura RIFF interrumpida')); break; }
    if (id === 'fmt ' && size >= 16 && body + 16 <= b.length) fmt = { tag: u16le(b, body), ch: u16le(b, body + 2), rate: u32le(b, body + 4), byteRate: u32le(b, body + 8), align: u16le(b, body + 12), bits: u16le(b, body + 14) };
    if (id === 'data') { dataAt = body; dataDeclared = size; dataAvail = Math.min(size, b.length - body); break; }
    p = body + size + (size & 1);
  }
  if (!fmt) findings.push(bad('sin_fmt', 'Falta el chunk "fmt " (o está truncado): sin formato no se puede interpretar el audio.'));
  else {
    if (fmt.ch < 1 || fmt.align < 1) findings.push(bad('fmt_invalido', 'Canales o alineación de bloque en cero.'));
    items.push({ kind: 'metadatos', name: 'formato de audio', size: 16, verified: true, basis: 'chunk fmt íntegro', preview: `${fmt.ch} canal(es), ${fmt.rate} Hz, ${fmt.bits} bits, ${fmt.tag === 1 ? 'PCM' : `codec ${fmt.tag}`}` });
    if (fmt.rate * fmt.align !== fmt.byteRate) findings.push({ severity: 'aviso', code: 'byterate_incoherente', message: 'ByteRate no coincide con frecuencia × alineación.' });
  }
  if (dataAt < 0) findings.push(bad('sin_data', 'No hay chunk "data": no existe audio que recuperar.'));
  const usable = fmt && fmt.align > 0 ? dataAvail - (dataAvail % fmt.align) : dataAvail;
  const truncated = dataAt >= 0 && dataAvail < dataDeclared;
  if (truncated) { findings.push(bad('data_truncado', `El chunk data declara ${dataDeclared} B y solo hay ${dataAvail} B.`, b.length)); dmg.push(damaged(dataAt + dataAvail, dataAt + dataDeclared, 'muestras de audio ausentes')); }
  const riffDeclared = u32le(b, 4);
  if (!truncated && riffDeclared + 8 !== b.length && dataAt >= 0) findings.push({ severity: 'aviso', code: 'riff_tamano', message: `El tamaño RIFF declarado (${riffDeclared + 8} B) no coincide con el real (${b.length} B).`, offset: 4 });
  if (fmt && fmt.byteRate > 0 && usable > 0) items.push({ kind: 'imagen-parcial', name: 'muestras de audio', size: usable, verified: false, basis: 'bytes presentes; el PCM no lleva suma de comprobación', preview: `${(usable / fmt.byteRate).toFixed(2)} s presentes de ${(dataDeclared / fmt.byteRate).toFixed(2)} s declarados` });
  const integrity: AnalysisResult['integrity'] = !fmt || dataAt < 0 ? (fmt ? 'danado' : 'irrecuperable') : usable === 0 ? 'danado' : truncated ? 'parcial' : 'integro';
  let repaired: AnalysisResult['repaired'];
  if (truncated && fmt && usable > 0) {
    const out = new Uint8Array(dataAt + usable); out.set(b.subarray(0, dataAt + usable));
    const wr = (o: number, v: number) => { out[o] = v & 0xff; out[o + 1] = (v >>> 8) & 0xff; out[o + 2] = (v >>> 16) & 0xff; out[o + 3] = (v >>> 24) & 0xff; };
    wr(4, out.length - 8); wr(dataAt - 4, usable);
    repaired = { name: 'reparado.wav', bytes: out, structureVerified: analyzeWav(out).integrity === 'integro',
      note: `Se recortó el audio a ${usable} B (muestras completas) y se corrigieron los tamaños RIFF y data. Lo ausente no se recupera. No se probó con un reproductor externo.` };
  }
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: fmt ? { canales: fmt.ch, hz: fmt.rate, bits: fmt.bits, bytesAudio: usable } : {} };
}

export const gifAnalyzer: Analyzer = { id: 'gif', label: 'GIF', analyze: b => analyzeGif(b) };
export const bmpAnalyzer: Analyzer = { id: 'bmp', label: 'BMP', analyze: b => analyzeBmp(b) };
export const wavAnalyzer: Analyzer = { id: 'wav', label: 'WAV', analyze: b => analyzeWav(b) };
