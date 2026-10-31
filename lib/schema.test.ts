import { describe, it, expect } from 'vitest';
import { ingest } from './ingest';
import { recoverTable, type RecoveredTable } from './recovery';
import { inferSchema } from './schema';
import { buildScenario } from './scenario';

async function tables(): Promise<RecoveredTable[]> {
  const out: RecoveredTable[] = [];
  for (const f of buildScenario()) {
    const { evidence, bytes } = await ingest(f.bytes, f.name, '2026-10-31T00:00:00Z');
    const t = recoverTable(evidence, bytes);
    if (t) out.push(t);
  }
  return out;
}

describe('recoverTable', () => {
  it('reporta pérdidas, parciales y celdas desconocidas con exactitud', async () => {
    const t = await tables();
    const ventas = t.find(x => x.name === 'VENTAS')!;
    expect(ventas.report).toMatchObject({ declared: 15, read: 13, intact: 12, recoveredDamaged: 1, lost: 2, cellsUnknown: 2 });
    expect(ventas.rows[12].provenance).toBe('recuperado');
    expect(ventas.rows[12].unknownFields).toEqual(['FECHA', 'TOTAL']);
    expect(ventas.rows.slice(0, 12).every(r => r.provenance === 'original')).toBe(true);
    const inv = t.find(x => x.name === 'INVENTARIO')!;
    expect(inv.report.recoveredDamaged).toBe(2);
    expect(inv.report.cellsUnknown).toBe(1);
    const det = t.find(x => x.name === 'DETALLE')!;
    expect(det.rows.filter(r => r.provenance === 'recuperado').length).toBe(1);
    expect(det.rows.find(r => r.provenance === 'recuperado')!.unknownFields.length).toBeGreaterThan(0);
  });
  it('SQLite y archivos desconocidos no producen tablas', async () => {
    const t = await tables();
    expect(t.map(x => x.name).sort()).toEqual(['CLIENTES', 'DETALLE', 'INVENTARIO', 'PRODUCTOS', 'VENTAS']);
  });
});

describe('inferSchema', () => {
  it('infiere claves primarias con evidencia', async () => {
    const s = inferSchema(await tables());
    const pk = (n: string) => s.tables.find(t => t.name === n)!.primaryKey;
    expect(pk('CLIENTES')?.columns).toEqual(['CODIGO']);
    expect(pk('PRODUCTOS')?.columns).toEqual(['CODIGO']);
    expect(pk('VENTAS')?.columns).toEqual(['FOLIO']);
    expect(pk('CLIENTES')?.evidence).toMatch(/distintos/);
  });
  it('infiere las relaciones esperadas y las marca como inferidas', async () => {
    const s = inferSchema(await tables());
    const ids = s.relations.map(r => r.id).sort();
    expect(ids).toContain('VENTAS.CLIENTE->CLIENTES.CODIGO');
    expect(ids).toContain('DETALLE.folio->VENTAS.FOLIO');
    expect(ids).toContain('DETALLE.codigo->PRODUCTOS.CODIGO');
    expect(ids).toContain('INVENTARIO.CODIGO->PRODUCTOS.CODIGO');
    expect(ids).not.toContain('PRODUCTOS.CODIGO->INVENTARIO.CODIGO');
    expect(s.relations.every(r => r.status === 'inferido')).toBe(true);
  });
  it('detecta huérfanos y los relaciona con la pérdida por truncamiento', async () => {
    const s = inferSchema(await tables());
    const rel = (id: string) => s.relations.find(r => r.id === id)!;
    expect(rel('VENTAS.CLIENTE->CLIENTES.CODIGO').orphans).toEqual(['C-099']);
    expect(rel('DETALLE.codigo->PRODUCTOS.CODIGO').orphans).toEqual(['P-077']);
    expect(rel('DETALLE.folio->VENTAS.FOLIO').orphans).toEqual(['V-0014', 'V-0015']);
    expect(rel('DETALLE.folio->VENTAS.FOLIO').possiblyExplainedByLoss).toBe(true);
    expect(rel('VENTAS.CLIENTE->CLIENTES.CODIGO').possiblyExplainedByLoss).toBe(false);
  });
  it('detecta duplicados sin borrar nada', async () => {
    const s = inferSchema(await tables());
    const dup = s.issues.find(i => i.kind === 'registros_duplicados' && i.table === 'CLIENTES');
    expect(dup?.refs).toEqual([2, 11]);
    expect(s.tables.find(t => t.name === 'CLIENTES')!.deletedRows).toBe(1);
  });
  it('cardinalidad observada', async () => {
    const s = inferSchema(await tables());
    expect(s.relations.find(r => r.id === 'VENTAS.CLIENTE->CLIENTES.CODIGO')!.cardinality).toBe('1:N');
    expect(s.relations.find(r => r.id === 'INVENTARIO.CODIGO->PRODUCTOS.CODIGO')!.cardinality).toBe('1:1');
  });
  it('no falla con tablas vacías', () => {
    expect(inferSchema([])).toEqual({ tables: [], relations: [], issues: [] });
  });
});
