import { describe, it, expect } from 'vitest';
import { ingest, type EvidenceRef } from './ingest';
import { diagnose, type Diagnosis } from './discovery';
import { recoverTable, type RecoveredTable } from './recovery';
import { inferSchema } from './schema';
import { reconstruct, DEFAULT_OPTIONS } from './reconstruct';
import { buildScenario } from './scenario';
import { localAnalyst, remoteAnalystPlaceholder, runAnalyst, toApprovals, validateProposals, buildPayload, ConsentError, type Proposal } from './analyst';
import { buildAppModel, createWorkingCopy, insertRow, updateRow, deleteRow, search, related, exportPrototypeHtml } from './studio';
import { buildDossier, verifyDossier, renderReportMarkdown, renderReportHtml, dossierJson } from './vault';

const NOW = '2026-10-31T00:00:00.000Z';

async function world() {
  const evidences: EvidenceRef[] = [], diagnoses: Record<string, Diagnosis> = {}, tables: RecoveredTable[] = [];
  for (const f of buildScenario()) {
    const { evidence, bytes } = await ingest(f.bytes, f.name, NOW);
    evidences.push(evidence);
    diagnoses[evidence.id] = diagnose(evidence, bytes);
    const t = recoverTable(evidence, bytes);
    if (t) tables.push(t);
  }
  const schema = inferSchema(tables);
  return { evidences, diagnoses, tables, schema };
}

describe('analyst', () => {
  it('propone con evidencia y nada se aplica sin aprobación', async () => {
    const w = await world();
    const r = await runAnalyst(localAnalyst, w);
    expect(r.rejected).toEqual([]);
    expect(r.valid.length).toBeGreaterThan(5);
    expect(r.valid.every(p => p.evidence.length > 0 && p.requiresApproval)).toBe(true);
    expect(toApprovals(r.valid, [])).toEqual({ relations: [], merges: [] });
    const rel = r.valid.find(p => p.id === 'rel:VENTAS.CLIENTE->CLIENTES.CODIGO')!;
    const ap = toApprovals(r.valid, [rel.id, 'dup:CLIENTES:2-11']);
    expect(ap.relations).toEqual(['VENTAS.CLIENTE->CLIENTES.CODIGO']);
    expect(ap.merges).toEqual([{ table: 'CLIENTES', keep: 2, drop: 11 }]);
  });
  it('descarta propuestas inventadas o sin evidencia', async () => {
    const w = await world();
    const bad: Proposal[] = [
      { id: 'a', kind: 'aprobar_relacion', title: 't', explanation: 'e', evidence: [], action: { type: 'none' }, source: 'x', requiresApproval: true },
      { id: 'b', kind: 'aprobar_relacion', title: 't', explanation: 'e', evidence: ['algo'], action: { type: 'relation', id: 'FALSA.a->B.c' }, source: 'x', requiresApproval: true },
      { id: 'c', kind: 'fusionar_duplicado', title: 't', explanation: 'e', evidence: ['algo'], action: { type: 'merge', table: 'CLIENTES', keep: 1, drop: 999 }, source: 'x', requiresApproval: true },
    ];
    const v = validateProposals(bad, w);
    expect(v.valid).toEqual([]);
    expect(v.rejected.map(x => x.reason)).toEqual(['sin evidencia', 'relación inexistente', 'registro inexistente']);
  });
  it('un proveedor remoto exige consentimiento; sin credenciales falla sin enviar nada', async () => {
    const w = await world();
    await expect(runAnalyst(remoteAnalystPlaceholder, w)).rejects.toBeInstanceOf(ConsentError);
    await expect(runAnalyst(remoteAnalystPlaceholder, w, { granted: true, scope: 'metadatos' })).rejects.toThrow(/No hay proveedor/);
  });
  it('el payload por defecto no contiene valores de celdas', async () => {
    const w = await world();
    const json = JSON.stringify(buildPayload(w, 'metadatos'));
    expect(json).not.toContain('ana.morales');
    expect(json).not.toContain('Cafe de altura');
    expect(JSON.stringify(buildPayload(w, 'muestras'))).toContain('ana.morales');
  });
});

describe('studio', () => {
  async function wc() {
    const w = await world();
    const r = await runAnalyst(localAnalyst, w);
    const model = reconstruct(w.tables, w.schema, { ...DEFAULT_OPTIONS, approved: toApprovals(r.valid, r.valid.filter(p => p.action.type === 'relation').map(p => p.id)) });
    return { w, model, copy: createWorkingCopy(model) };
  }
  it('genera entidades con relaciones navegables', async () => {
    const { model } = await wc();
    const app = buildAppModel(model);
    const ventas = app.entities.find(e => e.name === 'VENTAS')!;
    expect(ventas.outgoing.map(o => o.target)).toContain('CLIENTES');
    expect(ventas.incoming.map(o => o.from)).toContain('DETALLE');
    expect(app.notice).toMatch(/INFERIDAS/);
  });
  it('edita solo la copia de trabajo y registra el historial', async () => {
    const { model, copy } = await wc();
    const before = JSON.stringify(model);
    expect(insertRow(copy, 'CLIENTES', { CODIGO: 'C-500', NOMBRE: 'Nuevo', CIUDAD: 'X', EMAIL: 'n@ejemplo.test' }, NOW)).toEqual({ ok: true });
    expect(updateRow(copy, 'CLIENTES', 'C-500', { CIUDAD: 'Y' }, NOW)).toEqual({ ok: true });
    expect(deleteRow(copy, 'CLIENTES', 'C-500', NOW)).toEqual({ ok: true });
    expect(copy.log.map(l => l.op)).toEqual(['insertar', 'actualizar', 'eliminar']);
    expect(JSON.stringify(model)).toBe(before);
  });
  it('aplica las reglas CRUD explícitas', async () => {
    const { copy } = await wc();
    expect(insertRow(copy, 'CLIENTES', { CODIGO: 'C-001', NOMBRE: 'dup' }, NOW)).toMatchObject({ ok: false });
    expect(insertRow(copy, 'CLIENTES', { NOMBRE: 'sin clave' }, NOW)).toMatchObject({ ok: false });
    expect(insertRow(copy, 'VENTAS', { FOLIO: 'V-9000', CLIENTE: 'C-404', FECHA: '19980101', TOTAL: '1' }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/no existe/) });
    expect(insertRow(copy, 'PRODUCTOS', { CODIGO: 'P-900', DESCRIP: 'x', PRECIO: 'abc' }, NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/numérico/) });
    expect(deleteRow(copy, 'CLIENTES', 'C-001', NOW)).toMatchObject({ ok: false, error: expect.stringMatching(/referencian/) });
  });
  it('búsqueda y navegación entre relaciones', async () => {
    const { copy } = await wc();
    expect(search(copy, 'CLIENTES', 'oaxaca').length).toBe(4);
    const rel = related(copy, 'CLIENTES', 'C-001');
    expect(rel.children.find(c => c.table === 'VENTAS')!.rows.length).toBe(2);
    const v = related(copy, 'VENTAS', 'V-0001');
    expect(v.parents[0].table).toBe('CLIENTES');
  });
  it('el prototipo exportado escapa contenido hostil y no incluye código de los datos', async () => {
    const { copy } = await wc();
    insertRow(copy, 'CLIENTES', { CODIGO: 'C-XSS', NOMBRE: '</script><img src=x onerror=alert(1)>', CIUDAD: '', EMAIL: '' }, NOW);
    const html = exportPrototypeHtml(copy, { title: 'Prueba <b>', synthetic: true });
    expect(html).not.toContain('</script><img');
    expect(html).toContain('\\u003c/script\\u003e');
    expect(html).toContain('Prueba &lt;b&gt;');
    expect(html).toContain('SINTÉTICO');
    expect((html.match(/<script/g) ?? []).length).toBe(2);
  });
});

describe('vault', () => {
  async function dossier() {
    const w = await world();
    const model = reconstruct(w.tables, w.schema);
    return buildDossier({ title: 'Expediente SINTÉTICO', synthetic: true, generatedAt: NOW, ...w, model, steps: [{ at: NOW, step: 'ingesta', description: '6 archivos' }], approvals: { relations: [], merges: [] } });
  }
  it('incluye SHA-256 de cada evidencia, incertidumbre y se autoverifica', async () => {
    const d = await dossier();
    expect(d.evidences.length).toBe(6);
    expect(d.evidences.every(e => /^[0-9a-f]{64}$/.test(e.sha256))).toBe(true);
    expect(d.uncertainty.some(u => u.kind === 'registro_perdido')).toBe(true);
    expect(d.uncertainty.some(u => u.kind === 'celda_desconocida')).toBe(true);
    expect(d.uncertainty.some(u => u.kind === 'inferencia')).toBe(true);
    expect(await verifyDossier(d)).toBe(true);
  });
  it('detecta alteraciones del expediente', async () => {
    const d = await dossier();
    const tampered = JSON.parse(dossierJson(d));
    tampered.recovery[0].lost = 99;
    expect(await verifyDossier(tampered)).toBe(false);
  });
  it('es reproducible salvo por la fecha', async () => {
    const a = await dossier(), b = await dossier();
    expect(a.dossierSha256).toBe(b.dossierSha256);
    expect(a.modelFingerprint).toBe(b.modelFingerprint);
  });
  it('versiona reconstrucciones', async () => {
    const w = await world();
    const m1 = reconstruct(w.tables, w.schema);
    const d1 = await buildDossier({ title: 't', synthetic: true, generatedAt: NOW, ...w, model: m1, steps: [], approvals: { relations: [], merges: [] }, note: 'sin aprobaciones' });
    const m2 = reconstruct(w.tables, w.schema, { ...DEFAULT_OPTIONS, version: 2, parentVersion: 1, excludeDeleted: false });
    const d2 = await buildDossier({ title: 't', synthetic: true, generatedAt: NOW, ...w, model: m2, steps: [], approvals: { relations: [], merges: [] }, previousVersions: d1.versions });
    expect(d2.versions.map(v => v.version)).toEqual([1, 2]);
    expect(d2.versions[0].fingerprint).not.toBe(d2.versions[1].fingerprint);
  });
  it('los informes son legibles y escapan HTML', async () => {
    const d = await dossier();
    d.title = '<script>alert(1)</script>';
    const md = renderReportMarkdown(d), html = renderReportHtml(d);
    expect(md).toContain('SINTÉTICO');
    expect(md).toContain('VENTAS');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
