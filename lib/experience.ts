/**
 * lib/experience.ts — Modelo de escena de la «Experiencia de resurrección»
 * Quetzal Afterlife
 *
 * Capa de DATOS de la visualización: convierte el estado REAL del motor
 * (recuperación, esquema, reconstrucción) en cifras, nodos y partículas.
 * No importa React, three ni el DOM; el motor no depende de este módulo.
 *
 * Regla de honestidad: nada aquí inventa información. La fracción de partículas
 * "materializadas" sale de registros íntegros / recuperados / perdidos reales; las
 * partículas que corresponden a registros perdidos NUNCA se materializan.
 */

import type { EvidenceRef } from './ingest';
import type { Diagnosis } from './discovery';
import type { RecoveredTable } from './recovery';
import type { SchemaModel } from './schema';
import type { ReconModel } from './reconstruct';

export type Stage = 'materializar' | 'discovery' | 'recovery' | 'reconstruction' | 'studio' | 'vault';
export const STAGES: readonly Stage[] = ['materializar', 'discovery', 'recovery', 'reconstruction', 'studio', 'vault'];
export const STAGE_LABEL: Record<Stage, string> = {
  materializar: 'Materialización', discovery: 'Discovery', recovery: 'Recovery',
  reconstruction: 'Reconstruction', studio: 'Studio', vault: 'Vault',
};

export interface SceneInput {
  evidences: EvidenceRef[];
  diagnoses: Record<string, Diagnosis>;
  tables: RecoveredTable[];
  schema: SchemaModel;
  model: ReconModel;
  synthetic: boolean;
}

export type Vec3 = [number, number, number];

export interface FileNode { id: string; label: string; format: string; size: number; shortHash: string; damaged: boolean; findings: number; pos: Vec3 }
export interface TableColumn {
  table: string; pos: Vec3;
  intact: number; recovered: number; lost: number; unknownCells: number;
  /** Cubos a dibujar (≤ cap): cada cubo representa `perCube` registros reales. */
  cubes: Array<'intacto' | 'recuperado' | 'perdido'>;
  perCube: number;
}
export interface GraphNode { id: string; rows: number; pos: Vec3; source: string }
export interface GraphEdge { id: string; from: string; to: string; approved: boolean; confidence: string; orphans: number; cardinality: string }

export interface SceneStats {
  declared: number; intact: number; recovered: number; lost: number;
  unknownCells: number; files: number; damagedFiles: number; unsupportedFiles: number;
  relationsInferred: number; relationsApproved: number;
  integrityOk: number; integrityWarn: number; integrityFail: number;
  excluded: number; version: number;
}

export interface SceneModel {
  synthetic: boolean;
  stats: SceneStats;
  /** Fracciones reales de registros (suman 1 salvo que no haya datos). */
  fractions: { intact: number; recovered: number; lost: number };
  files: FileNode[];
  columns: TableColumn[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  narrative: Record<Stage, string>;
}

// ─── PRNG determinista ────────────────────────────────────────────────────────
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Anillo elíptico vertical (visible de frente) con ligera profundidad alterna. */
const ring = (i: number, n: number, r: number, y = 0): Vec3 => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
  return [Math.cos(a) * r * 1.25, Math.sin(a) * r * 0.62 + y, ((i % 2) - 0.5) * 1.2];
};
/** Anillo horizontal para las columnas de registros (se leen como una ciudad). */
const flatRing = (i: number, n: number, r: number): Vec3 => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(n, 1);
  return [Math.cos(a) * r, 0, Math.sin(a) * r * 0.6];
};

export const CUBE_CAP = 40;

export function buildSceneModel(input: SceneInput): SceneModel {
  const { evidences, diagnoses, tables, schema, model } = input;

  let declared = 0, intact = 0, recovered = 0, lost = 0, unknownCells = 0;
  for (const t of tables) {
    const r = t.report;
    intact += r.intact; recovered += r.recoveredDamaged; lost += r.lost; unknownCells += r.cellsUnknown;
    declared += r.read + r.lost;
  }
  const denom = declared || 1;
  const fractions = declared === 0 ? { intact: 0, recovered: 0, lost: 0 } : { intact: intact / denom, recovered: recovered / denom, lost: lost / denom };

  const files: FileNode[] = evidences.map((e, i) => {
    const d = diagnoses[e.id];
    return {
      id: e.id, label: e.name, format: e.format, size: e.size, shortHash: e.sha256.slice(0, 8),
      damaged: !!d?.damaged, findings: d?.findings.filter(f => f.severity === 'dano').length ?? 0,
      pos: ring(i, evidences.length, 3.2, (i % 2 === 0 ? 0.35 : -0.35)),
    };
  });

  const maxPerCol = Math.max(1, ...tables.map(t => t.report.read + t.report.lost));
  const perCube = Math.max(1, Math.ceil(maxPerCol / CUBE_CAP));
  const columns: TableColumn[] = tables.map((t, i) => {
    const seq: TableColumn['cubes'] = [];
    const push = (kind: TableColumn['cubes'][number], n: number) => { for (let k = 0; k < Math.ceil(n / perCube); k++) seq.push(kind); };
    push('intacto', t.report.intact); push('recuperado', t.report.recoveredDamaged); push('perdido', t.report.lost);
    return {
      table: t.name, pos: flatRing(i, tables.length, 3.6), intact: t.report.intact, recovered: t.report.recoveredDamaged,
      lost: t.report.lost, unknownCells: t.report.cellsUnknown, cubes: seq, perCube,
    };
  });

  const nodes: GraphNode[] = model.tables.map((t, i) => {
    const src = tables.find(x => x.name === t.name);
    return { id: t.name, rows: t.rows.length, pos: ring(i, model.tables.length, 2.6, ((i % 3) - 1) * 0.5), source: src?.evidenceName ?? '' };
  });
  const approvedIds = new Set(model.relations.map(r => r.id));
  const edges: GraphEdge[] = schema.relations.map(r => ({
    id: r.id, from: r.child.table, to: r.parent.table, approved: approvedIds.has(r.id), confidence: r.confidence, orphans: r.orphans.length, cardinality: r.cardinality,
  }));

  const integ = model.integrity;
  const stats: SceneStats = {
    declared, intact, recovered, lost, unknownCells, files: evidences.length,
    damagedFiles: files.filter(f => f.damaged).length,
    unsupportedFiles: evidences.filter(e => diagnoses[e.id]?.supportLevel !== 'lectura-tolerante').length,
    relationsInferred: schema.relations.length, relationsApproved: model.relations.length,
    integrityOk: integ.filter(i => i.status === 'ok').length, integrityWarn: integ.filter(i => i.status === 'advertencia').length,
    integrityFail: integ.filter(i => i.status === 'falla').length, excluded: model.excluded.length, version: model.version,
  };

  const pct = (x: number) => `${(x * 100).toFixed(1)} %`;
  const narrative: Record<Stage, string> = {
    materializar: declared === 0
      ? 'Sin evidencia: no hay nada que materializar.'
      : `El quetzal se forma con ${intact + recovered} de ${declared} registros declarados (${pct(fractions.intact + fractions.recovered)}). Las partículas de los ${lost} registros perdidos no se materializan.`,
    discovery: `${stats.files} archivos identificados por contenido, cada uno con su SHA-256. ${stats.damagedFiles} con daños detectados; ${stats.unsupportedFiles} sin lectura de tablas.`,
    recovery: `${intact} registros íntegros, ${recovered} recuperados de zonas dañadas, ${lost} perdidos (cubos fantasma) y ${unknownCells} celdas desconocidas que no se estiman.`,
    reconstruction: `${stats.relationsInferred} relaciones inferidas; ${stats.relationsApproved} aprobadas por el usuario (líneas brillantes). Las no aprobadas se muestran tenues y no se aplican.`,
    studio: `Sistema reconstruido (izquierda) junto a la evidencia original (derecha). Cada tabla se enlaza con su archivo de origen; ${stats.excluded} registros excluidos quedan registrados.`,
    vault: `Integridad: ${stats.integrityOk} validaciones correctas, ${stats.integrityWarn} advertencias, ${stats.integrityFail} fallas. ${lost} registros perdidos y ${unknownCells} celdas desconocidas constan en el expediente.`,
  };

  return { synthetic: input.synthetic, stats, fractions, files, columns, graph: { nodes, edges }, narrative };
}

// ─── Quetzal de partículas ───────────────────────────────────────────────────

export type ParticleKind = 0 | 1 | 2 | 3; // 0 cuerpo, 1 ala, 2 cola, 3 cresta/pico (dorado)
export type ParticleState = 0 | 1 | 2;    // 0 íntegro, 1 recuperado con daño, 2 perdido

export interface QuetzalCloud {
  count: number;
  target: Float32Array;   // posición final (silueta del quetzal)
  start: Float32Array;    // posición dispersa inicial
  delay: Float32Array;    // 0..1, orden de materialización
  kind: Uint8Array;
  state: Uint8Array;
}

export const PARTICLE_TIERS = { alta: 6000, media: 3500, baja: 1800 } as const;
export type Quality = keyof typeof PARTICLE_TIERS;

/** Asigna el estado de cada partícula según fracciones reales; el reparto es determinista. */
export function assignStates(count: number, fractions: { intact: number; recovered: number; lost: number }, seed = 7): Uint8Array {
  const state = new Uint8Array(count);
  const lostN = Math.round(count * fractions.lost);
  const recN = Math.round(count * fractions.recovered);
  const rnd = mulberry32(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let k = 0; k < lostN && k < count; k++) state[order[k]] = 2;
  for (let k = lostN; k < lostN + recN && k < count; k++) state[order[k]] = 1;
  return state;
}

export function buildQuetzalCloud(count: number, fractions: { intact: number; recovered: number; lost: number }, seed = 1998): QuetzalCloud {
  const rnd = mulberry32(seed);
  const target = new Float32Array(count * 3), start = new Float32Array(count * 3);
  const delay = new Float32Array(count), kind = new Uint8Array(count);
  const set = (i: number, k: ParticleKind, x: number, y: number, z: number) => {
    target[i * 3] = x; target[i * 3 + 1] = y; target[i * 3 + 2] = z; kind[i] = k;
  };
  // Reparto por partes
  const nBody = Math.floor(count * 0.24), nHead = Math.floor(count * 0.05), nCrest = Math.floor(count * 0.04);
  const nWing = Math.floor(count * 0.33), nTail = count - nBody - nHead - nCrest - nWing;
  let i = 0;
  // Cuerpo: elipsoide curvado (pecho abultado)
  for (let k = 0; k < nBody; k++, i++) {
    const u = rnd(), a = rnd() * Math.PI * 2, r = 0.32 * Math.sqrt(1 - Math.pow(2 * u - 1, 2)) + 0.02 * rnd();
    const y = 0.9 - u * 1.9;
    set(i, 0, Math.cos(a) * r, y, Math.sin(a) * r * 0.8 + 0.15 * Math.sin(u * Math.PI));
  }
  // Cabeza (esfera) y pico
  for (let k = 0; k < nHead; k++, i++) {
    const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), r = 0.2;
    set(i, k < nHead * 0.2 ? 3 : 0, 0.05 + r * Math.sin(b) * Math.cos(a) + (k < nHead * 0.2 ? 0.22 : 0), 1.12 + r * Math.cos(b), r * Math.sin(b) * Math.sin(a));
  }
  // Cresta dorada
  for (let k = 0; k < nCrest; k++, i++) {
    const t = rnd();
    set(i, 3, -0.05 - 0.28 * t, 1.3 + 0.18 * Math.sin(t * Math.PI), (rnd() - 0.5) * 0.08);
  }
  // Alas: plumas en abanico, con curvatura
  for (let k = 0; k < nWing; k++, i++) {
    const side = k % 2 === 0 ? 1 : -1;
    // Abanico de plumas de arriba-afuera (0.65 rad) a abajo-afuera (-0.8 rad), con relleno lateral (coberteras)
    const feather = Math.floor(rnd() * 9), t = Math.sqrt(rnd());
    const ang = 0.65 - feather * 0.18 - 0.25 * t * t;
    const len = 0.9 + 1.9 * t;
    const spread = (rnd() - 0.5) * (0.1 + 0.28 * t);
    const x = side * (0.25 + len * Math.cos(ang) * 0.9 - spread * Math.sin(ang));
    const y = 0.5 + len * Math.sin(ang) * 0.9 + spread * Math.cos(ang);
    set(i, 1, x, y, -0.2 * t + (rnd() - 0.5) * 0.05 + (feather % 2) * 0.03);
  }
  // Cola: 3 plumas largas ondulantes (rasgo del quetzal)
  for (let k = 0; k < nTail; k++, i++) {
    const strand = k % 3, t = rnd();
    const len = 3.2 + strand * 0.5;
    const y = -0.9 - len * t;
    const x = (strand - 1) * 0.18 * (1 + t) + 0.22 * Math.sin(t * 7 + strand * 2) * t;
    const z = 0.18 * Math.cos(t * 6 + strand) * t + (rnd() - 0.5) * 0.04;
    set(i, t > 0.9 ? 3 : 2, x, y, z);
  }
  for (let k = 0; k < count; k++) {
    // inicio: nube dispersa esférica grande
    const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), r = 3 + rnd() * 4;
    start[k * 3] = Math.sin(b) * Math.cos(a) * r; start[k * 3 + 1] = Math.cos(b) * r * 0.8; start[k * 3 + 2] = Math.sin(b) * Math.sin(a) * r;
    // orden de materialización: de la cabeza a la cola
    delay[k] = Math.min(1, Math.max(0, (1.4 - target[k * 3 + 1]) / 6.5)) * 0.7 + rnd() * 0.3;
  }
  return { count, target, start, delay, kind, state: assignStates(count, fractions) };
}

/** Calidad inicial según capacidades. `override` permite fijarla (pruebas, ?q=). */
export function pickQuality(env: { width: number; cores?: number; memoryGb?: number; reducedMotion?: boolean }, override?: string | null): Quality {
  if (override === 'alta' || override === 'media' || override === 'baja') return override;
  if (env.reducedMotion) return 'media';
  if (env.width < 768 || (env.cores ?? 8) <= 2 || (env.memoryGb ?? 8) <= 2) return 'baja';
  if ((env.cores ?? 8) <= 4 || (env.memoryGb ?? 8) <= 4) return 'media';
  return 'alta';
}

export function stepDown(q: Quality): Quality { return q === 'alta' ? 'media' : 'baja'; }

// ─── Aura de partículas sobre la silueta 3D + teselas de datos ───────────────

/** Construye la nube a partir de puntos muestreados sobre la geometría real del ave. Los puntos "perdidos" nunca se ensamblan. */
export function cloudFromSamples(points: Float32Array, gold: Uint8Array, fractions: { intact: number; recovered: number; lost: number }, seed = 5): QuetzalCloud {
  const count = points.length / 3, rnd = mulberry32(seed);
  const start = new Float32Array(count * 3), delay = new Float32Array(count), kind = new Uint8Array(count);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < count; i++) { ymin = Math.min(ymin, points[i * 3 + 1]); ymax = Math.max(ymax, points[i * 3 + 1]); }
  const span = Math.max(ymax - ymin, 1e-6);
  for (let i = 0; i < count; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    // dispersión radial desde el centro del ave
    const dx = x, dy = y + 1.5, dz = z, len = Math.hypot(dx, dy, dz) || 1, push = 1.2 + rnd() * 3;
    start[i * 3] = x + (dx / len) * push + (rnd() - 0.5); start[i * 3 + 1] = y + (dy / len) * push + (rnd() - 0.5); start[i * 3 + 2] = z + (dz / len) * push + (rnd() - 0.5) * 2;
    delay[i] = 0.7 * ((y - ymin) / span) + 0.3 * rnd();   // de abajo hacia arriba
    kind[i] = gold[i] ? 3 : 0;
  }
  return { count, target: points, start, delay, kind, state: assignStates(count, fractions, seed + 2) };
}

export type TileState = 'intacto' | 'recuperado' | 'perdido';
/** Reparte N teselas por estado con el método del mayor resto. Si hay pérdidas reales, al menos una tesela las representa. */
export function tileStates(counts: { intact: number; recovered: number; lost: number }, n = 40): TileState[] {
  const total = counts.intact + counts.recovered + counts.lost;
  if (total <= 0 || n <= 0) return [];
  const exact = [counts.intact, counts.recovered, counts.lost].map(c => (c / total) * n);
  const base = exact.map(Math.floor);
  let rest = n - base.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r);
  for (let k = 0; rest > 0; k = (k + 1) % 3, rest--) base[order[k].i]++;
  const src = [counts.intact, counts.recovered, counts.lost];
  for (const i of [2, 1]) if (src[i] > 0 && base[i] === 0) { base[0]--; base[i]++; }
  return [...Array(base[0]).fill('intacto'), ...Array(base[1]).fill('recuperado'), ...Array(base[2]).fill('perdido')] as TileState[];
}
