import { describe, it, expect } from 'vitest';
import { ingest, type EvidenceRef } from './ingest';
import { diagnose, type Diagnosis } from './discovery';
import { recoverTable, type RecoveredTable } from './recovery';
import { inferSchema } from './schema';
import { reconstruct, DEFAULT_OPTIONS } from './reconstruct';
import { buildScenario } from './scenario';
import { cloudFromSamples, tileStates, buildSceneModel, buildQuetzalCloud, assignStates, pickQuality, stepDown, PARTICLE_TIERS, STAGES, CUBE_CAP, type SceneInput } from './experience';

async function input(approve = false): Promise<SceneInput> {
  const evidences: EvidenceRef[] = [], diagnoses: Record<string, Diagnosis> = {}, tables: RecoveredTable[] = [];
  for (const f of buildScenario()) {
    const { evidence, bytes } = await ingest(f.bytes, f.name, '2026-10-31T00:00:00Z');
    evidences.push(evidence); diagnoses[evidence.id] = diagnose(evidence, bytes);
    const t = recoverTable(evidence, bytes); if (t) tables.push(t);
  }
  const schema = inferSchema(tables);
  const model = reconstruct(tables, schema, { ...DEFAULT_OPTIONS, approved: { relations: approve ? schema.relations.map(r => r.id) : [], merges: [] } });
  return { evidences, diagnoses, tables, schema, model, synthetic: true };
}

describe('buildSceneModel (refleja estados reales)', () => {
  it('las cifras coinciden con los informes de recuperación', async () => {
    const m = buildSceneModel(await input());
    // Derivado a mano del escenario: íntegros 12+10+12+29+8, recuperados 1+1+2, perdidos 2, celdas 2 (VENTAS) + 2 (DETALLE: cantidad y precio) + 1 (INVENTARIO)
    expect(m.stats).toMatchObject({ declared: 77, intact: 71, recovered: 4, lost: 2, files: 6, damagedFiles: 4, unknownCells: 5 });
    expect(m.stats.declared).toBe(m.stats.intact + m.stats.recovered + m.stats.lost);
    expect(m.fractions.intact + m.fractions.recovered + m.fractions.lost).toBeCloseTo(1, 10);
    expect(m.fractions.lost).toBeCloseTo(2 / m.stats.declared, 10);
    expect(m.synthetic).toBe(true);
  });
  it('sin aprobaciones no hay relaciones aprobadas; con ellas sí', async () => {
    expect(buildSceneModel(await input(false)).graph.edges.every(e => !e.approved)).toBe(true);
    const m = buildSceneModel(await input(true));
    expect(m.graph.edges.length).toBe(4);
    expect(m.graph.edges.every(e => e.approved)).toBe(true);
    expect(m.stats.relationsApproved).toBe(4);
    expect(m.graph.edges.find(e => e.id === 'VENTAS.CLIENTE->CLIENTES.CODIGO')!.orphans).toBe(1);
  });
  it('los cubos de recovery representan registros reales, incluidos los perdidos como fantasmas', async () => {
    const m = buildSceneModel(await input());
    const v = m.columns.find(c => c.table === 'VENTAS')!;
    expect(v).toMatchObject({ intact: 12, recovered: 1, lost: 2 });
    expect(v.cubes.filter(c => c === 'perdido').length).toBe(2);
    expect(v.cubes.length).toBeLessThanOrEqual(CUBE_CAP);
  });
  it('sin evidencia no inventa nada', () => {
    const empty = buildSceneModel({ evidences: [], diagnoses: {}, tables: [], schema: { tables: [], relations: [], issues: [] }, model: reconstruct([], { tables: [], relations: [], issues: [] }), synthetic: false });
    expect(empty.stats.declared).toBe(0);
    expect(empty.fractions).toEqual({ intact: 0, recovered: 0, lost: 0 });
    expect(empty.files).toEqual([]);
    expect(empty.narrative.materializar).toMatch(/Sin evidencia/);
  });
  it('cada etapa tiene narrativa con cifras', async () => {
    const m = buildSceneModel(await input(true));
    for (const s of STAGES) expect(m.narrative[s].length).toBeGreaterThan(20);
    expect(m.narrative.recovery).toContain('2 perdidos');
  });
});

describe('buildQuetzalCloud', () => {
  const f = { intact: 0.8, recovered: 0.1, lost: 0.1 };
  it('es determinista y está dentro de límites razonables', () => {
    const a = buildQuetzalCloud(2000, f), b = buildQuetzalCloud(2000, f);
    expect(Array.from(a.target.slice(0, 60))).toEqual(Array.from(b.target.slice(0, 60)));
    let max = 0;
    for (const v of a.target) { expect(Number.isFinite(v)).toBe(true); max = Math.max(max, Math.abs(v)); }
    expect(max).toBeLessThan(6);
    expect(new Set(a.kind).size).toBe(4);
  });
  it('el reparto de estados respeta las fracciones reales', () => {
    const s = assignStates(1000, f);
    const n = (k: number) => Array.from(s).filter(x => x === k).length;
    expect(n(2)).toBe(100); expect(n(1)).toBe(100); expect(n(0)).toBe(800);
    expect(Array.from(assignStates(500, { intact: 1, recovered: 0, lost: 0 })).every(x => x === 0)).toBe(true);
  });
  it('presupuesto de rendimiento: generar la nube más grande tarda < 100 ms', () => {
    const t0 = performance.now();
    const c = buildQuetzalCloud(PARTICLE_TIERS.alta, f);
    const ms = performance.now() - t0;
    expect(c.count).toBe(6000);
    expect(ms).toBeLessThan(100);
    // memoria de buffers: 6000 * (3+3+1)*4 + 2*6000 bytes ≈ 180 KB
    const bytes = c.target.byteLength + c.start.byteLength + c.delay.byteLength + c.kind.byteLength + c.state.byteLength;
    expect(bytes).toBeLessThan(300_000);
  });
});

describe('calidad adaptativa', () => {
  it('elige nivel según capacidades y permite fijarlo', () => {
    expect(pickQuality({ width: 1440, cores: 12, memoryGb: 16 })).toBe('alta');
    expect(pickQuality({ width: 375, cores: 8 })).toBe('baja');
    expect(pickQuality({ width: 1440, cores: 4 })).toBe('media');
    expect(pickQuality({ width: 1440, cores: 12, reducedMotion: true })).toBe('media');
    expect(pickQuality({ width: 1440 }, 'baja')).toBe('baja');
    expect(pickQuality({ width: 1440 }, 'otra')).toBe('alta');
  });
  it('degrada sin pasar de baja', () => {
    expect(stepDown('alta')).toBe('media'); expect(stepDown('media')).toBe('baja'); expect(stepDown('baja')).toBe('baja');
  });
});

describe('cloudFromSamples y tileStates', () => {
  const pts = Float32Array.from(Array.from({ length: 300 }, (_, i) => Math.sin(i) * 2));
  const gold = new Uint8Array(100).map((_, i) => (i % 3 === 0 ? 1 : 0));
  it('conserva los puntos como destino, ordena de abajo hacia arriba y reparte estados reales', () => {
    const c = cloudFromSamples(pts, gold, { intact: 0.8, recovered: 0.1, lost: 0.1 });
    expect(c.count).toBe(100);
    expect(c.target).toBe(pts);
    expect(Array.from(c.state).filter(s => s === 2).length).toBe(10);
    expect(Array.from(c.kind).filter(k => k === 3).length).toBe(34);
    let lo = Infinity, hi = -Infinity, dlo = 0, dhi = 0;
    for (let i = 0; i < 100; i++) { const y = pts[i * 3 + 1]; if (y < lo) { lo = y; dlo = c.delay[i]; } if (y > hi) { hi = y; dhi = c.delay[i]; } }
    expect(dlo).toBeLessThan(dhi);
  });
  it('tileStates suma siempre n, es proporcional y no oculta pérdidas reales', () => {
    const t = tileStates({ intact: 71, recovered: 4, lost: 2 }, 40);
    expect(t.length).toBe(40);
    expect(t.filter(x => x === 'perdido').length).toBe(1);        // 2/77 * 40 = 1.04
    expect(t.filter(x => x === 'recuperado').length).toBe(2);     // 4/77 * 40 = 2.08
    const tiny = tileStates({ intact: 1000, recovered: 0, lost: 1 }, 40);
    expect(tiny.filter(x => x === 'perdido').length).toBe(1);     // al menos una si hay pérdidas
    expect(tileStates({ intact: 5, recovered: 0, lost: 0 }, 10).every(x => x === 'intacto')).toBe(true);
    expect(tileStates({ intact: 0, recovered: 0, lost: 0 }, 10)).toEqual([]);
  });
});
