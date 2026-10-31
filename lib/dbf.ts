/**
 * lib/dbf.ts — Motor de Arqueología DBF
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Parser puro de archivos dBASE / FoxPro en el navegador (o Node ≥ 18).
 * Sin I/O de red, sin acceso al DOM, sin efectos secundarios.
 * Todo valor recuperado se trata como texto opaco; nunca se evalúa como código.
 *
 * Compatibilidad demostrada: dBASE III (0x03), dBASE IV (0x04).
 * dBASE 5/FoxPro/VFP: aceptados por byte de versión, sin fixtures adicionales verificados.
 *
 * Limitación documentada (2026-10-30):
 *   Node.js v22 no soporta ibm437/ibm850/ibm852 en TextDecoder (WHATWG ICU recortado).
 *   Se usa tabla de mapeo manual (CP437_MAP, CP850_MAP) para esas codificaciones.
 *   windows-1250/1251/1252/1253/1254 sí son soportados por TextDecoder en Node.js v22.
 */

// ─── Constantes ───────────────────────────────────────────────────────────────

export const MAX_DBF_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_DBF_RECORDS = 10_000;

// ─── Tipos de error y advertencia ─────────────────────────────────────────────

export type DbfErrorCode =
  | 'ExtensionInvalida'
  | 'ArchivoVacio'
  | 'ArchivoDemasiadoGrande'
  | 'FormatoNoSoportado'
  | 'EncabezadoTruncado'
  | 'TamanioRegistroInconsistente'
  | 'NumCamposInconsistente'
  | 'ExcesoDeCampos'
  | 'CampoInvalido'
  | 'EncabezadoFalsificado'
  | 'RegistroTruncado';

export class DbfError extends Error {
  constructor(
    public readonly code: DbfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DbfError';
  }
}

export type DbfWarningCode =
  | 'CodificacionDesconocida'
  | 'CodificacionNoSoportada'
  | 'TipoDesconocido'
  | 'CampoDuplicado'
  | 'CaracteresControlEliminados'
  | 'RegistrosBorrados'
  | 'RegistrosTruncados'
  | 'RegistroCorrupto'
  | 'NumCamposNoAlineado';

export interface DbfWarning {
  code: DbfWarningCode;
  message: string;
  context?: string;
}

// ─── Interfaces de resultado ───────────────────────────────────────────────────

export interface DbfField {
  name: string;
  type: string;
  length: number;
  decimalCount: number;
  typeKnown: boolean;
}

export interface DbfRecord {
  deleted: boolean;
  corrupt: boolean;
  corruptOffset?: number;
  values: Record<string, string>;
}

export interface DbfMeta {
  versionByte: number;
  versionLabel: string;
  encodingByte: number;
  encodingLabel: string;
  lastModified: string;
  recordCount: number;
  recordCountActual: number;
  deletedCount: number;
  fieldCount: number;
  recordSize: number;
  headerSize: number;
  warningCount: number;
}

export interface DbfResult {
  meta: DbfMeta;
  fields: DbfField[];
  records: DbfRecord[];
  warnings: DbfWarning[];
}

// ─── Tablas de mapeo ───────────────────────────────────────────────────────────

/** Bytes de versión soportados → etiqueta legible */
const VERSION_MAP: Record<number, string> = {
  0x03: 'dBASE III (sin memo)',
  0x04: 'dBASE IV (sin memo)',
  0x05: 'dBASE 5.0 (sin memo)',
  0x83: 'dBASE III (con memo)',
  0x8b: 'dBASE IV (con memo)',
  0xf5: 'FoxPro 2.x (con memo)',
  0x30: 'Visual FoxPro',
};

/**
 * Byte 29 del encabezado → etiqueta de codificación WHATWG.
 * null = codificación que Node.js v22 no soporta via TextDecoder;
 *        se usa decodificador manual.
 * undefined = no mapeada (advertencia).
 */
const ENCODING_MAP: Record<number, string | null> = {
  0x00: 'utf-8',     // desconocida → fallback UTF-8 con advertencia
  0x01: null,        // CP437 DOS EE.UU. — decodificador manual
  0x02: null,        // CP850 DOS Multilingüe — decodificador manual
  0x64: null,        // CP852 DOS Centroeuropeo — decodificador manual
  0x96: 'windows-1251',
  0xc8: 'windows-1250',
  0xc9: 'windows-1251',
  0xca: 'windows-1254',
  0xcb: 'windows-1253',
};

const ENCODING_LABEL: Record<number, string> = {
  0x00: 'desconocida',
  0x01: 'cp437 (DOS EE.UU.) — tabla manual',
  0x02: 'cp850 (DOS Multilingüe) — tabla manual',
  0x64: 'cp852 (DOS Centroeuropeo) — tabla manual',
  0x96: 'windows-1251',
  0xc8: 'windows-1250',
  0xc9: 'windows-1251',
  0xca: 'windows-1254',
  0xcb: 'windows-1253',
};

/** Tipos de campo reconocidos */
const KNOWN_FIELD_TYPES = new Set(['C', 'N', 'D', 'L', 'M', 'F', 'G', 'P']);

// ─── Tablas de codificación DOS (manual) ──────────────────────────────────────
// Solo los bytes 0x80–0xFF; los bytes 0x00–0x7F son ASCII idénticos en UTF-8.

/**
 * CP437 bytes 0x80–0xFF → Unicode code points.
 * Fuente: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP437.TXT
 * (valores verificados contra la tabla oficial Unicode)
 */
const CP437_HIGH: number[] = [
  // 0x80–0x8F
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  // 0x90–0x9F
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00a2, 0x00a3, 0x00a5, 0x20a7, 0x0192,
  // 0xA0–0xAF
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x2310, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  // 0xB0–0xBF
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x2561, 0x2562, 0x2556,
  0x2555, 0x2563, 0x2551, 0x2557, 0x255d, 0x255c, 0x255b, 0x2510,
  // 0xC0–0xCF
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x255e, 0x255f,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x2567,
  // 0xD0–0xDF
  0x2568, 0x2564, 0x2565, 0x2559, 0x2558, 0x2552, 0x2553, 0x256b,
  0x256a, 0x2518, 0x250c, 0x2588, 0x2584, 0x258c, 0x2590, 0x2580,
  // 0xE0–0xEF
  0x03b1, 0x00df, 0x0393, 0x03c0, 0x03a3, 0x03c3, 0x00b5, 0x03c4,
  0x03a6, 0x0398, 0x03a9, 0x03b4, 0x221e, 0x03c6, 0x03b5, 0x2229,
  // 0xF0–0xFF
  0x2261, 0x00b1, 0x2265, 0x2264, 0x2320, 0x2321, 0x00f7, 0x2248,
  0x00b0, 0x2219, 0x00b7, 0x221a, 0x207f, 0x00b2, 0x25a0, 0x00a0,
];

/**
 * CP850 bytes 0x80–0xFF → Unicode code points.
 * Fuente: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP850.TXT
 */
const CP850_HIGH: number[] = [
  // 0x80–0x8F
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x00e0, 0x00e5, 0x00e7,
  0x00ea, 0x00eb, 0x00e8, 0x00ef, 0x00ee, 0x00ec, 0x00c4, 0x00c5,
  // 0x90–0x9F
  0x00c9, 0x00e6, 0x00c6, 0x00f4, 0x00f6, 0x00f2, 0x00fb, 0x00f9,
  0x00ff, 0x00d6, 0x00dc, 0x00f8, 0x00a3, 0x00d8, 0x00d7, 0x0192,
  // 0xA0–0xAF
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x00f1, 0x00d1, 0x00aa, 0x00ba,
  0x00bf, 0x00ae, 0x00ac, 0x00bd, 0x00bc, 0x00a1, 0x00ab, 0x00bb,
  // 0xB0–0xBF
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00c1, 0x00c2, 0x00c0,
  0x00a9, 0x2563, 0x2551, 0x2557, 0x255d, 0x00a2, 0x00a5, 0x2510,
  // 0xC0–0xCF
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x00e3, 0x00c3,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x00a4,
  // 0xD0–0xDF
  0x00f0, 0x00d0, 0x00ca, 0x00cb, 0x00c8, 0x0131, 0x00cd, 0x00ce,
  0x00cf, 0x2518, 0x250c, 0x2588, 0x2584, 0x00a6, 0x00cc, 0x2580,
  // 0xE0–0xEF
  0x00d3, 0x00df, 0x00d4, 0x00d2, 0x00f5, 0x00d5, 0x00b5, 0x00fe,
  0x00de, 0x00da, 0x00db, 0x00d9, 0x00fd, 0x00dd, 0x00af, 0x00b4,
  // 0xF0–0xFF
  0x00ad, 0x00b1, 0x2017, 0x00be, 0x00b6, 0x00a7, 0x00f7, 0x00b8,
  0x00b0, 0x00a8, 0x00b7, 0x00b9, 0x00b3, 0x00b2, 0x25a0, 0x00a0,
];

/**
 * CP852 bytes 0x80–0xFF → Unicode code points.
 * Fuente: https://www.unicode.org/Public/MAPPINGS/VENDORS/MICSFT/PC/CP852.TXT
 */
const CP852_HIGH: number[] = [
  // 0x80–0x8F
  0x00c7, 0x00fc, 0x00e9, 0x00e2, 0x00e4, 0x016f, 0x0107, 0x00e7,
  0x0142, 0x00eb, 0x0150, 0x0151, 0x00ee, 0x0179, 0x00c4, 0x0106,
  // 0x90–0x9F
  0x00c9, 0x0139, 0x013a, 0x00f4, 0x00f6, 0x013d, 0x013e, 0x015a,
  0x015b, 0x00d6, 0x00dc, 0x0164, 0x0165, 0x0141, 0x00d7, 0x010d,
  // 0xA0–0xAF
  0x00e1, 0x00ed, 0x00f3, 0x00fa, 0x0104, 0x0105, 0x017d, 0x017e,
  0x0118, 0x0119, 0x00ac, 0x017a, 0x010c, 0x015f, 0x00ab, 0x00bb,
  // 0xB0–0xBF
  0x2591, 0x2592, 0x2593, 0x2502, 0x2524, 0x00c1, 0x00c2, 0x011a,
  0x015e, 0x2563, 0x2551, 0x2557, 0x255d, 0x017b, 0x017c, 0x2510,
  // 0xC0–0xCF
  0x2514, 0x2534, 0x252c, 0x251c, 0x2500, 0x253c, 0x0102, 0x0103,
  0x255a, 0x2554, 0x2569, 0x2566, 0x2560, 0x2550, 0x256c, 0x00a4,
  // 0xD0–0xDF
  0x0111, 0x0110, 0x010e, 0x00cb, 0x010f, 0x0147, 0x00cd, 0x00ce,
  0x011b, 0x2518, 0x250c, 0x2588, 0x2584, 0x0162, 0x016e, 0x2580,
  // 0xE0–0xEF
  0x00d3, 0x00df, 0x00d4, 0x0143, 0x0144, 0x0148, 0x0160, 0x0161,
  0x0154, 0x00da, 0x0155, 0x0170, 0x00fd, 0x00dd, 0x0163, 0x00b4,
  // 0xF0–0xFF
  0x00ad, 0x02dd, 0x02db, 0x02c7, 0x02d8, 0x0161, 0x00f7, 0x00b8,
  0x00b0, 0x00a8, 0x02d9, 0x0171, 0x0158, 0x0159, 0x25a0, 0x00a0,
];

// ─── Decodificador manual para codificaciones DOS ──────────────────────────────

function decodeWithTable(bytes: Uint8Array, table: number[]): string {
  const chars: string[] = [];
  for (const b of bytes) {
    if (b === 0) break; // terminador de cadena
    if (b < 0x80) {
      chars.push(String.fromCharCode(b));
    } else {
      const cp = table[b - 0x80];
      chars.push(cp !== undefined ? String.fromCodePoint(cp) : '\ufffd');
    }
  }
  return chars.join('');
}

// ─── Función de decodificación de campo ──────────────────────────────────────

function decodeField(
  raw: Uint8Array,
  encodingByte: number,
): string {
  // Terminar en byte nulo
  const nullIdx = raw.indexOf(0);
  const slice = nullIdx === -1 ? raw : raw.subarray(0, nullIdx);

  switch (encodingByte) {
    case 0x01: return decodeWithTable(slice, CP437_HIGH);
    case 0x02: return decodeWithTable(slice, CP850_HIGH);
    case 0x64: return decodeWithTable(slice, CP852_HIGH);
    default: {
      // Para windows-125x y UTF-8
      const whatwg = ENCODING_MAP[encodingByte];
      const label = typeof whatwg === 'string' && whatwg !== 'utf-8' ? whatwg : 'utf-8';
      try {
        return new TextDecoder(label, { fatal: false }).decode(slice);
      } catch {
        return new TextDecoder('utf-8', { fatal: false }).decode(slice);
      }
    }
  }
}

// ─── Función principal ─────────────────────────────────────────────────────────

export function parseDbf(bytes: Uint8Array, filename: string): DbfResult {
  const warnings: DbfWarning[] = [];

  // ── Validaciones previas ──────────────────────────────────────────────────
  if (!filename.toLowerCase().endsWith('.dbf')) {
    throw new DbfError(
      'ExtensionInvalida',
      'Selecciona un archivo con extensión .dbf.',
    );
  }
  if (bytes.length === 0) {
    throw new DbfError('ArchivoVacio', 'El archivo DBF está vacío.');
  }
  if (bytes.length > MAX_DBF_BYTES) {
    throw new DbfError(
      'ArchivoDemasiadoGrande',
      `El archivo supera el límite de 4 MB (${(bytes.length / 1024 / 1024).toFixed(2)} MB).`,
    );
  }
  if (bytes.length < 32) {
    throw new DbfError(
      'EncabezadoTruncado',
      `El archivo es demasiado corto para contener un encabezado DBF válido (${bytes.length} bytes).`,
    );
  }

  const versionByte = bytes[0];
  if (!(versionByte in VERSION_MAP)) {
    throw new DbfError(
      'FormatoNoSoportado',
      `Formato DBF no soportado: byte de versión 0x${versionByte.toString(16).padStart(2, '0')}.`,
    );
  }

  // ── Encabezado principal ──────────────────────────────────────────────────
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const lastModYY = bytes[1];
  const lastModMM = bytes[2];
  const lastModDD = bytes[3];
  // dBASE almacena el año como offset desde 1900
  const year = lastModYY + 1900;
  const lastModified = `${year}-${String(lastModMM).padStart(2, '0')}-${String(lastModDD).padStart(2, '0')}`;

  const recordCount = view.getUint32(4, true);
  const headerSize  = view.getUint16(8, true);
  const recordSize  = view.getUint16(10, true);
  const encodingByte = bytes[29];

  // Validar encabezado
  if (headerSize < 32) {
    throw new DbfError(
      'EncabezadoTruncado',
      `El tamaño de encabezado declarado (${headerSize}) es inválido.`,
    );
  }
  if (bytes.length < headerSize) {
    throw new DbfError(
      'EncabezadoTruncado',
      `El archivo está truncado: encabezado declara ${headerSize} bytes pero el archivo tiene ${bytes.length}.`,
    );
  }

  // Protección contra encabezados falsificados (RF-07.4)
  const projectedSize = headerSize + recordCount * recordSize;
  if (projectedSize > bytes.length + 1_048_576) {
    throw new DbfError(
      'EncabezadoFalsificado',
      `El encabezado declara ${recordCount} registros de ${recordSize} bytes, ` +
      `lo que proyecta ${projectedSize} bytes pero el archivo solo tiene ${bytes.length}. ` +
      `Posible encabezado falsificado.`,
    );
  }

  // Número de campos: (headerSize - 32 - 1) / 32
  // El byte 0x0D (terminator) ocupa 1 byte al final de los descriptores
  const rawFieldCount = (headerSize - 32 - 1) / 32;
  if (!Number.isInteger(rawFieldCount)) {
    warnings.push({
      code: 'NumCamposNoAlineado',
      message: `El tamaño del encabezado (${headerSize}) no está alineado con bloques de descriptor de 32 bytes.`,
    });
  }
  const numFields = Math.floor(rawFieldCount);
  if (numFields > 255) {
    throw new DbfError(
      'ExcesoDeCampos',
      `El archivo declara ${numFields} campos; el máximo soportado es 255.`,
    );
  }

  // Codificación
  let encodingLabel: string;
  if (encodingByte in ENCODING_LABEL) {
    encodingLabel = ENCODING_LABEL[encodingByte];
    if (encodingByte === 0x00) {
      warnings.push({
        code: 'CodificacionDesconocida',
        message: 'El archivo no especifica codificación (byte 29 = 0x00). Se asume UTF-8.',
      });
    }
  } else {
    encodingLabel = `desconocida (0x${encodingByte.toString(16).padStart(2, '0')})`;
    warnings.push({
      code: 'CodificacionDesconocida',
      message: `Byte de codificación 0x${encodingByte.toString(16).padStart(2, '0')} no mapeado. Se asume UTF-8.`,
      context: `0x${encodingByte.toString(16).padStart(2, '0')}`,
    });
  }

  // ── Descriptores de campo ─────────────────────────────────────────────────
  const fields: DbfField[] = [];
  const seenNames = new Set<string>();
  let sumFieldLengths = 0;
  let fieldOffset = 32;

  for (let i = 0; i < numFields; i++) {
    // Leer nombre: bytes 0–10 del descriptor, terminado en \0
    const nameBytes = bytes.subarray(fieldOffset, fieldOffset + 11);
    const nullInName = nameBytes.indexOf(0);
    const nameSlice = nullInName === -1 ? nameBytes : nameBytes.subarray(0, nullInName);

    // Sanear caracteres de control
    let rawName = '';
    let hadControl = false;
    for (const b of nameSlice) {
      if (b < 0x20) {
        hadControl = true;
      } else {
        rawName += String.fromCharCode(b);
      }
    }
    if (hadControl) {
      warnings.push({
        code: 'CaracteresControlEliminados',
        message: `Campo ${i + 1}: se eliminaron caracteres de control del nombre.`,
        context: String(i + 1),
      });
    }

    if (!rawName) {
      throw new DbfError(
        'CampoInvalido',
        `El campo en posición ${i + 1} tiene un nombre vacío o nulo.`,
      );
    }

    const typeByte = bytes[fieldOffset + 11];
    const type = String.fromCharCode(typeByte);
    const length = bytes[fieldOffset + 16];
    const decimalCount = bytes[fieldOffset + 17];

    const typeKnown = KNOWN_FIELD_TYPES.has(type);
    if (!typeKnown) {
      warnings.push({
        code: 'TipoDesconocido',
        message: `Campo "${rawName}": tipo desconocido 0x${typeByte.toString(16).padStart(2, '0')} (decimal ${typeByte}).`,
        context: rawName,
      });
    }

    // Detectar duplicados
    const nameLower = rawName.toLowerCase();
    if (seenNames.has(nameLower)) {
      warnings.push({
        code: 'CampoDuplicado',
        message: `Nombre de campo duplicado: "${rawName}" (posición ${i + 1}). Se omite el duplicado.`,
        context: rawName,
      });
      fieldOffset += 32;
      continue;
    }
    seenNames.add(nameLower);

    fields.push({ name: rawName, type, length, decimalCount, typeKnown });
    sumFieldLengths += length;
    fieldOffset += 32;
  }

  // Verificar coherencia del tamaño de registro (RF-02.4)
  if (fields.length > 0 && sumFieldLengths + 1 !== recordSize) {
    throw new DbfError(
      'TamanioRegistroInconsistente',
      `La suma de longitudes de campo (${sumFieldLengths}) + 1 byte de borrado = ${sumFieldLengths + 1}, ` +
      `pero el encabezado declara recordSize = ${recordSize}.`,
    );
  }

  // ── Lectura de registros ──────────────────────────────────────────────────
  const records: DbfRecord[] = [];
  let deletedCount = 0;
  const limit = Math.min(recordCount, MAX_DBF_RECORDS);
  let recOffset = headerSize;

  for (let i = 0; i < limit; i++) {
    if (recOffset + recordSize > bytes.length) {
      throw new DbfError(
        'RegistroTruncado',
        `El archivo está truncado en el registro ${i} (offset ${recOffset}).`,
      );
    }

    const deletionFlag = bytes[recOffset];
    const deleted = deletionFlag === 0x2a; // '*'
    if (deleted) deletedCount++;

    let fieldValOffset = recOffset + 1;
    const values: Record<string, string> = {};
    let corrupt = false;
    let corruptOffset: number | undefined;

    for (const field of fields) {
      try {
        const raw = bytes.subarray(fieldValOffset, fieldValOffset + field.length);
        let value = decodeField(raw, encodingByte);
        // Tipo M: referencia opaca al bloque de memo — no decodificar como texto
        if (field.type === 'M') {
          value = `[memo:${value.trim()}]`;
        } else {
          // RF-04.3: recorte de espacios activado por defecto
          value = value.trim();
        }
        values[field.name] = value;
      } catch {
        corrupt = true;
        corruptOffset = fieldValOffset;
        values[field.name] = '[CORRUPTO]';
      }
      fieldValOffset += field.length;
    }

    if (corrupt) {
      warnings.push({
        code: 'RegistroCorrupto',
        message: `Registro ${i}: error de decodificación en offset ${corruptOffset}.`,
        context: String(i),
      });
    }

    records.push({ deleted, corrupt, ...(corruptOffset !== undefined ? { corruptOffset } : {}), values });
    recOffset += recordSize;
  }

  if (recordCount > MAX_DBF_RECORDS) {
    warnings.push({
      code: 'RegistrosTruncados',
      message: `El archivo contiene ${recordCount} registros; se leyeron solo ${MAX_DBF_RECORDS}. Los demás se omitieron.`,
      context: String(recordCount - MAX_DBF_RECORDS),
    });
  }

  if (deletedCount > 0) {
    warnings.push({
      code: 'RegistrosBorrados',
      message: `${deletedCount} registro${deletedCount > 1 ? 's' : ''} marcado${deletedCount > 1 ? 's' : ''} como borrado${deletedCount > 1 ? 's' : ''} (incluidos en el resultado).`,
      context: String(deletedCount),
    });
  }

  // ── Resultado ─────────────────────────────────────────────────────────────
  const meta: DbfMeta = {
    versionByte,
    versionLabel: VERSION_MAP[versionByte],
    encodingByte,
    encodingLabel,
    lastModified,
    recordCount,
    recordCountActual: records.length,
    deletedCount,
    fieldCount: fields.length,
    recordSize,
    headerSize,
    warningCount: warnings.length,
  };

  return { meta, fields, records, warnings };
}
