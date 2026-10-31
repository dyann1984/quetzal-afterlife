/**
 * lib/reconstruct.ts — Reconstruction Engine
 * Quetzal Afterlife · Resurrection Engine
 *
 * Construye un modelo de datos multitabla a partir de tablas recuperadas y de un
 * esquema inferido, aplicando únicamente reglas explícitas, registradas y
 * reproducibles. Las relaciones y fusiones inferidas solo se aplican si el
 * usuario las aprobó (`approved`). Cada registro conserva su linaje.
 *
 * Función pura: mismas entradas → mismo modelo (y mismo fingerprint).
 */

import type { RecoveredTable, Provenance } from './recovery';
import type { SchemaModel, Relation } from './schema';
import { sha256Hex } from './ingest';

export interface Approvals {
  relations: string[];                                   // ids de Relation aprobadas
  merges: Array<{ table: string; keep: number; drop: number }>; // fusiones de duplicados aprobadas
}

export interface ReconOptions {
  excludeDeleted: boolean;
  approved: Approvals;
  version: number;
  parentVersion: number | null;
}

export interface Lineage {
  evidenceId: string;
  evidenceName: string;
  ref: number;
  provenance: Provenance;
  unknownFields: string[];
  issues: string[];
}

export interface ReconRow {
  key: string;
  values: Record<string, string>;
  lineage: Lineage;
  complete: boolean;
}

export interface ReconTable {
  name: string;
  columns: Array<{ name: string; type: string }>;
  primaryKey: string[] | null;
  pkStatus: 'inferido' | null;
  rows: ReconRow[];
}

export interface RuleLog { id: string; table: string; description: string; affected: number; refs: number[] }

export interface IntegrityCheck {
  id: string;
  status: 'ok' | 'advertencia' | 'falla';
  table: string;
  message: string;
  count: number;
}

export interface ReconModel {
  version: number;
  parentVersion: number | null;
  tables: ReconTable[];
  relations: Array<Pick<Relation, 'id' | 'child' | 'parent' | 'cardinality' | 'confidence' | 'evidence'> & { approvedByUser: true }>;
  rules: RuleLog[];
  integrity: IntegrityCheck[];
  /** Registros excluidos (borrados o fusionados), con motivo, para no perder trazabilidad. */
  excluded: Array<{ table: string; ref: number; reason: string; mergedInto?: number }>;
}

export const DEFAULT_OPTIONS: ReconOptions = { excludeDeleted: true, approved: { relations: [], merges: [] }, version: 1, parentVersion: null };

export function reconstruct(tables: RecoveredTable[], schema: SchemaModel, options: ReconOptions = DEFAULT_OPTIONS): ReconModel {
  const rules: RuleLog[] = [];
  const excluded: ReconModel['excluded'] = [];
  const outTables: ReconTable[] = [];

  for (const t of tables) {
    const prof = schema.tables.find(p => p.name === t.name);
    const pk = prof?.primaryKey?.columns ?? null;
    const colTypes = new Map((prof?.columns ?? []).map(c => [c.name, c.inferredType]));
    const merges = options.approved.merges.filter(m => m.table === t.name);
    const dropped = new Map(merges.map(m => [m.drop, m.keep]));

    const deletedRefs: number[] = [];
    const rows: ReconRow[] = [];
    for (const r of t.rows) {
      if (options.excludeDeleted && r.deleted) { deletedRefs.push(r.ref); excluded.push({ table: t.name, ref: r.ref, reason: 'marcado como borrado en el origen' }); continue; }
      if (dropped.has(r.ref)) { excluded.push({ table: t.name, ref: r.ref, reason: 'fusionado por aprobación del usuario', mergedInto: dropped.get(r.ref) }); continue; }
      const key = pk ? pk.map(c => r.values[c] ?? '').join('|') : `${t.name}#${r.ref}`;
      rows.push({
        key: key || `${t.name}#${r.ref}`, values: { ...r.values },
        lineage: { evidenceId: r.evidenceId, evidenceName: t.evidenceName, ref: r.ref, provenance: r.provenance, unknownFields: [...r.unknownFields], issues: [...r.issues] },
        complete: r.unknownFields.length === 0,
      });
    }
    if (deletedRefs.length) rules.push({ id: `R-${t.name}-borrados`, table: t.name, description: 'Excluir registros marcados como borrados en el origen (se conservan en la lista de excluidos).', affected: deletedRefs.length, refs: deletedRefs });
    if (merges.length) rules.push({ id: `R-${t.name}-fusion`, table: t.name, description: 'Fusionar duplicados aprobados por el usuario: se conserva el registro indicado.', affected: merges.length, refs: merges.map(m => m.drop) });
    const partial = rows.filter(r => !r.complete).map(r => r.lineage.ref);
    if (partial.length) rules.push({ id: `R-${t.name}-parciales`, table: t.name, description: 'Registros con campos ilegibles: se incluyen marcados como parciales; los campos desconocidos quedan vacíos y no se estiman.', affected: partial.length, refs: partial });

    outTables.push({
      name: t.name,
      columns: t.columns.map(c => ({ name: c.name, type: colTypes.get(c.name) ?? 'texto' })),
      primaryKey: pk, pkStatus: pk ? 'inferido' : null, rows,
    });
  }

  const approvedRelations = schema.relations.filter(r => options.approved.relations.includes(r.id));
  const integrity: IntegrityCheck[] = [];

  for (const t of outTables) {
    if (t.primaryKey) {
      const seen = new Map<string, number>();
      t.rows.forEach(r => seen.set(r.key, (seen.get(r.key) ?? 0) + 1));
      const dups = [...seen.values()].filter(n => n > 1).length;
      integrity.push({ id: `pk-${t.name}`, status: dups ? 'falla' : 'ok', table: t.name, count: dups, message: dups ? `${dups} valor(es) de clave (${t.primaryKey.join(', ')}) repetidos.` : `Clave (${t.primaryKey.join(', ')}) única en ${t.rows.length} registros.` });
    }
    const parciales = t.rows.filter(r => !r.complete).length;
    if (parciales) integrity.push({ id: `parciales-${t.name}`, status: 'advertencia', table: t.name, count: parciales, message: `${parciales} registro(s) con campos desconocidos.` });
  }
  for (const rel of approvedRelations) {
    const parent = outTables.find(t => t.name === rel.parent.table);
    const child = outTables.find(t => t.name === rel.child.table);
    if (!parent || !child) continue;
    const keys = new Set(parent.rows.map(r => r.values[rel.parent.column]));
    const orphans = child.rows.filter(r => !r.lineage.unknownFields.includes(rel.child.column) && (r.values[rel.child.column] ?? '') !== '' && !keys.has(r.values[rel.child.column]));
    integrity.push({
      id: `fk-${rel.id}`, status: orphans.length ? 'falla' : 'ok', table: rel.child.table, count: orphans.length,
      message: orphans.length
        ? `${orphans.length} registro(s) de ${rel.child.table} apuntan a ${rel.parent.table}.${rel.parent.column} inexistente: ${[...new Set(orphans.map(o => o.values[rel.child.column]))].slice(0, 6).join(', ')}. No se crean registros para suplirlos.`
        : `Todas las referencias ${rel.child.table}.${rel.child.column} → ${rel.parent.table}.${rel.parent.column} existen.`,
    });
  }

  return {
    version: options.version, parentVersion: options.parentVersion, tables: outTables,
    relations: approvedRelations.map(r => ({ id: r.id, child: r.child, parent: r.parent, cardinality: r.cardinality, confidence: r.confidence, evidence: r.evidence, approvedByUser: true as const })),
    rules, integrity, excluded,
  };
}

/** Huella determinista del contenido del modelo (sin fechas). */
export async function modelFingerprint(model: ReconModel): Promise<string> {
  return sha256Hex(new TextEncoder().encode(JSON.stringify({ t: model.tables, r: model.relations, u: model.rules, x: model.excluded })));
}
