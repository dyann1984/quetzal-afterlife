/**
 * Analizador PDF: escaneo de objetos, xref/trailer, flujos Flate (con Adler-32), texto de operadores Tj/TJ
 * y reconstrucción de xref cuando el catálogo es localizable.
 * Recuperable = texto de flujos Flate completos con Adler-32 correcto. No se interpretan fuentes ni imágenes.
 */
import { damaged, Deadline, DEFAULT_LIMITS, inflateZlib, latin1, type DamagedRange, type FileFinding, type Limits } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

interface Obj { num: number; gen: number; start: number; end: number; complete: boolean }

function unescapePdf(s: string): string {
  return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, (_, c: string) => c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : c === 'b' ? '\b' : c === 'f' ? '\f' : /^[0-7]/.test(c) ? String.fromCharCode(parseInt(c, 8) & 255) : /^\r?\n$/.test(c) ? '' : c);
}
export function pdfText(content: string): string {
  const out: string[] = [];
  for (const blk of content.split(/\bBT\b/).slice(1)) {
    const body = blk.split(/\bET\b/)[0], parts: string[] = [];
    for (const m of body.matchAll(/\(((?:\\[\s\S]|[^\\()])*)\)\s*(?:Tj|'|")|\[((?:\\[\s\S]|[^\]])*)\]\s*TJ/g)) {
      if (m[1] !== undefined) parts.push(unescapePdf(m[1]));
      else parts.push([...m[2].matchAll(/\(((?:\\[\s\S]|[^\\()])*)\)/g)].map(s => unescapePdf(s[1])).join(''));
    }
    const t = parts.join(' ').replace(/[^\x20-\x7e -ÿ\n\t]/g, '').trim(); if (t) out.push(t);
  }
  return out.join('\n');
}

export function scanPdf(b: Uint8Array) {
  const text = latin1(b), objs: Obj[] = [];
  const re = /(?<!\d)(\d{1,7})\s+(\d{1,5})\s+obj\b/g; let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && objs.length < 50000) {
    const end = text.indexOf('endobj', m.index + m[0].length);
    objs.push({ num: +m[1], gen: +m[2], start: m.index, end: end < 0 ? b.length : end + 6, complete: end >= 0 });
  }
  return { text, objs };
}

export function analyzePdf(b: Uint8Array, ctx: { deadline?: Deadline; limits?: Limits; verifyOnly?: boolean } = {}): AnalysisResult {
  const lim = ctx.limits ?? DEFAULT_LIMITS, dl = ctx.deadline ?? new Deadline(lim.maxMillis);
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], items: RecoveredItem[] = [];
  const limitations = ['No se interpretan fuentes, imágenes ni formularios; el texto sale de los operadores Tj/TJ y puede diferir del visual si hay codificaciones propias.', 'PDF con flujos de objetos (ObjStm), cifrado o xref comprimido: análisis parcial.'];
  const { text, objs } = scanPdf(b);
  const hdr = text.slice(0, 1024).indexOf('%PDF-');
  if (hdr < 0) findings.push({ severity: 'dano', code: 'sin_cabecera', message: 'No se encontró la cabecera %PDF- en el primer KiB.', offset: 0 });
  const ver = /%PDF-(\d\.\d)/.exec(text.slice(0, 1024))?.[1] ?? '?';
  if (!objs.length) return { integrity: 'irrecuperable', findings: [...findings, { severity: 'dano', code: 'sin_objetos', message: 'No se encontraron objetos PDF.' }], damaged: [damaged(0, b.length, 'sin objetos reconocibles')], items, limitations };

  const eofAt = text.lastIndexOf('%%EOF'), eofOk = eofAt >= 0 && eofAt >= b.length - 1024;
  const sx = text.lastIndexOf('startxref'), sxVal = sx >= 0 ? +(/startxref\s+(\d+)/.exec(text.slice(sx, sx + 40))?.[1] ?? NaN) : NaN;
  const xrefOk = Number.isFinite(sxVal) && sxVal < b.length && (text.startsWith('xref', sxVal) || /^\d+\s+\d+\s+obj/.test(text.slice(sxVal, sxVal + 40)));
  const hasObjStm = /\/Type\s*\/ObjStm/.test(text), encrypted = /\/Encrypt\b/.test(text);
  if (!eofOk) { findings.push({ severity: 'dano', code: 'sin_eof', message: 'Falta %%EOF al final: el archivo está truncado.', offset: b.length }); }
  if (!xrefOk) { findings.push({ severity: 'dano', code: 'xref_invalido', message: Number.isFinite(sxVal) ? `startxref apunta a ${sxVal}, donde no hay una tabla xref.` : 'No hay startxref válido.', offset: sx >= 0 ? sx : b.length }); if (sx >= 0) dmg.push(damaged(sx, Math.min(b.length, sx + 40), 'puntero startxref inválido')); }
  if (hasObjStm) findings.push({ severity: 'aviso', code: 'objstm', message: 'Contiene flujos de objetos comprimidos (ObjStm): no se reconstruyen.' });
  if (encrypted) findings.push({ severity: 'aviso', code: 'cifrado', message: 'El PDF declara cifrado: el contenido no es accesible sin la clave.' });
  const lastObj = objs[objs.length - 1];
  if (!lastObj.complete) { findings.push({ severity: 'dano', code: 'objeto_truncado', message: `El objeto ${lastObj.num} no termina (falta endobj): se pierde desde ${lastObj.start}.`, offset: lastObj.start }); dmg.push(damaged(lastObj.start, b.length, `objeto ${lastObj.num} truncado`)); }

  let streams = 0, okStreams = 0, badStreams = 0;
  for (const o of objs) {
    if (dl.expired) { findings.push({ severity: 'aviso', code: 'tiempo_agotado', message: 'Presupuesto de tiempo agotado: análisis parcial.' }); break; }
    if (streams >= 200) { findings.push({ severity: 'aviso', code: 'limite_flujos', message: 'Se analizan como máximo 200 flujos.' }); break; }
    const sm = /stream\r?\n/.exec(text.slice(o.start, Math.min(o.end, o.start + 8000))); if (!sm) continue;
    const dict = text.slice(o.start, o.start + sm.index), ds = o.start + sm.index + sm[0].length, es = text.indexOf('endstream', ds);
    const de = es < 0 ? o.end : es;
    if (!/\/FlateDecode/.test(dict)) { if (/BT[\s\S]{0,4000}ET/.test(text.slice(ds, Math.min(de, ds + 20000)))) { const t = pdfText(text.slice(ds, de)); if (t) items.push({ kind: 'texto', name: `texto (objeto ${o.num}, sin compresión)`, size: t.length, verified: false, basis: 'flujo sin suma de comprobación: no se puede verificar su integridad', preview: t.slice(0, 300) }); } continue; }
    streams++;
    const r = inflateZlib(b, ds, Math.min(lim.maxEntryBytes, 4_194_304));
    if (r.complete && r.adlerOk === true) {
      okStreams++; const content = latin1(r.out, 0, Math.min(r.out.length, 2_000_000));
      if (/\bBT\b/.test(content)) { const t = pdfText(content); if (t) items.push({ kind: 'texto', name: `texto (objeto ${o.num})`, size: t.length, verified: true, basis: 'flujo Flate completo con Adler-32 correcto; texto de operadores Tj/TJ', preview: t.slice(0, 300) }); }
    } else {
      badStreams++; findings.push({ severity: 'dano', code: 'flujo_danado', message: `Flujo del objeto ${o.num} dañado o truncado: ${r.error ?? 'Adler-32 incorrecto'}; ${r.out.length} bytes previos al fallo.`, offset: ds });
      dmg.push(damaged(ds, Math.max(de, ds + 1), `flujo Flate del objeto ${o.num} dañado`));
    }
  }
  const pages = [...text.matchAll(/\/Type\s*\/Page(?![s\w])/g)].length;
  items.unshift({ kind: 'estructura', name: 'objetos', size: objs.length, verified: true, basis: 'recuento directo de "n g obj"', preview: `PDF ${ver}: ${objs.length} objetos, ${streams} flujos Flate (${okStreams} íntegros, ${badStreams} dañados)` },
    { kind: 'metadatos', name: 'páginas', size: pages, verified: false, basis: 'heurística: ocurrencias de /Type /Page; un árbol de páginas dañado puede no coincidir', preview: `${pages} página(s) estimada(s)` });

  const intact = hdr >= 0 && eofOk && xrefOk && lastObj.complete && badStreams === 0;
  const integrity = intact ? 'integro' : (eofOk && lastObj.complete && badStreams === 0) ? 'danado' : (okStreams > 0 || items.some(i => i.kind === 'texto')) ? 'parcial' : (objs.length > 2 ? 'danado' : 'irrecuperable');

  let repaired: AnalysisResult['repaired'];
  const root = objs.find(o => /\/Type\s*\/Catalog/.test(text.slice(o.start, o.end)));
  if (!intact && root && !hasObjStm && !encrypted && !ctx.verifyOnly) {
    const good = objs.filter(o => o.complete); const cutoff = good.length ? Math.max(...good.map(o => o.end)) : 0;
    const last = new Map<number, Obj>(); for (const o of good) if (o.end <= cutoff) last.set(o.num, o);
    const size = Math.max(...last.keys()) + 1;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let n = 1; n < size; n++) { const o = last.get(n); xref += o ? `${String(o.start).padStart(10, '0')} ${String(o.gen).padStart(5, '0')} n \n` : '0000000000 00000 f \n'; }
    const head = b.subarray(0, cutoff), pre = new TextEncoder().encode('\n'), xrefPos = cutoff + 1;
    const tail = new TextEncoder().encode(`${xref}trailer\n<< /Size ${size} /Root ${root.num} ${root.gen} R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    const out = new Uint8Array(head.length + pre.length + tail.length); out.set(head); out.set(pre, head.length); out.set(tail, head.length + pre.length);
    const re = analyzePdf(out, { limits: lim, verifyOnly: true });
    repaired = { name: 'reparado.pdf', bytes: out, structureVerified: re.integrity === 'integro' && re.items.find(i => i.kind === 'estructura')?.size === last.size,
      note: `Tabla xref y trailer reconstruidos (Root ${root.num} 0 R) con ${last.size} objetos completos${cutoff < b.length ? `; se descartaron ${b.length - cutoff} bytes finales incompletos` : ''}. Estructura verificada al re-analizar; no se abrió con un visor externo.` };
  }
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: { objetos: objs.length, flujos: streams, paginasEstimadas: pages, version: ver } };
}
export const pdfAnalyzer: Analyzer = { id: 'pdf', label: 'PDF', analyze: (b, c) => analyzePdf(b, { deadline: c.deadline, limits: c.limits }) };

