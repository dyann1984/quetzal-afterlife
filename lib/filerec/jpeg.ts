/**
 * Analizador JPEG: recorrido de marcadores, dimensiones, tablas y datos de escaneo; reparación del final.
 * IMPORTANTE: no hay decodificador de entropía. Se verifica la ESTRUCTURA; cuántos píxeles son legibles
 * tras un corte NO se puede afirmar, y así se informa.
 */
import { damaged, matches, u16be, type DamagedRange, type FileFinding } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function analyzeJpeg(b: Uint8Array): AnalysisResult {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['No hay decodificación de píxeles: se verifica la estructura de marcadores, no la imagen.', 'Tras un corte, la parte de la imagen que un visor logra mostrar no se puede predecir ni garantizar.'];
  if (!matches(b, 0, [0xff, 0xd8, 0xff])) return { integrity: 'irrecuperable', findings: [{ severity: 'dano', code: 'firma_invalida', message: 'No comienza con SOI (FF D8 FF).', offset: 0 }], damaged: [damaged(0, Math.min(3, b.length), 'SOI inválido')], items, limitations };
  let p = 2, sof: { w: number; h: number; comps: number; precision: number; progressive: boolean } | null = null;
  let hasDQT = false, hasDHT = false, scans = 0, entropyBytes = 0, eoi = -1, cut = -1, lastGoodEnd = 2, app = '';
  while (p < b.length) {
    if (b[p] !== 0xff) { findings.push({ severity: 'dano', code: 'marcador_esperado', message: `Se esperaba un marcador en ${p} y hay un byte 0x${b[p].toString(16)}.`, offset: p }); dmg.push(damaged(p, b.length, 'estructura de marcadores interrumpida')); cut = p; break; }
    while (p + 1 < b.length && b[p + 1] === 0xff) p++;
    if (p + 1 >= b.length) { cut = p; break; }
    const m = b[p + 1];
    if (m === 0xd9) { eoi = p; lastGoodEnd = p + 2; break; }
    if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { p += 2; continue; }
    if (p + 4 > b.length) { cut = p; break; }
    const len = u16be(b, p + 2);
    if (len < 2 || p + 2 + len > b.length) { findings.push({ severity: 'dano', code: 'segmento_truncado', message: `El segmento 0x${m.toString(16).toUpperCase()} declara ${len} bytes y el archivo termina antes.`, offset: p }); dmg.push(damaged(p, b.length, 'segmento truncado')); cut = p; break; }
    if (SOF.has(m)) sof = { precision: b[p + 4], h: u16be(b, p + 5), w: u16be(b, p + 7), comps: b[p + 9], progressive: m === 0xc2 || m === 0xc6 || m === 0xca || m === 0xce };
    else if (m === 0xdb) hasDQT = true;
    else if (m === 0xc4) hasDHT = true;
    else if (m === 0xe0 && matches(b, p + 4, [0x4a, 0x46, 0x49, 0x46])) app = 'JFIF';
    else if (m === 0xe1 && matches(b, p + 4, [0x45, 0x78, 0x69, 0x66])) app = app ? `${app}+Exif` : 'Exif';
    else if (m === 0xfe) items.push({ kind: 'texto', name: 'comentario COM', size: len - 2, verified: true, basis: 'segmento COM íntegro dentro de la estructura', preview: String.fromCharCode(...b.subarray(p + 4, Math.min(p + 2 + len, p + 204))).replace(/[^\x20-\x7e]/g, '·') });
    lastGoodEnd = p + 2 + len;
    if (m === 0xda) {
      scans++; let i = p + 2 + len; const start = i;
      for (; i + 1 < b.length; i++) { if (b[i] === 0xff) { const nb = b[i + 1]; if (nb === 0x00 || (nb >= 0xd0 && nb <= 0xd7)) { i++; continue; } if (nb === 0xff) continue; break; } }
      if (i + 1 >= b.length) { entropyBytes += b.length - start; lastGoodEnd = b.length; cut = b.length; p = b.length; break; }
      entropyBytes += i - start; lastGoodEnd = i; p = i; continue;
    }
    p += 2 + len;
  }
  if (eoi < 0) {
    findings.push({ severity: 'dano', code: 'sin_eoi', message: 'Falta el marcador EOI (FF D9): el archivo está truncado.', offset: b.length });
    dmg.push(damaged(Math.min(lastGoodEnd, b.length), Math.max(b.length, lastGoodEnd + 1), 'final del archivo ausente (EOI)'));
  } else if (eoi + 2 < b.length) findings.push({ severity: 'info', code: 'datos_tras_eoi', message: `Hay ${b.length - eoi - 2} bytes tras EOI (se ignoran).`, offset: eoi + 2 });
  if (!sof) findings.push({ severity: 'dano', code: 'sin_sof', message: 'No se encontró SOF: sin dimensiones no se puede decodificar.' });
  else if (sof.w < 1 || sof.h < 1) findings.push({ severity: 'dano', code: 'dimensiones_invalidas', message: `Dimensiones inválidas (${sof.w}×${sof.h}).` });
  if (!hasDQT) findings.push({ severity: 'dano', code: 'sin_dqt', message: 'Faltan tablas de cuantización (DQT).' });
  if (!hasDHT && !(sof?.progressive === false && false)) findings.push({ severity: 'dano', code: 'sin_dht', message: 'Faltan tablas de Huffman (DHT).' });
  if (!scans) findings.push({ severity: 'dano', code: 'sin_sos', message: 'No hay datos de escaneo (SOS): no existe contenido de imagen.' });
  if (sof) items.push({ kind: 'metadatos', name: 'SOF', size: 0, verified: true, basis: 'cabecera SOF dentro de una estructura de marcadores consistente', preview: `${sof.w}×${sof.h} px, ${sof.comps} componente(s), ${sof.precision} bits${sof.progressive ? ', progresivo' : ''}${app ? `, ${app}` : ''}` });
  if (entropyBytes > 0) items.push({ kind: 'imagen-parcial', name: 'datos de escaneo', size: entropyBytes, verified: false, basis: 'bytes de escaneo presentes; sin decodificador de entropía no se verifica cuántos píxeles son legibles', preview: `${entropyBytes.toLocaleString('es-MX')} bytes de datos de imagen` });

  const structural = !!sof && hasDQT && hasDHT && scans > 0;
  const integrity = !structural ? (sof ? 'danado' : 'irrecuperable') : eoi >= 0 && cut < 0 ? 'integro' : 'parcial';
  let repaired: AnalysisResult['repaired'];
  if (structural && eoi < 0 && cut >= 0 && entropyBytes > 0) {
    const out = new Uint8Array(b.length + 2); out.set(b); out[b.length] = 0xff; out[b.length + 1] = 0xd9;
    const re = analyzeJpeg(out);
    repaired = { name: 'reparado.jpg', bytes: out, structureVerified: re.integrity === 'integro',
      note: 'Se añadió el marcador EOI al final. Los visores suelen mostrar la parte presente y rellenar el resto; los píxeles posteriores al corte no existen en el archivo. No se probó con un visor externo.' };
  }
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: sof ? { ancho: sof.w, alto: sof.h, escaneos: scans, bytesEscaneo: entropyBytes, extension: eoi >= 0 ? eoi + 2 : Math.min(lastGoodEnd, b.length) } : { escaneos: scans, extension: Math.min(lastGoodEnd, b.length) } };
}
export const jpegAnalyzer: Analyzer = { id: 'jpeg', label: 'JPEG', analyze: b => analyzeJpeg(b) };

