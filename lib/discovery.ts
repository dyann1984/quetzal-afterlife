/**
 * lib/discovery.ts — Format Discovery Engine
 * Quetzal Afterlife · Resurrection Engine
 *
 * Contrato de adaptadores: cada formato implementa `FormatAdapter`. Agregar un
 * formato nuevo = agregar un adaptador al registro; nada más cambia.
 *
 * Compatibilidad declarada (con pruebas): CSV/texto delimitado, DBF (dBASE III/IV/FoxPro,
 * lectura tolerante). SQLite: SOLO diagnóstico de cabecera; no se leen tablas.
 */

import type { FormatId, EvidenceRef } from './ingest';
import { scanDbf, type Finding } from './dbf-scan';
import { scanCsv } from './csv-scan';

export interface DiagTable {
  name: string;
  columns: Array<{ name: string; type?: string }>;
  declaredRecords?: number;
  readableRecords: number;
}

export interface Diagnosis {
  format: FormatId;
  adapter: string;
  supportLevel: 'lectura-tolerante' | 'solo-diagnostico' | 'sin-soporte';
  encoding?: string;
  encodingBasis?: string;
  metadata: Record<string, string | number>;
  tables: DiagTable[];
  findings: Finding[];
  /** true si hay daños que afectan la lectura. */
  damaged: boolean;
}

export interface FormatAdapter {
  id: FormatId;
  label: string;
  diagnose(bytes: Uint8Array, name: string): Diagnosis;
}

const tableName = (name: string) => name.replace(/\.[^.]+$/, '').toUpperCase();

export const dbfAdapter: FormatAdapter = {
  id: 'dbf',
  label: 'dBASE / FoxPro (DBF)',
  diagnose(bytes, name) {
    const s = scanDbf(bytes);
    const versionNames: Record<number, string> = { 2: 'FoxBase', 3: 'dBASE III (sin memo)', 4: 'dBASE IV (sin memo)', 5: 'dBASE 5', 0x30: 'Visual FoxPro', 0x83: 'dBASE III con memo', 0x8b: 'dBASE IV con memo', 0xf5: 'FoxPro con memo' };
    return {
      format: 'dbf', adapter: 'dbf', supportLevel: 'lectura-tolerante',
      encoding: s.encoding, encodingBasis: s.encodingBasis,
      metadata: {
        variante: s.version === null ? 'desconocida' : (versionNames[s.version] ?? `versión 0x${s.version.toString(16)}`),
        'última modificación': s.lastUpdate ?? 'inválida',
        'registros declarados': s.declaredRecords,
        'registros leídos': s.records.length,
        'longitud de registro': s.recordLength,
        'registros íntegros': s.records.filter(r => r.intact).length,
      },
      tables: [{
        name: tableName(name),
        columns: s.fields.map(f => ({ name: f.name, type: `${f.type}(${f.length}${f.decimals ? ',' + f.decimals : ''})` })),
        declaredRecords: s.declaredRecords, readableRecords: s.records.length,
      }],
      findings: s.findings,
      damaged: s.findings.some(f => f.severity === 'dano'),
    };
  },
};

export const csvAdapter: FormatAdapter = {
  id: 'csv',
  label: 'Texto delimitado (CSV)',
  diagnose(bytes, name) {
    const s = scanCsv(bytes);
    return {
      format: 'csv', adapter: 'csv', supportLevel: 'lectura-tolerante',
      encoding: s.encoding, encodingBasis: s.encodingBasis,
      metadata: { delimitador: JSON.stringify(s.delimiter), columnas: s.headers.length, 'filas de datos': s.rows.length },
      tables: [{ name: tableName(name), columns: s.headers.map(h => ({ name: h })), readableRecords: s.rows.length }],
      findings: s.findings,
      damaged: s.findings.some(f => f.severity === 'dano'),
    };
  },
};

/** SQLite: diagnóstico de cabecera de 100 bytes. No lee tablas. */
export const sqliteAdapter: FormatAdapter = {
  id: 'sqlite',
  label: 'SQLite 3 (solo diagnóstico)',
  diagnose(bytes) {
    const findings: Finding[] = [];
    const metadata: Record<string, string | number> = {};
    let encoding: string | undefined;
    if (bytes.length < 100) {
      findings.push({ severity: 'dano', code: 'cabecera_truncada', message: 'Menos de 100 bytes: la cabecera SQLite está incompleta.', offset: 0 });
    } else {
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let pageSize = dv.getUint16(16, false);
      if (pageSize === 1) pageSize = 65536;
      const pages = dv.getUint32(28, false);
      const enc = dv.getUint32(56, false);
      encoding = ({ 1: 'utf-8', 2: 'utf-16le', 3: 'utf-16be' } as Record<number, string>)[enc];
      const pow2 = pageSize >= 512 && (pageSize & (pageSize - 1)) === 0;
      metadata['tamaño de página'] = pageSize;
      metadata['páginas declaradas'] = pages;
      metadata['codificación declarada'] = encoding ?? `código ${enc}`;
      if (!pow2) findings.push({ severity: 'dano', code: 'tamano_pagina_invalido', message: `Tamaño de página inválido (${pageSize}).`, offset: 16 });
      else if (pages > 0 && bytes.length < pages * pageSize) {
        findings.push({ severity: 'dano', code: 'truncamiento', message: `La cabecera declara ${pages} páginas (${pages * pageSize} bytes) pero el archivo tiene ${bytes.length}.`, offset: bytes.length });
      } else if (pages > 0 && bytes.length % pageSize !== 0) {
        findings.push({ severity: 'aviso', code: 'tamano_no_multiplo', message: 'El tamaño del archivo no es múltiplo del tamaño de página.' });
      }
      findings.push({ severity: 'info', code: 'sin_lectura_de_tablas', message: 'Este adaptador solo diagnostica la cabecera; las tablas no se leen todavía.' });
    }
    return { format: 'sqlite', adapter: 'sqlite', supportLevel: 'solo-diagnostico', encoding, metadata, tables: [], findings, damaged: findings.some(f => f.severity === 'dano') };
  },
};

export const ADAPTERS: Record<string, FormatAdapter> = { dbf: dbfAdapter, csv: csvAdapter, sqlite: sqliteAdapter };

export function diagnose(evidence: Pick<EvidenceRef, 'format' | 'name'>, bytes: Uint8Array): Diagnosis {
  const adapter = ADAPTERS[evidence.format];
  if (!adapter) {
    const rejected = evidence.format === 'rechazado';
    return {
      format: evidence.format, adapter: 'ninguno', supportLevel: 'sin-soporte', metadata: {}, tables: [],
      findings: [{ severity: rejected ? 'dano' : 'aviso', code: rejected ? 'archivo_rechazado' : 'formato_desconocido', message: rejected ? 'Archivo ejecutable o script: se rechaza y no se procesa.' : 'Formato no reconocido: no hay adaptador disponible.' }],
      damaged: rejected,
    };
  }
  return adapter.diagnose(bytes, evidence.name);
}
