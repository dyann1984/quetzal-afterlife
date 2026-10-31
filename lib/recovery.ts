/**
 * lib/recovery.ts — Recovery Engine
 * Quetzal Afterlife · Resurrection Engine
 *
 * Convierte el resultado de los lectores tolerantes en tablas recuperadas con
 * procedencia explícita por registro y por celda:
 *
 *   original    — leído tal cual del archivo, sin anomalías
 *   recuperado  — leído de una zona dañada o irregular; algunos campos pueden faltar
 *   desconocido — celda no legible (aparece en `unknownFields`; su valor NO es un dato)
 *
 * La procedencia "inferido" no la produce este módulo: pertenece a la inferencia de
 * esquema y a la reconstrucción. Aquí nunca se completa ni se estima un valor.
 */

import type { EvidenceRef } from './ingest';
import { scanDbf, type Finding, type Unrecoverable } from './dbf-scan';
import { scanCsv } from './csv-scan';

export type Provenance = 'original' | 'recuperado';

export interface RecoveredRow {
  evidenceId: string;
  /** Posición de origen: nº de registro (DBF) o nº de línea (CSV). */
  ref: number;
  values: Record<string, string>;
  deleted: boolean;
  provenance: Provenance;
  unknownFields: string[];
  issues: string[];
}

export interface RecoveryReport {
  declared: number | null;
  read: number;
  intact: number;
  recoveredDamaged: number;
  lost: number;
  cellsUnknown: number;
  unrecoverable: Unrecoverable[];
  findings: Finding[];
}

export interface RecoveredTable {
  name: string;
  evidenceId: string;
  evidenceName: string;
  columns: Array<{ name: string; type?: string }>;
  rows: RecoveredRow[];
  report: RecoveryReport;
}

export function recoverTable(evidence: Pick<EvidenceRef, 'id' | 'name' | 'format'>, bytes: Uint8Array, maxRecords = 10_000): RecoveredTable | null {
  const name = evidence.name.replace(/\.[^.]+$/, '').toUpperCase();

  if (evidence.format === 'dbf') {
    const s = scanDbf(bytes, maxRecords);
    if (s.fields.length === 0) return null;
    const rows: RecoveredRow[] = s.records.map(r => ({
      evidenceId: evidence.id, ref: r.recordNumber, values: r.values, deleted: r.deleted,
      provenance: r.intact ? 'original' : 'recuperado', unknownFields: r.unknownFields, issues: r.issues,
    }));
    const lost = Math.max(0, s.declaredRecords - s.records.length);
    return {
      name, evidenceId: evidence.id, evidenceName: evidence.name,
      columns: s.fields.map(f => ({ name: f.name, type: f.type })), rows,
      report: {
        declared: s.declaredRecords, read: rows.length, intact: rows.filter(r => r.provenance === 'original').length,
        recoveredDamaged: rows.filter(r => r.provenance === 'recuperado').length, lost,
        cellsUnknown: rows.reduce((n, r) => n + r.unknownFields.length, 0),
        unrecoverable: s.unrecoverable, findings: s.findings,
      },
    };
  }

  if (evidence.format === 'csv') {
    const s = scanCsv(bytes, maxRecords);
    if (s.headers.length === 0) return null;
    const lastIdx = s.rows.length - 1;
    const rows: RecoveredRow[] = s.rows.map((r, i) => {
      const values: Record<string, string> = {};
      const unknown: string[] = [];
      const issues: string[] = [];
      s.headers.forEach((h, k) => {
        if (k < r.cells.length) values[h] = r.cells[k];
        else { values[h] = ''; unknown.push(h); }
      });
      if (r.cells.length < s.headers.length) issues.push(`faltan ${s.headers.length - r.cells.length} celdas`);
      if (r.cells.length > s.headers.length) issues.push(`${r.cells.length - s.headers.length} celdas sobrantes descartadas`);
      if (s.truncatedQuote && i === lastIdx) issues.push('fila posiblemente truncada (comilla sin cerrar)');
      return { evidenceId: evidence.id, ref: r.line, values, deleted: false, provenance: issues.length ? 'recuperado' : 'original', unknownFields: unknown, issues };
    });
    return {
      name, evidenceId: evidence.id, evidenceName: evidence.name,
      columns: s.headers.map(h => ({ name: h })), rows,
      report: {
        declared: null, read: rows.length, intact: rows.filter(r => r.provenance === 'original').length,
        recoveredDamaged: rows.filter(r => r.provenance === 'recuperado').length, lost: 0,
        cellsUnknown: rows.reduce((n, r) => n + r.unknownFields.length, 0), unrecoverable: [], findings: s.findings,
      },
    };
  }
  return null;
}
