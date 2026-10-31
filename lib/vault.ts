/**
 * lib/vault.ts — Forensic Evidence Vault
 * Quetzal Afterlife · Resurrection Engine
 *
 * Expediente reproducible: evidencias con SHA-256, diagnósticos, hallazgos,
 * historial de transformaciones, registro de incertidumbre, modelo reconstruido
 * y sus versiones. El expediente lleva su propio hash para detectar alteraciones.
 */

import type { EvidenceRef } from './ingest';
import { sha256Hex } from './ingest';
import type { Diagnosis } from './discovery';
import type { RecoveredTable } from './recovery';
import type { SchemaModel } from './schema';
import type { ReconModel } from './reconstruct';
import { modelFingerprint } from './reconstruct';

export interface TransformationStep { at: string; step: string; description: string }
export interface UncertaintyItem { kind: 'celda_desconocida' | 'registro_perdido' | 'segmento_irrecuperable' | 'inferencia' | 'estimacion'; subject: string; detail: string }
export interface VersionEntry { version: number; fingerprint: string; generatedAt: string; note: string }

export interface DossierInput {
  title: string;
  synthetic: boolean;
  generatedAt: string;
  evidences: EvidenceRef[];
  diagnoses: Record<string, Diagnosis>;      // por id de evidencia
  tables: RecoveredTable[];
  schema: SchemaModel;
  model: ReconModel;
  steps: TransformationStep[];
  approvals: { relations: string[]; merges: Array<{ table: string; keep: number; drop: number }> };
  previousVersions?: VersionEntry[];
  note?: string;
}

export interface Dossier {
  format: 'quetzal-dossier/1';
  title: string;
  synthetic: boolean;
  generatedAt: string;
  statement: string;
  evidences: EvidenceRef[];
  diagnoses: Array<{ evidenceId: string; format: string; supportLevel: string; encoding?: string; encodingBasis?: string; damaged: boolean; findings: Diagnosis['findings'] }>;
  recovery: Array<{ table: string; evidenceId: string; declared: number | null; read: number; intact: number; recoveredDamaged: number; lost: number; cellsUnknown: number; unrecoverable: Array<{ start: number; end: number; reason: string }> }>;
  schema: { relations: SchemaModel['relations']; keys: Array<{ table: string; key: string[] | null; status: 'inferido' }>; issues: SchemaModel['issues'] };
  transformations: TransformationStep[];
  approvals: DossierInput['approvals'];
  rules: ReconModel['rules'];
  integrity: ReconModel['integrity'];
  excluded: ReconModel['excluded'];
  uncertainty: UncertaintyItem[];
  versions: VersionEntry[];
  modelFingerprint: string;
  records: Array<{ table: string; key: string; evidenceId: string; ref: number; provenance: string; complete: boolean }>;
  /** SHA-256 del contenido canónico (todo salvo este campo). */
  dossierSha256: string;
}

export const STATEMENT =
  'Los registros marcados "original" se leyeron tal cual del archivo indicado; "recuperado" son registros leídos de zonas dañadas o irregulares; ' +
  'las celdas "desconocidas" no se pudieron leer y no se estimaron. Claves, relaciones y duplicados son inferencias; solo se aplicaron las aprobadas por el usuario.';

export function buildUncertainty(tables: RecoveredTable[], schema: SchemaModel, diagnoses: Record<string, Diagnosis>): UncertaintyItem[] {
  const out: UncertaintyItem[] = [];
  for (const t of tables) {
    for (const r of t.rows) if (r.unknownFields.length) out.push({ kind: 'celda_desconocida', subject: `${t.name} #${r.ref}`, detail: `campos ilegibles: ${r.unknownFields.join(', ')}` });
    if (t.report.lost > 0) out.push({ kind: 'registro_perdido', subject: t.name, detail: `${t.report.lost} registro(s) declarados no existen en el archivo (truncamiento).` });
    for (const u of t.report.unrecoverable) out.push({ kind: 'segmento_irrecuperable', subject: t.name, detail: `bytes ${u.start}–${u.end}: ${u.reason}` });
  }
  for (const r of schema.relations) out.push({ kind: 'inferencia', subject: r.id, detail: `relación inferida (${r.confidence}); ${r.evidence[0]}` });
  for (const p of schema.tables) if (p.primaryKey) out.push({ kind: 'inferencia', subject: `${p.name} PK`, detail: `clave primaria inferida (${p.primaryKey.confidence}): ${p.primaryKey.columns.join(', ')}` });
  for (const [id, d] of Object.entries(diagnoses)) if (d.encoding && /estimaci/.test(d.encodingBasis ?? '')) out.push({ kind: 'estimacion', subject: id, detail: `codificación ${d.encoding}: ${d.encodingBasis}` });
  return out;
}

function canonical(d: Omit<Dossier, 'dossierSha256'>): string { return JSON.stringify(d); }

export async function buildDossier(input: DossierInput): Promise<Dossier> {
  const fp = await modelFingerprint(input.model);
  const versions = [...(input.previousVersions ?? []), { version: input.model.version, fingerprint: fp, generatedAt: input.generatedAt, note: input.note ?? '' }];
  const body: Omit<Dossier, 'dossierSha256'> = {
    format: 'quetzal-dossier/1', title: input.title, synthetic: input.synthetic, generatedAt: input.generatedAt, statement: STATEMENT,
    evidences: input.evidences,
    diagnoses: Object.entries(input.diagnoses).map(([evidenceId, d]) => ({ evidenceId, format: d.format, supportLevel: d.supportLevel, encoding: d.encoding, encodingBasis: d.encodingBasis, damaged: d.damaged, findings: d.findings })),
    recovery: input.tables.map(t => ({ table: t.name, evidenceId: t.evidenceId, declared: t.report.declared, read: t.report.read, intact: t.report.intact, recoveredDamaged: t.report.recoveredDamaged, lost: t.report.lost, cellsUnknown: t.report.cellsUnknown, unrecoverable: t.report.unrecoverable.map(u => ({ start: u.start, end: u.end, reason: u.reason })) })),
    schema: { relations: input.schema.relations, keys: input.schema.tables.map(t => ({ table: t.name, key: t.primaryKey?.columns ?? null, status: 'inferido' as const })), issues: input.schema.issues },
    transformations: input.steps, approvals: input.approvals, rules: input.model.rules, integrity: input.model.integrity, excluded: input.model.excluded,
    uncertainty: buildUncertainty(input.tables, input.schema, input.diagnoses), versions, modelFingerprint: fp,
    records: input.model.tables.flatMap(t => t.rows.map(r => ({ table: t.name, key: r.key, evidenceId: r.lineage.evidenceId, ref: r.lineage.ref, provenance: r.lineage.provenance, complete: r.complete }))),
  };
  return { ...body, dossierSha256: await sha256Hex(new TextEncoder().encode(canonical(body))) };
}

export async function verifyDossier(d: Dossier): Promise<boolean> {
  const { dossierSha256, ...body } = d;
  return (await sha256Hex(new TextEncoder().encode(canonical(body)))) === dossierSha256;
}

export const dossierJson = (d: Dossier) => JSON.stringify(d, null, 2);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Informe legible en Markdown (texto plano, sin HTML). */
export function renderReportMarkdown(d: Dossier): string {
  const L: string[] = [];
  L.push(`# ${d.title}`, '');
  if (d.synthetic) L.push('> **SINTÉTICO** — datos de demostración; no representan ningún sistema real.', '');
  L.push(`Generado: ${d.generatedAt} · Modelo v${d.versions[d.versions.length - 1].version} · SHA-256 del expediente: \`${d.dossierSha256}\``, '', `> ${d.statement}`, '');
  L.push('## Evidencias', '', '| Archivo | Formato | Tamaño | SHA-256 |', '|---|---|---|---|');
  for (const e of d.evidences) L.push(`| ${e.name} | ${e.format} (${e.confidence}) | ${e.size} B | \`${e.sha256}\` |`);
  L.push('', '## Recuperación', '', '| Tabla | Declarados | Leídos | Íntegros | Recuperados con daño | Perdidos | Celdas desconocidas |', '|---|---|---|---|---|---|---|');
  for (const r of d.recovery) L.push(`| ${r.table} | ${r.declared ?? 'n/d'} | ${r.read} | ${r.intact} | ${r.recoveredDamaged} | ${r.lost} | ${r.cellsUnknown} |`);
  L.push('', '## Relaciones inferidas', '');
  if (d.schema.relations.length === 0) L.push('Ninguna.');
  for (const r of d.schema.relations) L.push(`- ${r.id} — ${r.cardinality}, confianza ${r.confidence}, ${r.orphans.length} huérfano(s). ${d.approvals.relations.includes(r.id) ? '**Aprobada por el usuario.**' : 'No aprobada (no se aplicó).'}`);
  L.push('', '## Validaciones de integridad', '');
  if (d.integrity.length === 0) L.push('Sin validaciones (no hay relaciones aprobadas).');
  for (const i of d.integrity) L.push(`- [${i.status.toUpperCase()}] ${i.message}`);
  L.push('', '## Registro de incertidumbre', '', `${d.uncertainty.length} elemento(s):`, '');
  for (const u of d.uncertainty.slice(0, 80)) L.push(`- (${u.kind}) ${u.subject}: ${u.detail}`);
  if (d.uncertainty.length > 80) L.push(`- … y ${d.uncertainty.length - 80} más (ver JSON).`);
  L.push('', '## Transformaciones', '');
  for (const s of d.transformations) L.push(`- ${s.at} — **${s.step}**: ${s.description}`);
  L.push('', '## Versiones del modelo', '');
  for (const v of d.versions) L.push(`- v${v.version} · ${v.generatedAt} · \`${v.fingerprint.slice(0, 16)}…\` ${v.note}`);
  return L.join('\n') + '\n';
}

/** Informe HTML con todo el texto escapado. */
export function renderReportHtml(d: Dossier): string {
  const md = renderReportMarkdown(d);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{background:#06090d;color:#e9edf1;font:13px/1.6 Arial,sans-serif;max-width:960px;margin:24px auto;padding:0 16px}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${esc(md)}</pre></body></html>`;
}
