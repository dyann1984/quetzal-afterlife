/**
 * lib/dbf-scan.ts — Lectura tolerante de DBF
 * Quetzal Afterlife · Resurrection Engine
 *
 * A diferencia de parseDbf (estricto, rechaza archivos dañados), este lector
 * extrae todo lo legible y documenta con precisión qué no pudo leer. Opera
 * únicamente sobre bytes en memoria: no modifica el original ni ejecuta nada.
 */

export type Severity = 'info' | 'aviso' | 'dano';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  offset?: number;
  record?: number;
}

export interface ScanField { name: string; type: string; length: number; decimals: number; offset: number }

export interface ScanRecord {
  recordNumber: number;      // 1-based, posición en el archivo
  offset: number;
  deleted: boolean;
  values: Record<string, string>;
  /** Campos cuyo contenido no se pudo leer; su valor es '' y NO es un dato. */
  unknownFields: string[];
  /** true si el registro estaba completo y sin anomalías. */
  intact: boolean;
  issues: string[];
}

export interface Unrecoverable { start: number; end: number; reason: string; record?: number }

export interface DbfScan {
  headerOk: boolean;
  version: number | null;
  lastUpdate: string | null;
  declaredRecords: number;
  recordLength: number;
  headerLength: number;
  encoding: string;
  encodingBasis: string;
  fields: ScanField[];
  records: ScanRecord[];
  findings: Finding[];
  unrecoverable: Unrecoverable[];
  truncated: boolean;
}

const LANG_BYTE: Record<number, string> = { 0x01: 'ibm437', 0x02: 'ibm850', 0x03: 'windows-1252', 0x57: 'windows-1252', 0x58: 'windows-1252' };
const FIELD_TYPES = new Set(['C', 'N', 'F', 'D', 'L', 'M', 'I', 'B', 'T', 'Y', 'G', '0']);

function isCorrupt(raw: Uint8Array): boolean {
  let seenData = false;
  for (const b of raw) {
    if (b === 0xff) return true;
    if (b === 0 && seenData) return true;       // NUL tras contenido: bytes dañados
    if (b !== 0 && b !== 0x20) seenData = true;
    if (b < 0x20 && b !== 0 && b !== 0x09) return true; // control no imprimible
  }
  return false;
}

function typeIssue(type: string, text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  if ((type === 'N' || type === 'F') && !/^-?\d*\.?\d+$|^-?\d+\.$/.test(t)) return 'valor no numérico en campo numérico';
  if (type === 'D' && !/^\d{8}$/.test(t)) return 'fecha con formato inválido';
  if (type === 'L' && !/^[TtFfYyNn?]$/.test(t)) return 'valor lógico inválido';
  return null;
}

export function detectEncoding(sample: Uint8Array, langByte?: number): { encoding: string; basis: string } {
  if (sample.length >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) return { encoding: 'utf-8', basis: 'BOM UTF-8' };
  let ascii = true;
  for (const b of sample) if (b > 0x7f) { ascii = false; break; }
  if (ascii) return { encoding: 'ascii', basis: 'todos los bytes < 0x80' };
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample);
    return { encoding: 'utf-8', basis: 'secuencias UTF-8 válidas (estimación)' };
  } catch {
    if (langByte !== undefined && LANG_BYTE[langByte]) return { encoding: LANG_BYTE[langByte], basis: `byte de idioma 0x${langByte.toString(16)}` };
    return { encoding: 'windows-1252', basis: 'no es UTF-8 válido; se asume Windows-1252 (estimación)' };
  }
}

export function scanDbf(bytes: Uint8Array, maxRecords = 10_000): DbfScan {
  const findings: Finding[] = [];
  const unrecoverable: Unrecoverable[] = [];
  const empty: DbfScan = {
    headerOk: false, version: null, lastUpdate: null, declaredRecords: 0, recordLength: 0, headerLength: 0,
    encoding: 'desconocida', encodingBasis: '', fields: [], records: [], findings, unrecoverable, truncated: false,
  };
  if (bytes.length < 33) {
    findings.push({ severity: 'dano', code: 'cabecera_truncada', message: `El archivo tiene ${bytes.length} bytes; la cabecera DBF requiere al menos 33.`, offset: 0 });
    if (bytes.length > 0) unrecoverable.push({ start: 0, end: bytes.length, reason: 'cabecera truncada' });
    return empty;
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[0];
  const yy = bytes[1], mm = bytes[2], dd = bytes[3];
  const declared = dv.getUint32(4, true);
  let headerLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const langByte = bytes[29];

  let lastUpdate: string | null = null;
  if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) lastUpdate = `${yy >= 80 ? 1900 + yy : 2000 + yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  else findings.push({ severity: 'aviso', code: 'fecha_invalida', message: `Fecha de última modificación inválida (${yy}-${mm}-${dd}).`, offset: 1 });

  // Descriptores de campo
  const fields: ScanField[] = [];
  let p = 32, terminated = false, fieldOffset = 1;
  while (p + 32 <= bytes.length && p < Math.max(headerLen - 1, 33 + 32 * 255)) {
    if (bytes[p] === 0x0d) { terminated = true; break; }
    let end = p; while (end < p + 11 && bytes[end] !== 0) end++;
    const name = new TextDecoder('latin1').decode(bytes.subarray(p, end)).trim();
    const type = String.fromCharCode(bytes[p + 11]);
    const length = bytes[p + 16], decimals = bytes[p + 17];
    if (!name || !FIELD_TYPES.has(type) || length === 0) {
      findings.push({ severity: 'dano', code: 'descriptor_invalido', message: `Descriptor de campo ${fields.length + 1} ilegible o inválido.`, offset: p });
      unrecoverable.push({ start: p, end: p + 32, reason: 'descriptor de campo inválido' });
      break;
    }
    fields.push({ name, type, length, decimals, offset: fieldOffset });
    fieldOffset += length;
    p += 32;
  }
  if (!terminated) findings.push({ severity: 'dano', code: 'terminador_cabecera_ausente', message: 'No se encontró el terminador de cabecera (0x0D).', offset: p });
  const computedHeader = 32 + 32 * fields.length + 1;
  if (headerLen !== computedHeader) {
    findings.push({ severity: 'aviso', code: 'longitud_cabecera_inconsistente', message: `La cabecera declara ${headerLen} bytes pero los descriptores implican ${computedHeader}; se usa ${computedHeader}.`, offset: 8 });
    headerLen = computedHeader;
  }
  const fieldsTotal = fields.reduce((n, f) => n + f.length, 0) + 1;
  if (fields.length === 0) {
    findings.push({ severity: 'dano', code: 'sin_campos', message: 'No se pudo leer ningún campo; los registros no son interpretables.' });
    return { ...empty, version, lastUpdate, declaredRecords: declared, recordLength: recLen, headerLength: headerLen, fields };
  }
  if (fieldsTotal !== recLen) {
    findings.push({ severity: 'dano', code: 'longitud_registro_inconsistente', message: `La longitud de registro declarada (${recLen}) no coincide con la suma de campos (${fieldsTotal}); se usa ${fieldsTotal}.`, offset: 10 });
  }
  const rl = fieldsTotal;

  // Codificación
  const dataStart = headerLen;
  const sample = bytes.subarray(dataStart, Math.min(bytes.length, dataStart + 8192));
  const enc = detectEncoding(sample, LANG_BYTE[langByte] ? langByte : undefined);
  const decoder = new TextDecoder(enc.encoding === 'ascii' ? 'utf-8' : enc.encoding);

  // Registros
  let dataEnd = bytes.length;
  const hasEof = bytes[bytes.length - 1] === 0x1a;
  if (hasEof) dataEnd--; else findings.push({ severity: 'info', code: 'marca_fin_ausente', message: 'Falta la marca de fin de archivo (0x1A).', offset: bytes.length });
  const available = Math.max(0, dataEnd - dataStart);
  const full = Math.floor(available / rl);
  const remainder = available - full * rl;
  const toRead = Math.min(full, Math.max(declared, 0) || full, maxRecords);
  let truncated = false;

  if (full < declared) {
    truncated = true;
    findings.push({ severity: 'dano', code: 'truncamiento', message: `Se declaran ${declared} registros pero solo caben ${full} completos; el archivo termina en el offset ${bytes.length}.`, offset: dataStart + full * rl });
  } else if (full > declared) {
    findings.push({ severity: 'aviso', code: 'registros_extra', message: `Hay datos para ${full} registros pero la cabecera declara ${declared}; se leen ${declared}.`, offset: 4 });
    if (declared < full) unrecoverable.push({ start: dataStart + declared * rl, end: dataStart + full * rl, reason: 'registros fuera del conteo declarado (no leídos)' });
  }

  const records: ScanRecord[] = [];
  const readRecord = (n: number, off: number, avail: number): ScanRecord => {
    const flag = bytes[off];
    const rec: ScanRecord = { recordNumber: n, offset: off, deleted: flag === 0x2a, values: {}, unknownFields: [], intact: true, issues: [] };
    if (flag !== 0x20 && flag !== 0x2a) { rec.issues.push(`byte de borrado inválido (0x${flag.toString(16)})`); rec.intact = false; }
    for (const f of fields) {
      const s = off + f.offset;
      if (f.offset + f.length > avail) {
        rec.unknownFields.push(f.name); rec.values[f.name] = ''; rec.intact = false;
        continue;
      }
      const raw = bytes.subarray(s, s + f.length);
      if (isCorrupt(raw)) {
        rec.unknownFields.push(f.name); rec.values[f.name] = ''; rec.intact = false;
        rec.issues.push(`campo ${f.name}: bytes corruptos`);
        unrecoverable.push({ start: s, end: s + f.length, reason: `campo ${f.name} corrupto`, record: n });
        continue;
      }
      const text = decoder.decode(raw).replace(/[\0\s]+$/, '').replace(/^\s+/, '');
      const ti = typeIssue(f.type, text);
      if (ti) { rec.issues.push(`campo ${f.name}: ${ti}`); rec.intact = false; }
      rec.values[f.name] = text;
    }
    return rec;
  };

  for (let i = 0; i < toRead; i++) records.push(readRecord(i + 1, dataStart + i * rl, rl));
  if (full > maxRecords) findings.push({ severity: 'aviso', code: 'limite_registros', message: `Se leyeron ${maxRecords} registros; el límite configurado impide leer más.` });

  // Registro parcial al final (truncamiento a mitad de registro)
  if (truncated && remainder > 0) {
    const n = full + 1;
    const off = dataStart + full * rl;
    const part = readRecord(n, off, remainder);
    part.issues.push(`registro truncado: solo ${remainder} de ${rl} bytes`);
    part.intact = false;
    records.push(part);
    unrecoverable.push({ start: off + remainder, end: off + rl, reason: 'bytes finales del registro ausentes', record: n });
    findings.push({ severity: 'dano', code: 'registro_parcial', message: `El registro ${n} está incompleto (${remainder}/${rl} bytes); se recuperan solo los campos completos.`, offset: off, record: n });
  }
  if (truncated) {
    const lost = declared - records.length;
    if (lost > 0) unrecoverable.push({ start: dataStart + records.length * rl, end: dataStart + declared * rl, reason: `${lost} registros declarados ausentes del archivo` });
  }
  for (const r of records) if (!r.intact && r.issues.length && !r.issues.some(i => i.startsWith('registro truncado'))) {
    findings.push({ severity: 'dano', code: 'registro_danado', message: `Registro ${r.recordNumber}: ${r.issues.join('; ')}.`, offset: r.offset, record: r.recordNumber });
  }

  return {
    headerOk: terminated, version, lastUpdate, declaredRecords: declared, recordLength: rl, headerLength: headerLen,
    encoding: enc.encoding, encodingBasis: enc.basis, fields, records, findings, unrecoverable, truncated,
  };
}
