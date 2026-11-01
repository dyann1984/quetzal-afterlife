import { describe, it, expect, beforeEach } from 'vitest';
import { runResurrection, STAGE_IDS, estimateRecoverability, type ResurrectionRun } from './protocol';
import { buildFixtures, buildStructuredFixtures, damageSqlitePage } from './fixtures';
import { sqliteFixture } from './sqlite-fixture';
import { analyzeFile } from './index';
import { parseHistory, computeStats, toHistory, finishRun, getSession, clearHistory, _resetSession, HISTORY_MAX } from './session';

const enc = new TextEncoder();

describe('fixtures estructurados', () => {
  it('cada fixture produce la integridad declarada', async () => {
    for (const f of buildStructuredFixtures()) expect((await analyzeFile(f.bytes, f.name)).integrity, f.name).toBe(f.expectation);
  });
  it('la página dañada del SQLite es la que se informa', async () => {
    const { bytes, page } = damageSqlitePage(sqliteFixture());
    const r = await analyzeFile(bytes, 'x.db');
    expect(r.damaged.some(d => d.start === (page - 1) * 1024)).toBe(true);
    expect(Number(r.meta?.filas)).toBeLessThan(320); expect(Number(r.meta?.filas)).toBeGreaterThan(200);
  });
});

describe('protocolo de seis etapas', () => {
  it('emite las seis etapas en orden, cada una con estado final y duración medida', async () => {
    const seen: string[][] = [];
    const run = await runResurrection(enc.encode('{"a":1,'), 'a.json', { onStage: r => seen.push(r.stages.map(s => s.state)) });
    expect(run.stages.map(s => s.id)).toEqual(STAGE_IDS);
    expect(run.stages.every(s => s.state !== 'pendiente' && s.state !== 'activo')).toBe(true);
    // nunca hay una etapa «ok» antes de que la anterior haya terminado
    for (const st of seen) { const firstOpen = st.findIndex(x => x === 'pendiente' || x === 'activo'); if (firstOpen >= 0) expect(st.slice(firstOpen + 1).every(x => x === 'pendiente')).toBe(true); }
    expect(seen.length).toBeGreaterThanOrEqual(12);
  });
  it('JSON con comentarios: reparado y validado por re-análisis independiente', async () => {
    const f = buildStructuredFixtures().find(x => x.name === 'clientes-con-comentarios.json')!;
    const run = await runResurrection(f.bytes, f.name);
    expect(run.outcome).toBe('reparado-validado');
    expect(run.validation?.integrity).toBe('integro');
    expect(run.stages.find(s => s.id === 'validacion')!.state).toBe('ok');
    expect(['total', 'alta']).toContain(run.recoverability.level);
  });
  it('truncado: recuperación parcial, nunca «reparado» sin más', async () => {
    const f = buildStructuredFixtures().find(x => x.name === 'clientes-truncado.json')!;
    const run = await runResurrection(f.bytes, f.name);
    expect(run.outcome).toBe('recuperacion-parcial');
    expect(run.recoverability.intactBytesPct!).toBeLessThan(100);
  });
  it('íntegro: no se genera artefacto y la validación es el propio diagnóstico', async () => {
    const run = await runResurrection(sqliteFixture(), 'tienda.db');
    expect(run.outcome).toBe('integro'); expect(run.artifact).toBeNull();
    expect(run.stages.find(s => s.id === 'reconstruccion')!.state).toBe('omitido');
  });
  it('SQLite dañado: paquete con lo verificado, sin re-análisis falso', async () => {
    const run = await runResurrection(damageSqlitePage(sqliteFixture()).bytes, 'tienda.db');
    expect(run.outcome).toBe('recuperacion-parcial'); expect(run.artifact?.kind).toBe('paquete');
    expect(run.stages.find(s => s.id === 'validacion')!.state).toBe('parcial');
  });
  it('ejecutables: se detienen en la detección', async () => {
    const run = await runResurrection(Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]), 'x.exe');
    expect(run.stages[0].state).toBe('fallido'); expect(run.outcome).toBe('no-analizado');
    expect(run.stages.slice(2).every(s => s.state === 'omitido')).toBe(true);
  });
  it('irrecuperable se declara como tal', async () => {
    const run = await runResurrection(enc.encode('{"x'), 'roto.json');
    expect(run.outcome).toBe('irrecuperable'); expect(run.recoverability.level).toBe('nula'); expect(run.artifact).toBeNull();
  });
  it('todos los fixtures recorren el protocolo sin excepciones', async () => {
    for (const f of buildFixtures().filter(x => x.expectation !== 'carving')) {
      const run = await runResurrection(f.bytes, f.name);
      expect(run.stages.some(s => s.state === 'fallido' && s.detail.startsWith('Error interno')), f.name).toBe(false);
    }
  }, 30000);
  it('la estimación de recuperabilidad se deriva de los rangos medidos', () => {
    const base = { name: 'x', size: 1000, sha256: '', format: 'json', label: 'JSON', category: 'texto' as const, confidence: 'alta' as const, signals: [], dangerous: false, elapsedMs: 0, findings: [], limitations: [] };
    const e = estimateRecoverability({ ...base, integrity: 'parcial', damaged: [{ start: 0, end: 100, reason: '' }, { start: 50, end: 200, reason: '' }], items: [{ kind: 'texto', name: 'a', size: 1, verified: true, basis: '' }] }, null);
    expect(e.intactBytesPct).toBe(80); expect(e.level).toBe('media');
  });
});

describe('historial y estadísticas', () => {
  beforeEach(() => _resetSession());
  it('el historial guarda solo metadatos y tolera datos corruptos', async () => {
    const run = await runResurrection(enc.encode('{"secreto":"no debe guardarse"'), 's.json');
    const h = toHistory(run);
    expect(JSON.stringify(h)).not.toContain('no debe guardarse');
    expect(parseHistory('no json')).toEqual([]); expect(parseHistory('{"a":1}')).toEqual([]);
    expect(parseHistory(JSON.stringify([h, { id: 1 }, null]))).toEqual([h]);
  });
  it('finishRun añade al historial con tope, y las estadísticas salen solo de él', async () => {
    let last: ResurrectionRun | null = null;
    for (let i = 0; i < HISTORY_MAX + 5; i++) { last = await runResurrection(enc.encode(`{"n":${i}}`), `n${i}.json`, { id: `r${i}`, synthetic: i % 2 === 0 }); finishRun(last); }
    const s = getSession(); expect(s.history.length).toBe(HISTORY_MAX); expect(s.history[0].id).toBe(last!.id);
    const st = computeStats(s.history);
    expect(st.total).toBe(HISTORY_MAX); expect(st.byOutcome.integro).toBe(HISTORY_MAX); expect(st.synthetic + st.real).toBe(HISTORY_MAX);
    clearHistory(); expect(computeStats(getSession().history).total).toBe(0);
  });
});
