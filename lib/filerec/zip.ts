/**
 * ZIP / OOXML (DOCX, XLSX, PPTX): directorio central + respaldo por cabeceras locales, extracción con
 * verificación CRC-32, límites anti-bomba y nombres seguros. Nada se escribe en disco ni se ejecuta.
 * Recuperable = entradas cuya CRC-32 coincide tras descomprimir. Lo demás se informa como dañado.
 */
import { concat, crc32, damaged, Deadline, DEFAULT_LIMITS, inflateRaw, lastIndexOfSeq, matches, safeName, u16le, u32le, type DamagedRange, type FileFinding, type Limits } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

export interface ZipEntry { name: string; safe: string; method: number; flags: number; comp: number; uncomp: number; crc: number; offset: number; central: boolean }
export interface ZipRead { entries: ZipEntry[]; eocd: number; findings: FileFinding[]; damaged: DamagedRange[]; usedFallback: boolean }
const LOCAL = [0x50, 0x4b, 0x03, 0x04], CEN = [0x50, 0x4b, 0x01, 0x02], EOCD = [0x50, 0x4b, 0x05, 0x06];
const td = new TextDecoder('utf-8');

export function readZip(b: Uint8Array, lim: Limits = DEFAULT_LIMITS, dl: Deadline = new Deadline(lim.maxMillis)): ZipRead {
  const findings: FileFinding[] = [], dmg: DamagedRange[] = [], entries: ZipEntry[] = [];
  const eocd = lastIndexOfSeq(b, EOCD, b.length - 22, Math.max(0, b.length - 65557));
  let usedFallback = false;
  if (eocd >= 0) {
    const n = u16le(b, eocd + 10), cdSize = u32le(b, eocd + 12), cdOff = u32le(b, eocd + 16);
    if (n === 0xffff || cdOff === 0xffffffff) findings.push({ severity: 'aviso', code: 'zip64', message: 'ZIP64 no soportado: se usa el recorrido por cabeceras locales.' });
    else if (cdOff + cdSize > eocd) findings.push({ severity: 'dano', code: 'directorio_fuera_de_rango', message: 'El directorio central apunta fuera del archivo.', offset: eocd + 16 });
    else {
      let p = cdOff;
      for (let i = 0; i < n && entries.length < lim.maxEntries && !dl.expired; i++) {
        if (!matches(b, p, CEN) || p + 46 > b.length) { findings.push({ severity: 'dano', code: 'entrada_central_invalida', message: `La entrada ${i + 1} del directorio central es inválida.`, offset: p }); dmg.push(damaged(p, Math.min(cdOff + cdSize, b.length), 'directorio central dañado')); break; }
        const nl = u16le(b, p + 28), el = u16le(b, p + 30), cl = u16le(b, p + 32);
        if (p + 46 + nl > b.length) break;
        const name = td.decode(b.subarray(p + 46, p + 46 + nl));
        entries.push({ name, safe: safeName(name), flags: u16le(b, p + 8), method: u16le(b, p + 10), crc: u32le(b, p + 16), comp: u32le(b, p + 20), uncomp: u32le(b, p + 24), offset: u32le(b, p + 42), central: true });
        p += 46 + nl + el + cl;
      }
      if (entries.length >= lim.maxEntries) findings.push({ severity: 'aviso', code: 'limite_entradas', message: `Se alcanzó el límite de ${lim.maxEntries} entradas.` });
    }
  } else findings.push({ severity: 'dano', code: 'sin_eocd', message: 'No se encontró el final del directorio central (EOCD): el archivo está truncado o dañado.', offset: b.length });

  if (!entries.length) {                       // respaldo: recorrido secuencial de cabeceras locales
    usedFallback = true; let p = 0;
    while (p + 30 <= b.length && entries.length < lim.maxEntries && !dl.expired) {
      const at = matches(b, p, LOCAL) ? p : -1;
      if (at < 0) { const nx = nextLocal(b, p + 1); if (nx < 0) break; p = nx; continue; }
      const flags = u16le(b, p + 6), method = u16le(b, p + 8), nl = u16le(b, p + 26), el = u16le(b, p + 28);
      let comp = u32le(b, p + 18), uncomp = u32le(b, p + 22), crc = u32le(b, p + 14);
      const ds = p + 30 + nl + el, name = td.decode(b.subarray(p + 30, p + 30 + nl));
      if (ds > b.length) break;
      if (flags & 8 && comp === 0) {           // tamaños en descriptor posterior: se deduce el fin inflando
        if (method === 8) { const r = inflateRaw(b, ds, lim.maxEntryBytes); comp = r.end - ds; uncomp = r.out.length; if (r.complete && matches(b, r.end, [0x50, 0x4b, 0x07, 0x08])) crc = u32le(b, r.end + 4); else if (r.complete) crc = u32le(b, r.end); }
        else { findings.push({ severity: 'aviso', code: 'tamano_desconocido', message: `La entrada "${name}" no declara tamaño y no está comprimida: se omite.`, offset: p }); p = ds; continue; }
      }
      entries.push({ name, safe: safeName(name), flags, method, crc, comp, uncomp, offset: p, central: false });
      p = ds + comp;
    }
    if (entries.length) findings.push({ severity: 'aviso', code: 'recorrido_por_cabeceras', message: `Se recuperó la lista de ${entries.length} entrada(s) por cabeceras locales (el directorio central no es utilizable).` });
  }
  for (const e of entries) if (e.safe !== e.name) findings.push({ severity: 'aviso', code: 'ruta_peligrosa', message: `Nombre "${e.name.slice(0, 80)}" normalizado a "${e.safe}" (intento de salir del directorio o ruta absoluta).` });
  return { entries, eocd, findings, damaged: dmg, usedFallback };
}
function nextLocal(b: Uint8Array, from: number) { for (let i = from; i + 4 <= b.length; i++) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 3 && b[i + 3] === 4) return i; return -1; }

/** ¿Firma ZIP inicial alterada pero con directorio central (PK 01 02) y su cierre íntegros? */
export function zipSignatureDamaged(b: Uint8Array): boolean {
  if (b.length < 22 || matches(b, 0, LOCAL) || matches(b, 0, EOCD)) return false;
  const eocd = lastIndexOfSeq(b, EOCD, b.length - 22, Math.max(0, b.length - 65557));
  return eocd >= 0 && u16le(b, eocd + 10) > 0 && matches(b, u32le(b, eocd + 16), CEN);
}
/** La firma local falta pero el resto de la cabecera coincide con el directorio central (mismo nombre en el mismo sitio). */
function localHeaderLooksRight(b: Uint8Array, e: ZipEntry): boolean {
  if (!e.central || e.offset + 30 > b.length) return false;
  const nl = u16le(b, e.offset + 26);
  return nl > 0 && e.offset + 30 + nl <= b.length && td.decode(b.subarray(e.offset + 30, e.offset + 30 + nl)) === e.name;
}

export interface Extracted { status: 'ok' | 'crc' | 'truncado' | 'cifrado' | 'metodo' | 'bomba' | 'error' | 'cabecera'; data?: Uint8Array; detail: string; range: [number, number]; sigRestored?: boolean }
export function extractEntry(b: Uint8Array, e: ZipEntry, lim: Limits, budget: { left: number }): Extracted {
  const r = (a: number, z: number): [number, number] => [a, z];
  if (e.flags & 1) return { status: 'cifrado', detail: 'entrada cifrada: el contenido no es accesible sin la clave', range: r(e.offset, e.offset) };
  const sigRestored = !matches(b, e.offset, LOCAL) && localHeaderLooksRight(b, e);
  if (sigRestored) { const x = extractEntry(patchLocal(b, e.offset), e, lim, budget); return { ...x, sigRestored: true, detail: x.status === 'ok' ? 'CRC-32 coincide (firma de cabecera local alterada y restituida)' : x.detail }; }
  if (!matches(b, e.offset, LOCAL)) return { status: 'cabecera', detail: 'la cabecera local no está donde indica el directorio', range: r(e.offset, Math.min(e.offset + 30, b.length)) };
  const start = e.offset + 30 + u16le(b, e.offset + 26) + u16le(b, e.offset + 28), end = start + e.comp;
  if (e.uncomp > lim.maxEntryBytes || e.uncomp > lim.maxRatio * Math.max(e.comp, 1) + 1_048_576) return { status: 'bomba', detail: `tamaño declarado (${e.uncomp} B) fuera de límites o con relación sospechosa respecto a ${e.comp} B comprimidos`, range: r(start, Math.min(end, b.length)) };
  if (end > b.length) {
    if (e.method === 8) { const p = inflateRaw(b.subarray(0, b.length), start, Math.min(lim.maxEntryBytes, budget.left)); return { status: 'truncado', data: p.out, detail: `datos truncados: ${p.out.length} de ${e.uncomp} bytes legibles, sin forma de verificar su CRC-32`, range: r(start, b.length) }; }
    return { status: 'truncado', data: b.subarray(start, b.length), detail: `datos truncados: ${b.length - start} de ${e.comp} bytes`, range: r(start, b.length) };
  }
  let out: Uint8Array;
  if (e.method === 0) out = b.subarray(start, end);
  else if (e.method === 8) {
    const res = inflateRaw(b.subarray(0, end), start, Math.min(lim.maxEntryBytes, budget.left));
    if (res.error?.includes('límite')) return { status: 'bomba', detail: res.error, range: r(start, end) };
    if (!res.complete) return { status: 'error', data: res.out, detail: `flujo Deflate dañado: ${res.error}; ${res.out.length} bytes previos al fallo`, range: r(start, end) };
    out = res.out;
  } else return { status: 'metodo', detail: `método de compresión ${e.method} no soportado`, range: r(start, end) };
  budget.left -= out.length;
  if (crc32(out) !== e.crc && e.crc !== 0) return { status: 'crc', data: out, detail: 'CRC-32 distinto del declarado: el contenido está alterado', range: r(start, end) };
  return { status: 'ok', data: out, detail: 'CRC-32 coincide', range: r(start, end) };
}

function patchLocal(b: Uint8Array, off: number): Uint8Array { const c = b.slice(); c.set(LOCAL, off); return c; }

// ─── Escritura segura de ZIP (almacenado, o Deflate si se pasa un compresor) ─
export function buildZip(files: Array<{ name: string; bytes: Uint8Array }>, deflate?: (d: Uint8Array) => Uint8Array): Uint8Array {
  const enc = new TextEncoder(), locals: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  const seen = new Set<string>();
  for (const f of files) {
    let name = safeName(f.name); for (let i = 1; seen.has(name); i++) name = `${safeName(f.name)}~${i}`; seen.add(name);
    const nb = enc.encode(name), crc = crc32(f.bytes), body = deflate ? deflate(f.bytes) : f.bytes, method = deflate ? 8 : 0;
    const lh = new Uint8Array(30 + nb.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, method, true); dv.setUint16(10, 0, true); dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, body.length, true); dv.setUint32(22, f.bytes.length, true); dv.setUint16(26, nb.length, true); lh.set(nb, 30);
    const ch = new Uint8Array(46 + nb.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, f.bytes.length, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, off, true); ch.set(nb, 46);
    locals.push(lh, body); central.push(ch); off += lh.length + body.length;
  }
  const cd = concat(central), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cd.length, true); ev.setUint32(16, off, true);
  return concat([...locals, cd, end]);
}

// ─── OOXML ───────────────────────────────────────────────────────────────────
const ent = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(+d, 0x10ffff))).replace(/&amp;/g, '&');
export function docxText(xml: string): string {
  return xml.split('</w:p>').map(p => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g)].map(m => (m[1] === undefined ? '\t' : ent(m[1]))).join('')).filter((s, i, a) => s || i < a.length - 1).join('\n').trim();
}
export function xlsxStrings(xml: string): string[] { return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(t => ent(t[1])).join('')); }

export function analyzeZip(b: Uint8Array, ctx: { deadline?: Deadline; limits?: Limits } = {}): AnalysisResult {
  const lim = ctx.limits ?? DEFAULT_LIMITS, dl = ctx.deadline ?? new Deadline(lim.maxMillis);
  const z = readZip(b, lim, dl);
  const findings = [...z.findings], dmg = [...z.damaged], items: RecoveredItem[] = [], budget = { left: lim.maxTotalBytes };
  const limitations = ['ZIP64, cifrado y métodos distintos de almacenado/Deflate no se soportan.', 'Los archivos Office se reconstruyen como ZIP; Word/Excel pueden rechazarlos si faltan partes esenciales.'];
  const ok: Array<{ name: string; bytes: Uint8Array }> = [], texts = new Map<string, string>(), sigFix: number[] = [];
  let verified = 0;
  for (const e of z.entries) {
    if (dl.expired) { findings.push({ severity: 'aviso', code: 'tiempo_agotado', message: 'Se agotó el presupuesto de tiempo: el análisis es parcial.' }); break; }
    if (e.name.endsWith('/')) continue;
    const x = extractEntry(b, e, lim, budget);
    const good = x.status === 'ok';
    if (x.sigRestored) { sigFix.push(e.offset); findings.push({ severity: 'dano', code: 'firma_local_alterada', message: `"${e.safe}": la firma de la cabecera local está alterada; el resto de la cabecera coincide con el directorio central.`, offset: e.offset }); dmg.push(damaged(e.offset, e.offset + 4, `${e.safe}: firma local alterada`)); }
    if (good) { verified++; if (x.data!.length <= 4_194_304) ok.push({ name: e.safe, bytes: x.data! }); if (/^(\[Content_Types\]\.xml|word\/document\.xml|xl\/(workbook|sharedStrings)\.xml)$/.test(e.name) || /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name) || /^docProps\//.test(e.name)) texts.set(e.name, td.decode(x.data!)); }
    else { findings.push({ severity: x.status === 'cifrado' ? 'aviso' : 'dano', code: `entrada_${x.status}`, message: `"${e.safe}": ${x.detail}.`, offset: x.range[0] }); if (x.status !== 'cifrado') dmg.push(damaged(x.range[0], Math.max(x.range[1], x.range[0] + 1), `${e.safe}: ${x.status}`)); }
    items.push({ kind: 'entrada', name: e.safe, size: x.data?.length ?? e.uncomp, verified: good, basis: x.detail, bytes: good && x.data!.length <= 1_048_576 ? x.data : undefined,
      preview: good && /\.(txt|xml|csv|json|md|rels)$/i.test(e.name) ? td.decode(x.data!.subarray(0, 160)) : undefined,
      // prefijo legible de un flujo dañado: NO verificado (no hay CRC que lo respalde), se ofrece aparte y rotulado
      partialBytes: !good && x.data && x.data.length > 0 && x.data.length <= 1_048_576 ? x.data : undefined });
  }
  const names = new Set(z.entries.map(e => e.name));
  const kind = names.has('[Content_Types].xml') ? (names.has('word/document.xml') ? 'DOCX' : names.has('xl/workbook.xml') ? 'XLSX' : [...names].some(n => n.startsWith('ppt/')) ? 'PPTX' : 'OOXML') : 'ZIP';
  if (kind === 'DOCX') {
    const doc = texts.get('word/document.xml');
    if (doc) { const t = docxText(doc); items.push({ kind: 'texto', name: 'texto del documento (DOCX)', size: t.length, verified: true, basis: 'CRC-32 de word/document.xml verificado; texto tomado de etiquetas w:t', preview: t.slice(0, 400) }); }
    else findings.push({ severity: 'dano', code: 'docx_sin_cuerpo', message: 'word/document.xml no es recuperable: el texto del documento no se puede extraer.' });
  }
  if (kind === 'XLSX') {
    const wb = texts.get('xl/workbook.xml'), ss = texts.get('xl/sharedStrings.xml'), sheets = wb ? [...wb.matchAll(/<sheet\s[^>]*name="([^"]+)"/g)].map(m => ent(m[1])) : [];
    const strs = ss ? xlsxStrings(ss) : [];
    items.push({ kind: 'texto', name: 'hojas y textos (XLSX)', size: strs.length, verified: !!ss, basis: ss ? 'CRC-32 de xl/sharedStrings.xml verificado' : 'sin sharedStrings recuperable', preview: `hojas: ${sheets.join(', ') || '(no recuperadas)'} · textos: ${strs.slice(0, 20).join(' | ')}` });
    if (!wb) findings.push({ severity: 'dano', code: 'xlsx_sin_libro', message: 'xl/workbook.xml no es recuperable: se desconoce la estructura de hojas.' });
  }
  const total = z.entries.filter(e => !e.name.endsWith('/')).length;
  let repaired: AnalysisResult['repaired'];
  if (sigFix.length > 0 && verified === total && z.eocd >= 0 && !z.usedFallback) {
    // Reparación en el sitio: solo se restituyen las firmas «PK 03 04»; el resto de bytes queda idéntico.
    const out = b.slice(); for (const o of sigFix) out.set(LOCAL, o);
    const re = readZip(out, lim), allOk = re.entries.length === z.entries.length && re.entries.every(e => { const r = extractEntry(out, e, lim, { left: lim.maxTotalBytes }); return r.status === 'ok' && !r.sigRestored; });
    repaired = { name: `reparado.${kind === 'ZIP' ? 'zip' : kind.toLowerCase()}`, bytes: out, structureVerified: allOk, note: `Se restituyeron ${sigFix.length} firma(s) de cabecera local; el resto de los bytes no se tocó. Las ${total} entradas verifican su CRC-32 al releerlo; no se abrió con la aplicación de Office.` };
  } else
  if (ok.length > 0 && (verified < total || z.usedFallback || z.eocd < 0)) {
    const out = buildZip(ok), re = readZip(out), allOk = re.entries.length === ok.length && re.entries.every(e => extractEntry(out, e, lim, { left: lim.maxTotalBytes }).status === 'ok');
    repaired = { name: `reconstruido.${kind === 'ZIP' ? 'zip' : kind.toLowerCase()}`, bytes: out, structureVerified: allOk, note: `ZIP nuevo con las ${ok.length} entrada(s) verificadas por CRC-32 (${total - verified} no recuperables se omiten). Estructura verificada al releerlo; no se abrió con la aplicación de Office.` };
  }
  const integrity = total === 0 ? 'irrecuperable' : verified === total && z.eocd >= 0 && !z.usedFallback && sigFix.length === 0 ? 'integro' : verified === 0 ? 'irrecuperable' : verified === total ? 'danado' : 'parcial';
  return { integrity, findings, damaged: dmg, items, repaired, limitations, meta: { tipo: kind, entradas: total, verificadas: verified } };
}
export const zipAnalyzer: Analyzer = { id: 'zip', label: 'ZIP / Office', analyze: (b, c) => analyzeZip(b, { deadline: c.deadline, limits: c.limits }) };
