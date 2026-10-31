/**
 * lib/studio.ts — System Resurrection Studio
 * Quetzal Afterlife · Resurrection Engine
 *
 * Genera un MODELO de aplicación (entidades, vistas, búsqueda, navegación entre
 * relaciones, CRUD) a partir del modelo reconstruido. No genera ni ejecuta código
 * arbitrario. La edición solo ocurre sobre una copia de trabajo; el modelo
 * reconstruido y la evidencia permanecen intactos.
 *
 * Aviso: las relaciones y reglas son inferidas. El Studio no atribuye procesos de
 * negocio al sistema original; las únicas reglas de CRUD son las listadas abajo.
 */

import type { ReconModel, ReconRow } from './reconstruct';

export interface AppField { name: string; type: string; isKey: boolean }
export interface AppEntity {
  name: string;
  fields: AppField[];
  key: string[] | null;
  searchable: string[];
  outgoing: Array<{ relationId: string; column: string; target: string; targetColumn: string }>;
  incoming: Array<{ relationId: string; from: string; column: string; targetColumn: string }>;
}
export interface AppModel { entities: AppEntity[]; crudRules: string[]; notice: string }

export const CRUD_RULES = [
  'Insertar: la clave primaria inferida es obligatoria y no puede repetirse.',
  'Insertar/Actualizar: los campos numéricos solo aceptan números.',
  'Insertar/Actualizar: una columna con relación aprobada debe apuntar a un registro existente (o quedar vacía).',
  'Eliminar: no se permite eliminar un registro referenciado por otros (modo restrictivo).',
  'Toda operación ocurre en la copia de trabajo y queda en el historial; el original no cambia.',
] as const;

export function buildAppModel(model: ReconModel): AppModel {
  const entities: AppEntity[] = model.tables.map(t => ({
    name: t.name,
    fields: t.columns.map(c => ({ name: c.name, type: c.type, isKey: !!t.primaryKey?.includes(c.name) })),
    key: t.primaryKey,
    searchable: t.columns.filter(c => c.type === 'texto' || c.type === 'entero').map(c => c.name),
    outgoing: model.relations.filter(r => r.child.table === t.name).map(r => ({ relationId: r.id, column: r.child.column, target: r.parent.table, targetColumn: r.parent.column })),
    incoming: model.relations.filter(r => r.parent.table === t.name).map(r => ({ relationId: r.id, from: r.child.table, column: r.child.column, targetColumn: r.parent.column })),
  }));
  return {
    entities, crudRules: [...CRUD_RULES],
    notice: 'Modelo generado a partir de relaciones y claves INFERIDAS y aprobadas por el usuario. No representa la lógica de negocio del sistema original.',
  };
}

// ─── Copia de trabajo ─────────────────────────────────────────────────────────

export interface EditEntry { at: string; op: 'insertar' | 'actualizar' | 'eliminar'; table: string; key: string; detail: string }
export interface WorkingCopy { model: ReconModel; log: EditEntry[] }
export type OpResult = { ok: true } | { ok: false; error: string };

export function createWorkingCopy(model: ReconModel): WorkingCopy {
  return { model: structuredClone(model), log: [] };
}

const isNumeric = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());

function findTable(wc: WorkingCopy, name: string) { return wc.model.tables.find(t => t.name === name); }

function validate(wc: WorkingCopy, table: string, values: Record<string, string>, ignoreKey?: string): string | null {
  const t = findTable(wc, table);
  if (!t) return `Tabla inexistente: ${table}.`;
  for (const c of t.columns) {
    const v = values[c.name] ?? '';
    if ((c.type === 'entero' || c.type === 'decimal') && v.trim() !== '' && !isNumeric(v)) return `${c.name} debe ser numérico.`;
  }
  if (t.primaryKey) {
    const key = t.primaryKey.map(c => (values[c] ?? '').trim()).join('|');
    if (t.primaryKey.some(c => !(values[c] ?? '').trim())) return `La clave (${t.primaryKey.join(', ')}) es obligatoria.`;
    if (key !== ignoreKey && t.rows.some(r => r.key === key)) return `Ya existe un registro con la clave ${key}.`;
  }
  for (const rel of wc.model.relations.filter(r => r.child.table === table)) {
    const v = (values[rel.child.column] ?? '').trim();
    if (v && !findTable(wc, rel.parent.table)?.rows.some(r => r.values[rel.parent.column] === v)) return `${rel.child.column}="${v}" no existe en ${rel.parent.table}.${rel.parent.column}.`;
  }
  return null;
}

export function insertRow(wc: WorkingCopy, table: string, values: Record<string, string>, at: string): OpResult {
  const err = validate(wc, table, values);
  if (err) return { ok: false, error: err };
  const t = findTable(wc, table)!;
  const clean: Record<string, string> = {};
  t.columns.forEach(c => { clean[c.name] = (values[c.name] ?? '').trim(); });
  const key = t.primaryKey ? t.primaryKey.map(c => clean[c]).join('|') : `${table}#nuevo-${t.rows.length + 1}`;
  t.rows.push({ key, values: clean, complete: true, lineage: { evidenceId: 'copia-de-trabajo', evidenceName: 'creado en la copia de trabajo', ref: 0, provenance: 'recuperado', unknownFields: [], issues: ['registro creado por el usuario, no proviene de la evidencia'] } });
  wc.log.push({ at, op: 'insertar', table, key, detail: JSON.stringify(clean) });
  return { ok: true };
}

export function updateRow(wc: WorkingCopy, table: string, key: string, changes: Record<string, string>, at: string): OpResult {
  const t = findTable(wc, table);
  const row = t?.rows.find(r => r.key === key);
  if (!t || !row) return { ok: false, error: 'Registro inexistente.' };
  const next = { ...row.values, ...changes };
  const err = validate(wc, table, next, key);
  if (err) return { ok: false, error: err };
  const before = JSON.stringify(Object.fromEntries(Object.keys(changes).map(k => [k, row.values[k]])));
  row.values = next;
  if (t.primaryKey) row.key = t.primaryKey.map(c => next[c]).join('|');
  row.lineage = { ...row.lineage, issues: [...row.lineage.issues, 'modificado en la copia de trabajo'] };
  wc.log.push({ at, op: 'actualizar', table, key, detail: `${before} → ${JSON.stringify(changes)}` });
  return { ok: true };
}

export function deleteRow(wc: WorkingCopy, table: string, key: string, at: string): OpResult {
  const t = findTable(wc, table);
  const row = t?.rows.find(r => r.key === key);
  if (!t || !row) return { ok: false, error: 'Registro inexistente.' };
  for (const rel of wc.model.relations.filter(r => r.parent.table === table)) {
    const n = findTable(wc, rel.child.table)?.rows.filter(r => r.values[rel.child.column] === row.values[rel.parent.column]).length ?? 0;
    if (n > 0) return { ok: false, error: `No se puede eliminar: ${n} registro(s) de ${rel.child.table} lo referencian.` };
  }
  t.rows = t.rows.filter(r => r !== row);
  wc.log.push({ at, op: 'eliminar', table, key, detail: JSON.stringify(row.values) });
  return { ok: true };
}

export function search(wc: WorkingCopy, table: string, query: string): ReconRow[] {
  const t = findTable(wc, table);
  const q = query.trim().toLowerCase();
  if (!t) return [];
  if (!q) return t.rows;
  return t.rows.filter(r => Object.values(r.values).some(v => v.toLowerCase().includes(q)));
}

/** Registros relacionados: padres (por relaciones salientes) e hijos (entrantes). */
export function related(wc: WorkingCopy, table: string, key: string) {
  const row = findTable(wc, table)?.rows.find(r => r.key === key);
  if (!row) return { parents: [], children: [] };
  const parents = wc.model.relations.filter(r => r.child.table === table).flatMap(rel => {
    const p = findTable(wc, rel.parent.table)?.rows.find(x => x.values[rel.parent.column] === row.values[rel.child.column]);
    return p ? [{ relationId: rel.id, table: rel.parent.table, row: p }] : [];
  });
  const children = wc.model.relations.filter(r => r.parent.table === table).map(rel => ({
    relationId: rel.id, table: rel.child.table,
    rows: findTable(wc, rel.child.table)?.rows.filter(x => x.values[rel.child.column] === row.values[rel.parent.column]) ?? [],
  }));
  return { parents, children };
}

// ─── Exportación del prototipo ────────────────────────────────────────────────

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** HTML autónomo de solo consulta. Los datos van como JSON inerte, escapado contra </script>. */
export function exportPrototypeHtml(wc: WorkingCopy, opts: { title: string; synthetic: boolean }): string {
  const app = buildAppModel(wc.model);
  const data = JSON.stringify({ tables: wc.model.tables.map(t => ({ name: t.name, columns: t.columns.map(c => c.name), rows: t.rows.map(r => ({ v: r.values, p: r.lineage.provenance, c: r.complete })) })), relations: wc.model.relations.map(r => r.id) })
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(opts.title)}</title>
<style>body{margin:0;background:#06090d;color:#e9edf1;font:14px Arial,sans-serif;padding:20px}h1{font:normal 28px Georgia,serif}.gold{color:#d3b273}.warn{border:1px solid #d4af37;background:#17150f;padding:10px 14px;margin:12px 0;color:#e8d9a0}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #25313b;padding:8px;text-align:left}th{color:#53cfff}input,select{background:#0d1720;color:#e9edf1;border:1px solid #39728b;padding:8px;margin:0 8px 12px 0}.p{font-size:10px;color:#687784}.wrap{overflow:auto}</style></head><body>
<h1>${escHtml(opts.title)}<span class="gold">.</span></h1>
${opts.synthetic ? '<div class="warn"><b>SINTÉTICO.</b> Datos de demostración; no representan ningún sistema real.</div>' : ''}
<div class="warn">${escHtml(app.notice)} Prototipo de solo consulta exportado por QUETZAL AFTERLIFE.</div>
<select id="t"></select><input id="q" placeholder="Buscar…" aria-label="Buscar"><div class="wrap"><table id="g"></table></div>
<script type="application/json" id="d">${data}</script>
<script>
(function(){var D=JSON.parse(document.getElementById('d').textContent),s=document.getElementById('t'),q=document.getElementById('q'),g=document.getElementById('g');
D.tables.forEach(function(t,i){var o=document.createElement('option');o.value=i;o.textContent=t.name+' ('+t.rows.length+')';s.appendChild(o)});
function r(){var t=D.tables[s.value],k=q.value.toLowerCase();g.textContent='';var h=g.insertRow();t.columns.concat(['procedencia']).forEach(function(c){var e=document.createElement('th');e.textContent=c;h.appendChild(e)});
t.rows.filter(function(x){return !k||t.columns.some(function(c){return (x.v[c]||'').toLowerCase().indexOf(k)>=0})}).forEach(function(x){var tr=g.insertRow();t.columns.forEach(function(c){tr.insertCell().textContent=x.v[c]||''});var c=tr.insertCell();c.className='p';c.textContent=x.p+(x.c?'':' (parcial)')})}
s.onchange=q.oninput=r;r()})();
</script></body></html>`;
}
