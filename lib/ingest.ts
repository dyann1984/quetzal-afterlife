/**
 * lib/ingest.ts — Ingestion Gateway
 * Quetzal Afterlife · Resurrection Engine
 *
 * Identifica el formato por firma y estructura (no solo por extensión), calcula
 * SHA-256 y entrega una copia de trabajo. El original nunca se modifica ni se
 * ejecuta: el contenido solo se lee como bytes.
 */

export type FormatId = 'dbf' | 'csv' | 'sqlite' | 'rechazado' | 'desconocido';

export interface Limits {
  maxBytes: number;
  maxRecords: number;
}

export const DEFAULT_LIMITS: Limits = { maxBytes: 4 * 1024 * 1024, maxRecords: 10_000 };

export interface Sniff {
  format: FormatId;
  confidence: 'alta' | 'media' | 'baja';
  signals: string[];
}

export interface EvidenceRef {
  id: string;               // sha256 truncado: identidad estable por contenido
  name: string;
  size: number;
  sha256: string;
  format: FormatId;
  confidence: Sniff['confidence'];
  signals: string[];
  ingestedAt: string;
}

export interface Ingested {
  evidence: EvidenceRef;
  /** Copia de trabajo. Los módulos de análisis solo la leen. */
  bytes: Uint8Array;
}

const DBF_VERSIONS = new Set([0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x43, 0x63, 0x83, 0x8b, 0xcb, 0xf5, 0xfb]);
const SQLITE_MAGIC = 'SQLite format 3\0';

export class IngestError extends Error {
  constructor(public code: 'demasiado_grande' | 'vacio', message: string) {
    super(message);
    this.name = 'IngestError';
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes); // ArrayBuffer propio, evita vistas compartidas
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[i] !== text.charCodeAt(i)) return false;
  return true;
}

/** Plausibilidad de cabecera DBF: versión conocida, longitudes coherentes. */
function dbfPlausibility(bytes: Uint8Array): { ok: boolean; terminator: boolean } {
  if (bytes.length < 33 || !DBF_VERSIONS.has(bytes[0])) return { ok: false, terminator: false };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const month = bytes[2], day = bytes[3];
  if (headerLen < 33 || recLen < 2 || month < 1 || month > 12 || day < 1 || day > 31) return { ok: false, terminator: false };
  if ((headerLen - 33) % 32 !== 0 && headerLen > bytes.length) return { ok: false, terminator: false };
  const terminator = headerLen <= bytes.length && bytes[headerLen - 1] === 0x0d;
  return { ok: true, terminator };
}

export function sniffFormat(bytes: Uint8Array, name: string): Sniff {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const signals: string[] = [];

  if (startsWith(bytes, 'MZ') || startsWith(bytes, '\x7fELF') || startsWith(bytes, '#!')) {
    return { format: 'rechazado', confidence: 'alta', signals: ['firma de ejecutable o script: no se procesa'] };
  }
  if (startsWith(bytes, SQLITE_MAGIC)) {
    signals.push('firma "SQLite format 3"');
    return { format: 'sqlite', confidence: 'alta', signals };
  }
  const dbf = dbfPlausibility(bytes);
  if (dbf.ok) {
    signals.push(`byte de versión 0x${bytes[0].toString(16)} y longitudes de cabecera coherentes`);
    if (!dbf.terminator) signals.push('terminador de cabecera (0x0D) ausente: posible daño');
    if (ext !== 'dbf') signals.push(`la extensión ".${ext}" no coincide con el contenido DBF`);
    return { format: 'dbf', confidence: dbf.terminator ? 'alta' : 'media', signals };
  }
  // Texto delimitado: sin NUL y con separador en la primera línea
  const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
  let nul = 0;
  for (const b of sample) if (b === 0) nul++;
  if (sample.length > 0 && nul === 0) {
    const firstLine = new TextDecoder('latin1').decode(sample).split(/\r?\n/)[0];
    const sep = [',', ';', '\t', '|'].find(s => firstLine.includes(s));
    if (sep) {
      signals.push(`texto sin bytes nulos con delimitador ${JSON.stringify(sep)} en la primera línea`);
      if (ext !== 'csv' && ext !== 'txt') signals.push(`la extensión ".${ext}" no es la habitual para texto delimitado`);
      return { format: 'csv', confidence: ext === 'csv' ? 'alta' : 'media', signals };
    }
  }
  return { format: 'desconocido', confidence: 'baja', signals: ['sin firma ni estructura reconocida'] };
}

export async function ingest(
  input: Uint8Array,
  name: string,
  now: string,
  limits: Limits = DEFAULT_LIMITS,
): Promise<Ingested> {
  if (input.length === 0) throw new IngestError('vacio', `"${name}" está vacío.`);
  if (input.length > limits.maxBytes) {
    throw new IngestError('demasiado_grande', `"${name}" supera el límite de ${(limits.maxBytes / 1048576).toFixed(0)} MB.`);
  }
  const bytes = new Uint8Array(input); // copia de trabajo
  const sha256 = await sha256Hex(bytes);
  const sniff = sniffFormat(bytes, name);
  return {
    bytes,
    evidence: {
      id: sha256.slice(0, 12), name: name.slice(0, 120), size: bytes.length, sha256,
      format: sniff.format, confidence: sniff.confidence, signals: sniff.signals, ingestedAt: now,
    },
  };
}

/** Comprueba que unos bytes siguen siendo idénticos a la evidencia registrada. */
export async function verifyIntegrity(evidence: EvidenceRef, bytes: Uint8Array): Promise<boolean> {
  return (await sha256Hex(bytes)) === evidence.sha256;
}
