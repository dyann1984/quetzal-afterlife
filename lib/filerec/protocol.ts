/**
 * Protocolo de resurrección en seis etapas, ligado al procesamiento REAL.
 *
 *   01 Detección      identify() por firma + SHA-256 del original
 *   02 Diagnóstico    analizador del formato: hallazgos, rangos dañados, recuperabilidad
 *   03 Reconstrucción ¿hay una estrategia de reparación verificable? (la produce el analizador)
 *   04 Restauración   se genera el artefacto: archivo reparado o ZIP con lo extraído y verificado
 *   05 Validación     el artefacto se VUELVE A ANALIZAR desde cero con el mismo motor
 *   06 Renacimiento   veredicto y descarga
 *
 * Cada etapa registra su estado y su duración medida. Ninguna etapa se marca «ok» sin el resultado que la respalda:
 * la interfaz anima lo que ya ocurrió, nunca adelanta un éxito.
 */
import { sha256Hex } from '../ingest';
import { analyzeFile, exportRecovered } from './index';
import { identify } from './identify';
import type { FileReport, Identification } from './types';

export type StageId = 'deteccion' | 'diagnostico' | 'reconstruccion' | 'restauracion' | 'validacion' | 'renacimiento';
export const STAGE_IDS: readonly StageId[] = ['deteccion', 'diagnostico', 'reconstruccion', 'restauracion', 'validacion', 'renacimiento'];
export const STAGE_LABEL: Record<StageId, string> = {
  deteccion: 'Detección', diagnostico: 'Diagnóstico', reconstruccion: 'Reconstrucción',
  restauracion: 'Restauración', validacion: 'Validación', renacimiento: 'Renacimiento',
};
export type StageState = 'pendiente' | 'activo' | 'ok' | 'parcial' | 'omitido' | 'fallido';
export interface StageRecord { id: StageId; state: StageState; ms: number; detail: string }

/** Resultado honesto del intento, de mejor a peor. */
export type Outcome = 'integro' | 'reparado-validado' | 'recuperacion-parcial' | 'reparacion-sin-verificar' | 'solo-diagnostico' | 'irrecuperable' | 'no-analizado';
export const OUTCOME_LABEL: Record<Outcome, string> = {
  integro: 'Íntegro: no necesitaba reparación',
  'reparado-validado': 'Reparado y validado',
  'recuperacion-parcial': 'Recuperación parcial verificada',
  'reparacion-sin-verificar': 'Reparación propuesta sin verificar',
  'solo-diagnostico': 'Diagnóstico sin reparación posible',
  irrecuperable: 'Irrecuperable con la evidencia disponible',
  'no-analizado': 'No analizado',
};

export interface Recoverability {
  level: 'total' | 'alta' | 'media' | 'baja' | 'nula' | 'desconocida';
  /** Porcentaje de bytes del original fuera de los rangos dañados detectados (null si no aplica). */
  intactBytesPct: number | null;
  basis: string[];
}

export interface Artifact { name: string; bytes: Uint8Array; kind: 'reparado' | 'paquete'; sha256: string }

export interface ResurrectionRun {
  id: string; name: string; size: number; synthetic: boolean; startedAt: string;
  stages: StageRecord[];
  identification: Identification | null;
  report: FileReport | null;
  /** Informe del re-análisis del artefacto reparado (etapa 05). */
  validation: FileReport | null;
  artifact: Artifact | null;
  outcome: Outcome;
  recoverability: Recoverability;
  totalMs: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const yieldToUi = () => new Promise<void>(r => setTimeout(r, 0));

/** Estimación justificable: deriva SOLO de los rangos dañados medidos y de lo verificado. */
export function estimateRecoverability(r: FileReport, validated: boolean | null): Recoverability {
  const basis: string[] = [];
  if (r.integrity === 'no-analizado') return { level: 'desconocida', intactBytesPct: null, basis: ['El formato no se analizó: no hay base para estimar.'] };
  // une los rangos dañados para no contar dos veces
  const ranges = r.damaged.map(d => [Math.max(0, d.start), Math.min(r.size, d.end)] as [number, number]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let bad = 0, cur: [number, number] | null = null;
  for (const x of ranges) { if (!cur || x[0] > cur[1]) { if (cur) bad += cur[1] - cur[0]; cur = [...x]; } else cur[1] = Math.max(cur[1], x[1]); }
  if (cur) bad += cur[1] - cur[0];
  const pct = r.size ? Math.round(((r.size - bad) / r.size) * 1000) / 10 : 0;
  basis.push(`${pct} % de los bytes está fuera de los rangos dañados detectados.`);
  const verified = r.items.filter(i => i.verified).length;
  basis.push(`${verified} de ${r.items.length} elemento(s) extraído(s) superan una comprobación objetiva.`);
  if (validated === true) basis.push('La reparación supera un re-análisis completo.');
  if (validated === false) basis.push('La reparación NO supera el re-análisis.');
  let level: Recoverability['level'];
  if (r.integrity === 'integro') level = 'total';
  else if (r.integrity === 'irrecuperable' || (verified === 0 && !validated)) level = 'nula';
  else if (validated && pct >= 90) level = 'alta';
  else if (pct >= 60 && verified > 0) level = 'media';
  else level = 'baja';
  return { level, intactBytesPct: pct, basis };
}

export interface RunOptions { synthetic?: boolean; onStage?: (run: ResurrectionRun) => void; id?: string; startedAt?: string }

export async function runResurrection(bytes: Uint8Array, name: string, opt: RunOptions = {}): Promise<ResurrectionRun> {
  const t0 = now();
  const run: ResurrectionRun = {
    id: opt.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.slice(0, 200), size: bytes.length, synthetic: !!opt.synthetic, startedAt: opt.startedAt ?? new Date().toISOString(),
    stages: STAGE_IDS.map(id => ({ id, state: 'pendiente', ms: 0, detail: '' })),
    identification: null, report: null, validation: null, artifact: null, outcome: 'no-analizado',
    recoverability: { level: 'desconocida', intactBytesPct: null, basis: [] }, totalMs: 0,
  };
  const emit = () => opt.onStage?.({ ...run, stages: run.stages.map(s => ({ ...s })) });
  const stage = async (id: StageId, fn: () => Promise<[StageState, string]> | [StageState, string]) => {
    const s = run.stages.find(x => x.id === id)!; s.state = 'activo'; emit(); await yieldToUi();
    const a = now();
    try { const [state, detail] = await fn(); s.state = state; s.detail = detail; }
    catch (e) { s.state = 'fallido'; s.detail = `Error interno: ${e instanceof Error ? e.message : String(e)}`; }
    s.ms = Math.round(now() - a); emit();
    return s.state;
  };
  const skipRest = (from: StageId, detail: string) => { for (const s of run.stages.slice(STAGE_IDS.indexOf(from))) if (s.state === 'pendiente') { s.state = 'omitido'; s.detail = detail; } };

  // 01 — Detección
  await stage('deteccion', () => {
    const id = identify(bytes, name); run.identification = id;
    if (id.dangerous) return ['fallido', `${id.label}: programa identificado por firma. Nunca se ejecuta ni se procesa.`];
    return [id.analyzer ? 'ok' : 'parcial', `${id.label} (confianza ${id.confidence}) · ${id.signals[0] ?? ''}`];
  });

  // 02 — Diagnóstico
  const diag = await stage('diagnostico', async () => {
    const r = await analyzeFile(bytes, name); run.report = r;
    if (r.integrity === 'no-analizado') return ['omitido', r.findings[0]?.message ?? 'Sin analizador para este formato.'];
    const dano = r.findings.filter(f => f.severity === 'dano').length;
    return [r.integrity === 'integro' ? 'ok' : r.integrity === 'irrecuperable' ? 'fallido' : 'parcial',
      r.integrity === 'integro' ? 'Sin daños detectados.' : `${dano} daño(s) y ${r.damaged.length} rango(s) afectados.`];
  });
  const r = run.report;
  if (!r || diag === 'omitido' || r.dangerous) {
    run.outcome = 'no-analizado'; skipRest('reconstruccion', 'No aplica: no hubo diagnóstico.');
    if (r) run.recoverability = estimateRecoverability(r, null);
    run.totalMs = Math.round(now() - t0); emit(); return run;
  }

  // 03 — Reconstrucción
  const verifiedItems = r.items.filter(i => i.verified && (i.bytes || i.kind === 'texto'));
  await stage('reconstruccion', () => {
    if (r.integrity === 'integro' && !r.repaired) return ['omitido', 'El archivo está íntegro: no requiere reparación.'];
    if (r.repaired) return ['ok', r.repaired.note];
    if (verifiedItems.length) return ['parcial', `Sin reparación del contenedor; se extraen ${verifiedItems.length} elemento(s) verificados.`];
    return ['fallido', 'No hay ninguna estrategia de reparación verificable para este daño.'];
  });

  // 04 — Restauración
  await stage('restauracion', async () => {
    if (r.repaired) { run.artifact = { name: r.repaired.name, bytes: r.repaired.bytes, kind: 'reparado', sha256: r.repaired.sha256 ?? await sha256Hex(r.repaired.bytes) }; return ['ok', `Generado «${r.repaired.name}» (${r.repaired.bytes.length} B).`]; }
    if (verifiedItems.length && r.integrity !== 'integro') {
      const zip = exportRecovered(r), n = `${r.name.replace(/\.[^.]*$/, '')}.recuperado.zip`;
      run.artifact = { name: n, bytes: zip, kind: 'paquete', sha256: await sha256Hex(zip) };
      return ['parcial', `Paquete con ${verifiedItems.length} elemento(s) verificados e informe.`];
    }
    return ['omitido', r.integrity === 'integro' ? 'El original sirve tal cual; no se genera copia.' : 'No hay nada verificado que restaurar.'];
  });

  // 05 — Validación: el artefacto reparado se analiza de nuevo desde cero
  let validated: boolean | null = null;
  await stage('validacion', async () => {
    if (r.integrity === 'integro' && !run.artifact) { validated = true; return ['ok', 'El original superó todas las comprobaciones del diagnóstico.']; }
    if (!run.artifact) return ['omitido', 'No hay artefacto que validar.'];
    if (run.artifact.kind === 'paquete') { validated = null; return ['parcial', 'Cada elemento del paquete ya fue verificado al extraerlo; el original sigue dañado.']; }
    const v = await analyzeFile(run.artifact.bytes, run.artifact.name); run.validation = v;
    validated = !!r.repaired?.structureVerified && v.integrity === 'integro';
    if (validated) return ['ok', `Re-análisis completo: ${v.label} íntegro.`];
    return [v.integrity === 'parcial' ? 'parcial' : 'fallido', r.repaired?.structureVerified ? `El re-análisis encuentra el resultado ${v.integrity === 'parcial' ? 'parcialmente dañado' : 'todavía dañado'}.` : 'La reparación es una propuesta: no supera su propia comprobación.'];
  });

  // 06 — Renacimiento
  run.recoverability = estimateRecoverability(r, validated);
  if (r.integrity === 'integro') run.outcome = 'integro';
  // sin pérdida = la reparación validó y el diagnóstico no registró ningún rango de bytes dañado (solo sintaxis/codificación)
  else if (validated === true) run.outcome = r.damaged.length === 0 ? 'reparado-validado' : 'recuperacion-parcial';
  else if (run.artifact?.kind === 'paquete') run.outcome = 'recuperacion-parcial';
  else if (run.artifact) run.outcome = 'reparacion-sin-verificar';
  else if (r.integrity === 'irrecuperable') run.outcome = 'irrecuperable';
  else run.outcome = 'solo-diagnostico';
  await stage('renacimiento', () => {
    const label = OUTCOME_LABEL[run.outcome];
    if (run.outcome === 'integro' || run.outcome === 'reparado-validado') return ['ok', label];
    if (run.outcome === 'recuperacion-parcial' || run.outcome === 'reparacion-sin-verificar') return ['parcial', label];
    return ['fallido', label];
  });
  run.totalMs = Math.round(now() - t0); emit();
  return run;
}
