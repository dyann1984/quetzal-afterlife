/**
 * lib/analyst.ts — AI Recovery Analyst (módulo opcional y desacoplado)
 * Quetzal Afterlife · Resurrection Engine
 *
 * - El analista determinista local funciona sin red ni credenciales.
 * - Cualquier proveedor remoto (IA) debe implementar `AnalystProvider`, requiere
 *   consentimiento explícito y solo recibe metadatos salvo que el usuario conceda
 *   también el envío de muestras.
 * - Toda propuesta debe citar evidencia concreta; las que no la citan o apuntan a
 *   elementos inexistentes se descartan (`validateProposals`).
 * - Nada se aplica sin aprobación humana: `toApprovals` solo considera propuestas aprobadas.
 */

import type { RecoveredTable } from './recovery';
import type { SchemaModel } from './schema';
import type { Approvals } from './reconstruct';

export type ProposalKind = 'aprobar_relacion' | 'fusionar_duplicado' | 'investigar_perdida' | 'revisar_huerfanos' | 'campo_ilegible';

export type ProposalAction =
  | { type: 'relation'; id: string }
  | { type: 'merge'; table: string; keep: number; drop: number }
  | { type: 'none' };

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  explanation: string;
  evidence: string[];
  action: ProposalAction;
  source: string;                 // id del proveedor
  requiresApproval: true;
}

export interface AnalystInput { tables: RecoveredTable[]; schema: SchemaModel }

/** Lo que un proveedor remoto recibiría. Por defecto: solo metadatos, sin valores de celdas. */
export interface AnalystPayload {
  scope: 'metadatos' | 'muestras';
  tables: Array<{ name: string; columns: string[]; declared: number | null; read: number; lost: number; unknownCells: number }>;
  relations: Array<{ id: string; containment: number; orphans: number; confidence: string }>;
  issues: Array<{ kind: string; table: string; message: string }>;
  samples?: Array<{ table: string; rows: Array<Record<string, string>> }>;
}

export interface AnalystProvider {
  id: string;
  label: string;
  remote: boolean;
  analyze(input: AnalystInput, payload: AnalystPayload): Promise<Proposal[]>;
}

export interface Consent { granted: boolean; scope: 'metadatos' | 'muestras' }
export const NO_CONSENT: Consent = { granted: false, scope: 'metadatos' };

export class ConsentError extends Error {
  constructor() { super('Este proveedor envía datos fuera del navegador. Se requiere consentimiento explícito.'); this.name = 'ConsentError'; }
}

export function buildPayload(input: AnalystInput, scope: Consent['scope']): AnalystPayload {
  const payload: AnalystPayload = {
    scope,
    tables: input.tables.map(t => ({ name: t.name, columns: t.columns.map(c => c.name), declared: t.report.declared, read: t.report.read, lost: t.report.lost, unknownCells: t.report.cellsUnknown })),
    relations: input.schema.relations.map(r => ({ id: r.id, containment: Number(r.containment.toFixed(3)), orphans: r.orphans.length, confidence: r.confidence })),
    issues: input.schema.issues.map(i => ({ kind: i.kind, table: i.table, message: i.message.replace(/"[^"]*"/g, '"…"') })),
  };
  if (scope === 'muestras') payload.samples = input.tables.map(t => ({ table: t.name, rows: t.rows.slice(0, 3).map(r => r.values) }));
  return payload;
}

export const localAnalyst: AnalystProvider = {
  id: 'local-determinista',
  label: 'Analista local (reglas, sin IA ni red)',
  remote: false,
  async analyze({ tables, schema }) {
    const out: Proposal[] = [];
    const base = { source: 'local-determinista', requiresApproval: true as const };
    for (const r of schema.relations) {
      out.push({
        ...base, id: `rel:${r.id}`, kind: 'aprobar_relacion',
        title: `Aprobar relación ${r.child.table}.${r.child.column} → ${r.parent.table}.${r.parent.column}`,
        explanation: `Los datos sugieren que ${r.child.table} depende de ${r.parent.table} (cardinalidad ${r.cardinality}, confianza ${r.confidence}). Es una inferencia, no una restricción original del sistema.`,
        evidence: r.evidence, action: { type: 'relation', id: r.id },
      });
      if (r.orphans.length) {
        out.push({
          ...base, id: `orf:${r.id}`, kind: r.possiblyExplainedByLoss ? 'investigar_perdida' : 'revisar_huerfanos',
          title: `${r.orphans.length} referencia(s) sin destino en ${r.parent.table}`,
          explanation: r.possiblyExplainedByLoss
            ? `Los valores ${r.orphans.join(', ')} no existen en ${r.parent.table}, tabla que perdió registros por daño; es coherente con registros perdidos, pero no es una prueba.`
            : `Los valores ${r.orphans.join(', ')} no existen en ${r.parent.table}. Puede ser un error del dato original; no se corrige ni se crean registros.`,
          evidence: [`huérfanos: ${r.orphans.join(', ')}`, `${r.parent.table}: ${tables.find(t => t.name === r.parent.table)?.report.lost ?? 0} registros perdidos por daño`], action: { type: 'none' },
        });
      }
    }
    for (const i of schema.issues.filter(x => x.kind === 'registros_duplicados')) {
      out.push({
        ...base, id: `dup:${i.table}:${i.refs.join('-')}`, kind: 'fusionar_duplicado',
        title: `Posible duplicado en ${i.table} (registros ${i.refs.join(' y ')})`,
        explanation: `${i.message} Fusionar descarta el segundo registro del modelo (queda registrado en la lista de excluidos).`,
        evidence: [i.message], action: { type: 'merge', table: i.table, keep: i.refs[0], drop: i.refs[1] },
      });
    }
    for (const t of tables) if (t.report.cellsUnknown > 0) {
      out.push({
        ...base, id: `ilg:${t.name}`, kind: 'campo_ilegible', title: `${t.report.cellsUnknown} celda(s) ilegibles en ${t.name}`,
        explanation: 'Estas celdas permanecen como desconocidas. El analista no propone valores: la recuperación real requeriría otra copia del archivo o la fuente original.',
        evidence: t.rows.filter(r => r.unknownFields.length).map(r => `registro ${r.ref}: ${r.unknownFields.join(', ')}`), action: { type: 'none' },
      });
    }
    return out;
  },
};

/** Marcador para un proveedor remoto futuro: existe la interfaz, no hay credenciales ni llamadas. */
export const remoteAnalystPlaceholder: AnalystProvider = {
  id: 'ia-remota-no-configurada',
  label: 'Proveedor de IA (no configurado)',
  remote: true,
  async analyze() { throw new Error('No hay proveedor de IA configurado ni credenciales. Los módulos deterministas siguen disponibles.'); },
};

/** Descarta propuestas sin evidencia o que apuntan a elementos que no existen. */
export function validateProposals(proposals: Proposal[], input: AnalystInput): { valid: Proposal[]; rejected: Array<{ id: string; reason: string }> } {
  const valid: Proposal[] = [], rejected: Array<{ id: string; reason: string }> = [];
  for (const p of proposals) {
    if (!p.evidence || p.evidence.length === 0 || p.evidence.every(e => !e.trim())) { rejected.push({ id: p.id, reason: 'sin evidencia' }); continue; }
    if (p.action.type === 'relation' && !input.schema.relations.some(r => r.id === (p.action as { id: string }).id)) { rejected.push({ id: p.id, reason: 'relación inexistente' }); continue; }
    if (p.action.type === 'merge') {
      const a = p.action;
      const t = input.tables.find(x => x.name === a.table);
      if (!t || !t.rows.some(r => r.ref === a.keep) || !t.rows.some(r => r.ref === a.drop)) { rejected.push({ id: p.id, reason: 'registro inexistente' }); continue; }
    }
    valid.push({ ...p, requiresApproval: true });
  }
  return { valid, rejected };
}

export async function runAnalyst(provider: AnalystProvider, input: AnalystInput, consent: Consent = NO_CONSENT) {
  if (provider.remote && !consent.granted) throw new ConsentError();
  const payload = buildPayload(input, provider.remote ? consent.scope : 'metadatos');
  const raw = await provider.analyze(input, payload);
  return { ...validateProposals(raw, input), payloadScope: payload.scope };
}

export function toApprovals(proposals: Proposal[], approvedIds: string[]): Approvals {
  const ok = proposals.filter(p => approvedIds.includes(p.id));
  return {
    relations: ok.flatMap(p => (p.action.type === 'relation' ? [p.action.id] : [])),
    merges: ok.flatMap(p => (p.action.type === 'merge' ? [{ table: p.action.table, keep: p.action.keep, drop: p.action.drop }] : [])),
  };
}
