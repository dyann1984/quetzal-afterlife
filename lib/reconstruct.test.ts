import { describe, it, expect } from 'vitest';
import { ingest } from './ingest';
import { recoverTable, type RecoveredTable } from './recovery';
import { inferSchema } from './schema';
import { reconstruct, modelFingerprint, DEFAULT_OPTIONS } from './reconstruct';
import { buildScenario } from './scenario';

async function setup() {
  const tables: RecoveredTable[] = [];
  for (const f of buildScenario()) {
    const { evidence, bytes } = await ingest(f.bytes, f.name, '2026-10-31T00:00:00Z');
    const t = recoverTable(evidence, bytes);
    if (t) tables.push(t);
  }
  return { tables, schema: inferSchema(tables) };
}

describe('reconstruct', () => {
  it('sin aprobaciones no aplica relaciones inferidas', async () => {
    const { tables, schema } = await setup();
    const m = reconstruct(tables, schema);
    expect(m.relations).toEqual([]);
    expect(m.integrity.filter(i => i.id.startsWith('fk-'))).toEqual([]);
  });
  it('excluye borrados con registro y conserva linaje por registro', async () => {
    const { tables, schema } = await setup();
    const m = reconstruct(tables, schema);
    const cli = m.tables.find(t => t.name === 'CLIENTES')!;
    expect(cli.rows.length).toBe(11);
    expect(m.excluded).toContainEqual({ table: 'CLIENTES', ref: 7, reason: 'marcado como borrado en el origen' });
    expect(cli.rows[0].lineage).toMatchObject({ evidenceName: 'CLIENTES.DBF', ref: 1, provenance: 'original' });
    expect(cli.pkStatus).toBe('inferido');
  });
  it('relaciones aprobadas generan validaciones de integridad sin inventar registros', async () => {
    const { tables, schema } = await setup();
    const m = reconstruct(tables, schema, { ...DEFAULT_OPTIONS, approved: { relations: schema.relations.map(r => r.id), merges: [] } });
    const fk = (id: string) => m.integrity.find(i => i.id === `fk-${id}`)!;
    expect(fk('VENTAS.CLIENTE->CLIENTES.CODIGO')).toMatchObject({ status: 'falla', count: 1 });
    expect(fk('DETALLE.folio->VENTAS.FOLIO').count).toBe(4); // 2 folios perdidos × 2 líneas
    expect(m.tables.find(t => t.name === 'VENTAS')!.rows.length).toBe(13);
    expect(m.relations.every(r => r.approvedByUser)).toBe(true);
  });
  it('registros parciales quedan marcados y sin valores estimados', async () => {
    const { tables, schema } = await setup();
    const m = reconstruct(tables, schema);
    const parcial = m.tables.find(t => t.name === 'VENTAS')!.rows[12];
    expect(parcial.complete).toBe(false);
    expect(parcial.values.TOTAL).toBe('');
    expect(m.rules.some(r => r.id === 'R-VENTAS-parciales')).toBe(true);
  });
  it('fusión de duplicados solo con aprobación y deja rastro', async () => {
    const { tables, schema } = await setup();
    const m = reconstruct(tables, schema, { ...DEFAULT_OPTIONS, approved: { relations: [], merges: [{ table: 'CLIENTES', keep: 2, drop: 11 }] } });
    expect(m.tables.find(t => t.name === 'CLIENTES')!.rows.length).toBe(10);
    expect(m.excluded).toContainEqual({ table: 'CLIENTES', ref: 11, reason: 'fusionado por aprobación del usuario', mergedInto: 2 });
  });
  it('es reproducible: mismo fingerprint para mismas entradas', async () => {
    const { tables, schema } = await setup();
    const a = await modelFingerprint(reconstruct(tables, schema));
    const b = await modelFingerprint(reconstruct(tables, schema));
    expect(a).toBe(b);
    const c = await modelFingerprint(reconstruct(tables, schema, { ...DEFAULT_OPTIONS, excludeDeleted: false }));
    expect(c).not.toBe(a);
  });
});
