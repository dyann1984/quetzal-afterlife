/**
 * RESURRECTION LAB — seis ejemplos reproducibles: archivo ORIGINAL de referencia + archivo DAÑADO, ambos generados por código
 * de forma determinista (sin datos pregrabados ni resultados guardados). El laboratorio ejecuta el motor real sobre el dañado
 * y compara el resultado con el original para que el veredicto sea verificable (SHA-256, líneas, entradas, filas).
 * Todo es SINTÉTICO: ningún dato pertenece a una persona o sistema reales.
 */
import { sha256Hex } from '../ingest';
import { concat, crc32, deflateRawFixed, deflateZlib, inflateZlib, u32be } from './core';
import { analyzeFile, identify, type FileReport } from './index';
import { chunk } from './fixtures';
import { buildZip, readZip } from './zip';
import { walkPngChunks } from './png';

export interface Bi { es: string; en: string }
const B = (es: string, en: string): Bi => ({ es, en });
export type LabOutcome = 'exact' | 'partial' | 'honest-fail';
export interface LabExample {
  id: string; n: number; title: Bi; problem: Bi; damage: Bi[]; expectation: Bi; outcome: LabOutcome;
  /** formato visual para la comparación antes/después */
  view: 'image' | 'text' | 'zip' | 'bytes';
  original: { name: string; bytes: Uint8Array }; damaged: { name: string; bytes: Uint8Array };
}

// ─── generadores deterministas ───────────────────────────────────────────────
const SIG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const hash2 = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; };

/** Emblema sintético (aura azul eléctrico, anillo dorado, cola en diagonal, estrellas). RGB 8 bits, filtro 0. */
function emblemRaw(w: number, h: number, ring: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (h / 2), dy = (y - h / 2) / (h / 2), r = Math.hypot(dx, dy), t = Math.max(0, 1 - r * 0.85);
      let R = 6 + 24 * t, G = 14 + 96 * t * t + 30 * t, Bl = 38 + 210 * t;
      const onRing = Math.abs(r - ring) < 0.075, tail = r > ring - 0.2 && r < ring + 0.38 && dx > 0.05 && dy > 0.05 && Math.abs((dy - dx) / 1.414 - 0.02) < 0.06;
      if (onRing || tail) { const s = 0.78 + 0.22 * Math.sin(Math.atan2(dy, dx) * 3); R = 236 * s; G = 186 * s; Bl = 52 * s; }
      if (hash2(x, y) % 211 === 0 && r > 0.2) { R = G = Bl = 235; }
      const o = y * (1 + w * 3) + 1 + x * 3; raw[o] = R; raw[o + 1] = G; raw[o + 2] = Bl;
    }
  }
  return raw;
}
function pngFromRaw(raw: Uint8Array, w: number, h: number, idatChunks: number): Uint8Array {
  const ih = new Uint8Array(13), dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2;
  const z = deflateZlib(raw), per = Math.ceil(z.length / idatChunks), parts: Uint8Array[] = [];
  for (let o = 0; o < z.length; o += per) parts.push(chunk('IDAT', z.subarray(o, o + per)));
  const enc = new TextEncoder();
  return concat([SIG, chunk('IHDR', ih), chunk('tEXt', concat([enc.encode('Comment'), Uint8Array.of(0), enc.encode('Imagen sintetica de QUETZAL AFTERLIFE Lab')])), ...parts, chunk('IEND', new Uint8Array(0))]);
}
const chunkOffsets = (b: Uint8Array) => { const out: Array<{ type: string; offset: number; length: number }> = []; let p = 8; while (p + 12 <= b.length) { const len = u32be(b, p); out.push({ type: String.fromCharCode(...b.subarray(p + 4, p + 8)), offset: p, length: len }); p += 12 + len; } return out; };
const xor = (b: Uint8Array, at: number, n: number, v = 0xff) => { for (let i = 0; i < n; i++) b[at + i] ^= v; };

const TEXT_LINES = [
  'QUETZAL AFTERLIFE — Diario de recuperación', 'Fecha: 2 de noviembre de 2026', 'El quetzal simboliza la resurrección: vuelve a volar tras la caída.',
  'Inventario recuperado del almacén norte:', '  • Café de altura — 120 sacos', '  • Cacao ceremonial — 45 sacos', '  • Miel de abeja melipona — 30 frascos', '  • Textiles bordados — 18 piezas',
  'Observación: los registros de la última semana quedaron incompletos.', 'Responsable: Ángela Pérez Núñez', 'Nota técnica: la copia se verificó con SHA-256 antes de analizarla.',
  'Estado final: recuperación parcial, sin datos inventados.', 'Fin del documento.',
];
const lineStarts = (b: Uint8Array) => { const s = [0]; for (let i = 0; i < b.length; i++) if (b[i] === 10) s.push(i + 1); return s; };

function makeText() {
  const original = new TextEncoder().encode(TEXT_LINES.join('\n') + '\n'), d = original.slice(), st = lineStarts(original);
  d.fill(0, st[4] + 8, st[4] + 17);                    // línea 5: 9 bytes a cero
  d.set([0xff, 0xfe, 0xfa, 0xfb, 0xfc, 0xfd], st[7] + 6); // línea 8: 6 bytes basura
  d.fill(0, st[10] + 12, st[10] + 32);                 // línea 11: 20 bytes a cero
  const l3 = original.subarray(st[2], st[3]), cut = l3.indexOf(0xc3, 10); d[st[2] + cut + 1] = 0x00; // línea 3: una «ó» partida
  return { original, damaged: d, damagedLines: 4, totalLines: TEXT_LINES.length };
}

const DOCX_BODY = Array.from({ length: 24 }, (_, i) => `<w:p><w:r><w:t>Cláusula ${i + 1}: el archivo se conserva con firma digital y copia de respaldo verificable.</w:t></w:r></w:p>`).join('');
function makeDocx() {
  const enc = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', bytes: enc.encode('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
    { name: '_rels/.rels', bytes: enc.encode('<Relationships/>') },
    { name: 'word/document.xml', bytes: enc.encode(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${DOCX_BODY}</w:body></w:document>`) },
    { name: 'docProps/core.xml', bytes: enc.encode('<cp:coreProperties/>') },
  ];
  const original = buildZip(files, deflateRawFixed), z = readZip(original), d = original.slice();
  d.fill(0, z.entries[0].offset, z.entries[0].offset + 4); d.fill(0, z.entries[2].offset, z.entries[2].offset + 4);  // firmas PK 03 04 de 2 entradas
  return { original, damaged: d, files };
}

const CSV = 'id,producto,cantidad,sector\n' + Array.from({ length: 160 }, (_, i) => `${1000 + i},Lote-${(i * 7) % 53},${(i * 13) % 97},Zona-${i % 6}`).join('\n') + '\n';
const NOTES = Array.from({ length: 70 }, (_, i) => `Registro ${i + 1}: inventario de reserva verificado; sin diferencias entre almacén y libro.`).join('\n') + '\n';
function makeZip() {
  const enc = new TextEncoder();
  const files = [{ name: 'notas.txt', bytes: enc.encode(NOTES) }, { name: 'datos.csv', bytes: enc.encode(CSV) }, { name: 'LEEME.txt', bytes: enc.encode('Paquete sintético de QUETZAL AFTERLIFE Lab.\nContiene notas, datos y este archivo.\n') }];
  const original = buildZip(files, deflateRawFixed), z = readZip(original), e = z.entries[1], start = e.offset + 30 + new TextEncoder().encode(e.name).length;
  const d = original.slice(); xor(d, start + Math.floor(e.comp / 2), 6);   // 6 bytes alterados a mitad del flujo comprimido de datos.csv
  return { original, damaged: d, files };
}

function makeNoise() {
  const original = pngFromRaw(emblemRaw(128, 96, 0.5), 128, 96, 6), d = original.slice(); let s = 20261102;
  for (let i = 8; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s >>> 24; }
  return { original, damaged: d };
}

export function buildLabExamples(): LabExample[] {
  const img = pngFromRaw(emblemRaw(128, 96, 0.62), 128, 96, 6), pngCrc = img.slice(), co = chunkOffsets(img), idats = co.filter(c => c.type === 'IDAT');
  xor(pngCrc, co[0].offset + 8 + 13, 2); xor(pngCrc, idats[1].offset + 8 + idats[1].length, 1);   // CRC del IHDR y del 2.º IDAT
  const txt = makeText(), docx = makeDocx(), zip = makeZip(), noise = makeNoise();
  const img2 = pngFromRaw(emblemRaw(128, 96, 0.55), 128, 96, 16), partial = img2.slice(0, Math.floor(img2.length * 0.6));
  return [
    { id: 'png-crc', n: 1, view: 'image', outcome: 'exact', original: { name: 'emblema.png', bytes: img }, damaged: { name: 'emblema-danado.png', bytes: pngCrc },
      title: B('PNG con daño estructural reparable', 'PNG with repairable structural damage'),
      problem: B('Se alteraron el CRC-32 del chunk IHDR y el de un chunk IDAT. Los píxeles están intactos, pero los visores rechazan el archivo.', 'The CRC-32 of the IHDR chunk and of one IDAT chunk were altered. The pixels are intact, but viewers reject the file.'),
      damage: [B('3 bytes alterados en campos CRC-32 (IHDR + IDAT 2)', '3 bytes altered in CRC-32 fields (IHDR + IDAT 2)')],
      expectation: B('Recuperación completa: el flujo comprimido verifica su Adler-32, así que solo hay que recalcular los CRC. El resultado debe coincidir byte a byte con el original.', 'Full recovery: the compressed stream verifies its Adler-32, so only the CRCs need recomputing. The result must match the original byte for byte.') },
    { id: 'txt-partial', n: 2, view: 'text', outcome: 'partial', original: { name: 'diario.txt', bytes: txt.original }, damaged: { name: 'diario-danado.txt', bytes: txt.damaged },
      title: B('Texto parcialmente corrupto', 'Partially corrupted text'),
      problem: B('Bytes a cero, bytes basura y un carácter UTF-8 partido en cuatro líneas de un diario de 13.', 'Zeroed bytes, garbage bytes and a split UTF-8 character across four lines of a 13-line journal.'),
      damage: [B('9 bytes a cero (línea 5)', '9 zeroed bytes (line 5)'), B('6 bytes basura (línea 8)', '6 garbage bytes (line 8)'), B('20 bytes a cero (línea 11)', '20 zeroed bytes (line 11)'), B('«ó» partida (línea 3)', 'split “ó” (line 3)')],
      expectation: B('Recuperación parcial: las 9 líneas sin daño se recuperan idénticas; las 4 dañadas conservan lo legible y marcan lo perdido con «�».', 'Partial recovery: the 9 undamaged lines are recovered identically; the 4 damaged ones keep what is readable and mark the loss with “�”.') },
    { id: 'docx-signature', n: 3, view: 'zip', outcome: 'exact', original: { name: 'contrato.docx', bytes: docx.original }, damaged: { name: 'contrato-firma-alterada.docx', bytes: docx.damaged },
      title: B('Firma binaria alterada (DOCX comprimido)', 'Altered binary signature (compressed DOCX)'),
      problem: B('Los primeros 4 bytes del archivo y la firma de otra entrada valen cero: no se reconoce como ZIP por su firma de inicio.', 'The first 4 bytes of the file and another entry’s signature are zero: it is not recognised as ZIP by its leading signature.'),
      damage: [B('firma PK 03 04 a cero en 2 de 4 entradas', 'PK 03 04 signature zeroed in 2 of 4 entries')],
      expectation: B('Recuperación completa: se identifica por el directorio central, cada entrada Deflate verifica su CRC-32 y la reparación restituye solo las firmas (byte a byte igual al original).', 'Full recovery: identified via the central directory, each Deflate entry verifies its CRC-32 and the repair restores only the signatures (byte-identical to the original).') },
    { id: 'zip-deflate', n: 4, view: 'zip', outcome: 'partial', original: { name: 'paquete.zip', bytes: zip.original }, damaged: { name: 'paquete-danado.zip', bytes: zip.damaged },
      title: B('Archivo comprimido con una entrada dañada', 'Compressed archive with one damaged entry'),
      problem: B('Seis bytes del flujo Deflate de datos.csv están alterados. Las otras dos entradas están intactas.', 'Six bytes of the Deflate stream of datos.csv are altered. The other two entries are intact.'),
      damage: [B('6 bytes alterados a mitad del flujo comprimido de datos.csv', '6 bytes altered in the middle of datos.csv’s compressed stream')],
      expectation: B('Recuperación parcial: 2 entradas verificadas por CRC-32; de datos.csv solo se ofrece el prefijo legible, rotulado NO verificado.', 'Partial recovery: 2 entries verified by CRC-32; for datos.csv only the readable prefix is offered, labelled NOT verified.') },
    { id: 'png-noise', n: 5, view: 'image', outcome: 'honest-fail', original: { name: 'emblema-ruido.png', bytes: noise.original }, damaged: { name: 'emblema-sobrescrito.png', bytes: noise.damaged },
      title: B('Archivo irrecuperable (diagnóstico honesto)', 'Unrecoverable file (honest diagnosis)'),
      problem: B('Todo el contenido tras la firma fue sobrescrito con datos pseudoaleatorios. No queda cabecera ni datos de imagen.', 'All content after the signature was overwritten with pseudo-random data. No header or image data remains.'),
      damage: [B('todos los bytes desde el offset 8 sobrescritos', 'every byte from offset 8 overwritten')],
      expectation: B('Sin recuperación posible. El motor debe decirlo, mostrar la entropía (≈8 bits/byte) y no ofrecer ningún archivo reparado.', 'No recovery possible. The engine must say so, show the entropy (≈8 bits/byte) and offer no repaired file.') },
    { id: 'png-partial', n: 6, view: 'image', outcome: 'partial', original: { name: 'emblema-completo.png', bytes: img2 }, damaged: { name: 'emblema-truncado.png', bytes: partial },
      title: B('Recuperación parcial de información', 'Partial recovery of information'),
      problem: B('La descarga se cortó al 60 %. Faltan el final del flujo de imagen, el Adler-32 y el IEND.', 'The download was cut at 60 %. The end of the image stream, the Adler-32 and the IEND are missing.'),
      damage: [B('archivo truncado al 60 % de su longitud', 'file truncated at 60 % of its length')],
      expectation: B('Recuperación parcial: solo las filas cuyos chunks IDAT están completos y con CRC válido. Las filas restantes no existen en el archivo y no se inventan.', 'Partial recovery: only the rows whose IDAT chunks are complete with a valid CRC. The remaining rows do not exist in the file and are not invented.') },
  ];
}

// ─── ejecución y verificación contra el original ─────────────────────────────
export interface LabCheck { ok: boolean; label: Bi; detail: string }
export type Confidence = 'alta' | 'media' | 'baja' | 'nula';
export interface LabRun { example: LabExample; report: FileReport; originalSha: string; damagedSha: string; recoveredSha?: string; checks: LabCheck[]; confidence: Confidence; confidenceWhy: Bi; stageMs: Record<string, number> }
export interface LabStage { id: 'hash' | 'identify' | 'analyze' | 'verify'; label: Bi; pct: number }
const STAGES: LabStage[] = [
  { id: 'hash', label: B('Calculando SHA-256 del original y del dañado', 'Computing SHA-256 of original and damaged'), pct: 10 },
  { id: 'identify', label: B('Identificando el formato por firma y estructura', 'Identifying the format by signature and structure'), pct: 30 },
  { id: 'analyze', label: B('Analizando, localizando daños y reparando', 'Analysing, locating damage and repairing'), pct: 75 },
  { id: 'verify', label: B('Verificando el resultado contra el original', 'Verifying the result against the original'), pct: 100 },
];
const tick = () => new Promise<void>(r => setTimeout(r, 0));

function pngRaw(b: Uint8Array): Uint8Array {
  const ch = walkPngChunks(b).filter(c => c.type === 'IDAT' && c.complete);
  return inflateZlib(concat(ch.map(c => b.subarray(c.offset + 8, c.offset + 8 + c.length)))).out;
}
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
const linesOf = (b: Uint8Array) => new TextDecoder().decode(b).split('\n');

export function confidenceOf(r: FileReport): { level: Confidence; why: Bi } {
  if (r.integrity === 'irrecuperable' || r.integrity === 'no-analizado') return { level: 'nula', why: B('No hay estructura ni datos verificables que recuperar.', 'There is no structure or verifiable data to recover.') };
  const significant = r.items.filter(i => i.kind !== 'metadatos'), allVerified = significant.length > 0 && significant.every(i => i.verified);
  if (r.repaired?.structureVerified && allVerified && (r.integrity === 'danado' || r.integrity === 'integro')) return { level: 'alta', why: B('Todo lo recuperado está respaldado por CRC-32/Adler-32 y la reparación se re-analizó con éxito.', 'Everything recovered is backed by CRC-32/Adler-32 and the repair was re-analysed successfully.') };
  if (significant.some(i => i.verified)) return { level: 'media', why: B('Parte de lo recuperado está verificado; el resto se pierde o queda sin verificar.', 'Part of what was recovered is verified; the rest is lost or unverified.') };
  return { level: 'baja', why: B('Nada de lo recuperado se pudo verificar con una suma de comprobación.', 'Nothing recovered could be verified with a checksum.') };
}

export async function runLab(ex: LabExample, onStage?: (s: LabStage) => void): Promise<LabRun> {
  const stageMs: Record<string, number> = {}; const mark = async (s: LabStage, f: () => Promise<void>) => { onStage?.({ ...s, pct: Math.max(0, s.pct - 20) }); await tick(); const t = performance.now(); await f(); stageMs[s.id] = Math.round(performance.now() - t); onStage?.(s); await tick(); };
  let originalSha = '', damagedSha = '', report!: FileReport; const checks: LabCheck[] = [];
  await mark(STAGES[0], async () => { originalSha = await sha256Hex(ex.original.bytes); damagedSha = await sha256Hex(ex.damaged.bytes); });
  await mark(STAGES[1], async () => { identify(ex.damaged.bytes, ex.damaged.name); });
  await mark(STAGES[2], async () => { report = await analyzeFile(ex.damaged.bytes, ex.damaged.name); });
  let recoveredSha: string | undefined;
  await mark(STAGES[3], async () => {
    const rep = report.repaired; recoveredSha = rep?.sha256;
    const add = (ok: boolean, es: string, en: string, detail: string) => checks.push({ ok, label: B(es, en), detail });
    if (ex.id === 'png-crc' || ex.id === 'docx-signature') {
      add(!!rep, 'El motor propone un archivo reparado', 'The engine proposes a repaired file', rep ? rep.name : '—');
      add(!!rep && recoveredSha === originalSha, 'SHA-256 del reparado = SHA-256 del original', 'Repaired SHA-256 = original SHA-256', rep ? `${recoveredSha?.slice(0, 16)}… ${recoveredSha === originalSha ? '=' : '≠'} ${originalSha.slice(0, 16)}…` : '—');
    } else if (ex.id === 'txt-partial') {
      const t = makeText(), orig = linesOf(ex.original.bytes), intactItem = report.items.find(i => i.name.startsWith('líneas íntegras')), got = intactItem?.bytes ? linesOf(intactItem.bytes).filter(l => l !== '') : [];
      add(got.length === t.totalLines - t.damagedLines, `Se recuperan ${t.totalLines - t.damagedLines} de ${t.totalLines} líneas`, `${t.totalLines - t.damagedLines} of ${t.totalLines} lines are recovered`, `${got.length} líneas íntegras`);
      add(got.every(l => orig.includes(l)), 'Cada línea recuperada es idéntica a una línea del original', 'Every recovered line is identical to a line of the original', `${got.filter(l => orig.includes(l)).length}/${got.length}`);
      add(!!rep && rep.structureVerified, 'El texto reparado decodifica como UTF-8 estricto', 'The repaired text decodes as strict UTF-8', rep?.name ?? '—');
    } else if (ex.id === 'zip-deflate') {
      const z = readZip(ex.original.bytes), orig = new Map(z.entries.map(e => [e.name, e]));
      const ok = report.items.filter(i => i.verified && i.kind === 'entrada');
      add(ok.length === 2, '2 de 3 entradas verificadas por CRC-32', '2 of 3 entries verified by CRC-32', ok.map(i => i.name).join(', '));
      add(ok.every(i => { const e = orig.get(i.name); return !!e && !!i.bytes && crc32(i.bytes) === e.crc; }), 'Cada entrada verificada coincide con el CRC-32 del original', 'Each verified entry matches the original’s CRC-32', 'CRC-32');
      const bad = report.items.find(i => !i.verified && i.kind === 'entrada'), full = makeZip().files[1].bytes;
      let m = 0; if (bad?.partialBytes) while (m < bad.partialBytes.length && bad.partialBytes[m] === full[m]) m++;
      add(!!bad && !bad.verified, 'datos.csv NO se declara verificado', 'datos.csv is NOT declared verified', bad ? `prefijo legible: ${bad.partialBytes?.length ?? 0} B; coinciden con el original los primeros ${m} B` : '—');
    } else if (ex.id === 'png-noise') {
      add(report.integrity === 'irrecuperable', 'Diagnóstico: irrecuperable', 'Diagnosis: unrecoverable', report.integrity);
      add(!rep && !report.items.some(i => i.verified && i.kind !== 'metadatos'), 'No se ofrece ningún archivo reparado ni datos “recuperados”', 'No repaired file or “recovered” data is offered', '—');
      add(Number(report.meta?.entropiaBitsPorByte ?? 0) > 7.5, 'Entropía ≈ 8 bits/byte: datos sin estructura', 'Entropy ≈ 8 bits/byte: structureless data', `${report.meta?.entropiaBitsPorByte ?? '?'} bits/byte`);
    } else if (ex.id === 'png-partial') {
      const rows = Number(report.meta?.filasRecuperables ?? 0), w = Number(report.meta?.ancho ?? 0), h = Number(report.meta?.alto ?? 0), rb = 3 * w + 1;
      const rr = rep ? pngRaw(rep.bytes) : new Uint8Array(0), orr = pngRaw(ex.original.bytes);
      add(rows > 0 && rows < h, `Se recuperan ${rows} de ${h} filas (parcial)`, `${rows} of ${h} rows are recovered (partial)`, `${((rows / Math.max(h, 1)) * 100).toFixed(1)} %`);
      add(rr.length === rows * rb && eq(rr, orr.subarray(0, rows * rb)), 'Las filas recuperadas son idénticas a las del original', 'The recovered rows are identical to the original’s', `${rows} filas × ${rb} B`);
      add(!!rep && rep.structureVerified, 'El PNG reparado se re-analiza como íntegro', 'The repaired PNG re-analyses as intact', rep?.name ?? '—');
    }
  });
  const c = confidenceOf(report);
  return { example: ex, report, originalSha, damagedSha, recoveredSha, checks, confidence: c.level, confidenceWhy: c.why, stageMs };
}
export { STAGES as LAB_STAGES };
