/**
 * lib/schema.ts — Schema Intelligence
 * Quetzal Afterlife · Resurrection Engine
 *
 * Infiere tipos, claves y relaciones a partir de los datos recuperados.
 * TODO lo que sale de aquí es una INFERENCIA (status: 'inferido') con la
 * evidencia numérica que la sustenta; nada se presenta como esquema original.
 */

import type { RecoveredTable } from './recovery';

export type InferredType = 'entero' | 'decimal' | 'fecha' | 'texto' | 'vacio';
export type Confidence = 'alta' | 'media' | 'baja';

export interface ColumnProfile {
  name: string;
  declaredType?: string;
  inferredType: InferredType;
  nonNull: number;
  distinct: number;
  unique: boolean;
  samples: string[];
}

export interface KeyCandidate { columns: string[]; confidence: Confidence; evidence: string }

export interface TableProfile {
  name: string;
  evidenceId: string;
  activeRows: number;
  deletedRows: number;
  columns: ColumnProfile[];
  primaryKey: KeyCandidate | null;
}

export interface Relation {
  id: string;
  child: { table: string; column: string };
  parent: { table: string; column: string };
  distinctChild: number;
  matched: number;
  containment: number;          // 0..1
  orphans: string[];            // valores del hijo ausentes en el padre
  cardinality: '1:1' | '1:N';
  confidence: Confidence;
  nameHint: boolean;
  evidence: string[];
  /** Los huérfanos podrían explicarse por registros perdidos en la tabla padre. */
  possiblyExplainedByLoss: boolean;
  status: 'inferido';
}

export interface SchemaIssue {
  kind: 'clave_duplicada' | 'registros_duplicados' | 'huerfanos';
  table: string;
  message: string;
  refs: number[];
}

export interface SchemaModel {
  tables: TableProfile[];
  relations: Relation[];
  issues: SchemaIssue[];
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const KEY_NAME = /^(id|cod|codigo|clave|cve|folio|sku|ref|num|numero|key)|(id|cod|codigo|clave|folio)$/;

function inferType(declared: string | undefined, values: string[]): InferredType {
  if (values.length === 0) return 'vacio';
  if (declared === 'D') return 'fecha';
  if (values.every(v => /^-?\d+$/.test(v))) return declared === 'N' || declared === 'F' || declared === undefined ? 'entero' : 'texto';
  if (values.every(v => /^-?\d+\.\d+$|^-?\d+$/.test(v))) return 'decimal';
  if (values.every(v => /^\d{4}-\d{2}-\d{2}$/.test(v))) return 'fecha';
  return 'texto';
}

function activeRows(t: RecoveredTable) { return t.rows.filter(r => !r.deleted); }

function cellValues(t: RecoveredTable, col: string, rows = activeRows(t)): string[] {
  return rows.filter(r => !r.unknownFields.includes(col)).map(r => (r.values[col] ?? '').trim()).filter(v => v !== '');
}

function profileTable(t: RecoveredTable): TableProfile {
  const rows = activeRows(t);
  const columns: ColumnProfile[] = t.columns.map(c => {
    const vals = cellValues(t, c.name, rows);
    const distinct = new Set(vals).size;
    return {
      name: c.name, declaredType: c.type, inferredType: inferType(c.type, vals), nonNull: vals.length, distinct,
      unique: vals.length > 1 && distinct === vals.length && vals.length === rows.filter(r => !r.unknownFields.includes(c.name)).length,
      samples: [...new Set(vals)].slice(0, 3),
    };
  });

  let primaryKey: KeyCandidate | null = null;
  const unique = columns.filter(c => c.unique);
  if (unique.length) {
    const ranked = unique.map(c => ({ c, score: (KEY_NAME.test(norm(c.name)) ? 2 : 0) + (c.inferredType === 'texto' || c.inferredType === 'entero' ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)[0];
    primaryKey = {
      columns: [ranked.c.name],
      confidence: ranked.score >= 3 ? 'alta' : ranked.score >= 1 ? 'media' : 'baja',
      evidence: `${ranked.c.nonNull} valores no vacíos, todos distintos${KEY_NAME.test(norm(ranked.c.name)) ? '; el nombre sugiere identificador' : ''}`,
    };
  } else if (columns.length >= 2 && columns.length <= 8) {
    outer: for (let i = 0; i < columns.length; i++) for (let j = i + 1; j < columns.length; j++) {
      const a = columns[i].name, b = columns[j].name;
      const keys = rows.filter(r => !r.unknownFields.includes(a) && !r.unknownFields.includes(b)).map(r => `${r.values[a]}\u0000${r.values[b]}`);
      if (keys.length > 1 && new Set(keys).size === keys.length && keys.every(k => !k.startsWith('\u0000') && !k.endsWith('\u0000'))) {
        primaryKey = { columns: [a, b], confidence: 'baja', evidence: `la combinación (${a}, ${b}) es única en ${keys.length} filas; ninguna columna sola lo es` };
        break outer;
      }
    }
  }
  return { name: t.name, evidenceId: t.evidenceId, activeRows: rows.length, deletedRows: t.rows.length - rows.length, columns, primaryKey };
}

export function inferSchema(tables: RecoveredTable[]): SchemaModel {
  const profiles = tables.map(profileTable);
  const byName = new Map(tables.map(t => [t.name, t]));
  const relations: Relation[] = [];
  const issues: SchemaIssue[] = [];

  for (const child of tables) {
    const cp = profiles.find(p => p.name === child.name)!;
    for (const col of child.columns) {
      const childVals = cellValues(child, col.name);
      const distinctChild = [...new Set(childVals)];
      if (distinctChild.length < 2) continue;
      for (const parentP of profiles) {
        if (parentP.name === child.name || !parentP.primaryKey || parentP.primaryKey.columns.length !== 1) continue;
        const pcol = parentP.primaryKey.columns[0];
        const parent = byName.get(parentP.name)!;
        const parentSet = new Set(cellValues(parent, pcol));
        const matched = distinctChild.filter(v => parentSet.has(v));
        const containment = matched.length / distinctChild.length;
        const nameHint = norm(col.name) === norm(pcol) && norm(col.name) !== 'codigo' && norm(col.name) !== 'id'
          ? true : norm(col.name).includes(norm(parentP.name).replace(/s$/, '')) || norm(parentP.name).replace(/s$/, '').includes(norm(col.name));
        const sameNameGeneric = norm(col.name) === norm(pcol);
        if (matched.length < 2) continue;
        const threshold = nameHint || sameNameGeneric ? 0.6 : 0.9;
        if (containment < threshold) continue;
        const orphans = distinctChild.filter(v => !parentSet.has(v));
        // cardinalidad: máximo de filas hijas por valor padre
        const counts = new Map<string, number>();
        for (const v of childVals) counts.set(v, (counts.get(v) ?? 0) + 1);
        const cardinality = Math.max(...matched.map(v => counts.get(v) ?? 0)) > 1 ? '1:N' : '1:1';
        const confidence: Confidence = containment >= 0.8 && (nameHint || sameNameGeneric) ? 'alta' : containment >= 0.8 ? 'media' : 'baja';
        const lost = parent.report.lost;
        relations.push({
          id: `${child.name}.${col.name}->${parentP.name}.${pcol}`,
          child: { table: child.name, column: col.name }, parent: { table: parentP.name, column: pcol },
          distinctChild: distinctChild.length, matched: matched.length, containment, orphans, cardinality, confidence, nameHint: nameHint || sameNameGeneric,
          evidence: [
            `${matched.length} de ${distinctChild.length} valores distintos de ${child.name}.${col.name} existen en ${parentP.name}.${pcol} (${(containment * 100).toFixed(0)} %)`,
            nameHint || sameNameGeneric ? 'los nombres de columna son compatibles' : 'sin pista en los nombres; se exige contención ≥ 90 %',
            `cardinalidad observada ${cardinality}`,
          ],
          possiblyExplainedByLoss: orphans.length > 0 && lost > 0 && orphans.length <= lost + (parent.report.recoveredDamaged),
          status: 'inferido',
        });
      }
    }
    void cp;
  }
  // Una columna se relaciona con un único padre: se conserva el de mayor contención.
  const best = new Map<string, Relation>();
  for (const r of relations) {
    const k = `${r.child.table}.${r.child.column}`;
    const cur = best.get(k);
    if (!cur || r.containment > cur.containment) best.set(k, r);
  }
  let finalRelations = [...best.values()];
  // Relaciones recíprocas (1:1 en ambos sentidos): los datos no determinan la dirección.
  // Se conserva la que tiene como padre la tabla con más filas (o más columnas) y se baja la confianza.
  const rowsOf = (n: string) => profiles.find(p => p.name === n)!;
  finalRelations = finalRelations.filter(r => {
    const mirror = finalRelations.find(o => o !== r && o.child.table === r.parent.table && o.parent.table === r.child.table &&
      o.child.column === r.parent.column && o.parent.column === r.child.column);
    if (!mirror) return true;
    const pa = rowsOf(r.parent.table), ch = rowsOf(r.child.table);
    const keep = pa.activeRows !== ch.activeRows ? pa.activeRows > ch.activeRows : pa.columns.length > ch.columns.length;
    if (keep) {
      r.confidence = r.confidence === 'alta' ? 'media' : r.confidence;
      r.evidence.push('relación recíproca: los datos no fijan la dirección; se elige la tabla con más filas/columnas como padre');
    }
    return keep;
  });

  // Incidencias
  for (const t of tables) {
    const rows = activeRows(t);
    const prof = profiles.find(p => p.name === t.name)!;
    const pk = prof.primaryKey?.columns[0];
    const keyCol = pk ?? prof.columns.find(c => KEY_NAME.test(norm(c.name)))?.name;
    if (keyCol) {
      const seen = new Map<string, number[]>();
      rows.forEach(r => { const v = (r.values[keyCol] ?? '').trim(); if (v) seen.set(v, [...(seen.get(v) ?? []), r.ref]); });
      for (const [v, refs] of seen) if (refs.length > 1) issues.push({ kind: 'clave_duplicada', table: t.name, message: `El valor "${v}" de ${keyCol} se repite en los registros ${refs.join(', ')}.`, refs });
    }
    const nonKey = t.columns.map(c => c.name).filter(c => c !== keyCol);
    // Solo tiene sentido buscar duplicados "salvo la clave" con una clave simple inferida;
    // con clave compuesta o sin clave, filas con el mismo contenido pueden ser legítimas.
    if (prof.primaryKey?.columns.length === 1 && nonKey.length >= 2) {
      const groups = new Map<string, number[]>();
      rows.forEach(r => {
        if (r.unknownFields.some(u => nonKey.includes(u))) return;
        const k = nonKey.map(c => (r.values[c] ?? '').trim().toLowerCase()).join('\u0000');
        if (k.replace(/\u0000/g, '') !== '') groups.set(k, [...(groups.get(k) ?? []), r.ref]);
      });
      for (const refs of groups.values()) if (refs.length > 1) issues.push({ kind: 'registros_duplicados', table: t.name, message: `Los registros ${refs.join(', ')} tienen el mismo contenido salvo la clave: posible duplicado.`, refs });
    }
  }
  for (const r of finalRelations) if (r.orphans.length) {
    issues.push({
      kind: 'huerfanos', table: r.child.table,
      message: `${r.orphans.length} valor(es) de ${r.child.table}.${r.child.column} sin padre en ${r.parent.table}: ${r.orphans.slice(0, 6).join(', ')}${r.possiblyExplainedByLoss ? ' (podría deberse a registros perdidos por daño en ' + r.parent.table + ')' : ''}.`, refs: [],
    });
  }
  return { tables: profiles, relations: finalRelations, issues };
}
