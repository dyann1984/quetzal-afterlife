/**
 * lib/inventory.test.ts — Pruebas del módulo de reconstrucción de inventario
 * Quetzal Afterlife · The Digital Resurrection Engine
 */

import { describe, it, expect } from 'vitest';
import { reconstructInventory, type InventoryRow } from './inventory';

// ─── helpers ─────────────────────────────────────────────────────────────────

function rows(data: Record<string, string>[], deletedIdx: number[] = []): InventoryRow[] {
  return data.map((values, i) => ({ values, deleted: deletedIdx.includes(i) }));
}

// ─── Detección de campos ──────────────────────────────────────────────────────

describe('detección de campos', () => {
  it('detecta cantidad=alto para "cantidad"', () => {
    const r = reconstructInventory(['id', 'nombre', 'cantidad'], rows([]));
    const m = r.fieldMatches.find(f => f.role === 'cantidad');
    expect(m?.fieldName).toBe('cantidad');
    expect(m?.confidence).toBe('alto');
  });

  it('detecta cantidad=alto para "STOCK" (mayúsculas)', () => {
    const r = reconstructInventory(['CODIGO', 'NOMBRE', 'STOCK'], rows([]));
    const m = r.fieldMatches.find(f => f.role === 'cantidad');
    expect(m?.fieldName).toBe('STOCK');
    expect(m?.confidence).toBe('alto');
  });

  it('detecta cantidad=alto para "qty"', () => {
    const r = reconstructInventory(['sku', 'qty'], rows([]));
    const m = r.fieldMatches.find(f => f.role === 'cantidad');
    expect(m?.fieldName).toBe('qty');
    expect(m?.confidence).toBe('alto');
  });

  it('detecta cantidad=alto para "existencias" con acento normalizado', () => {
    const r = reconstructInventory(['Código', 'Existencias'], rows([]));
    const qty = r.fieldMatches.find(f => f.role === 'cantidad');
    expect(qty?.confidence).toBe('alto');
  });

  it('detecta id=alto para "id"', () => {
    const r = reconstructInventory(['id', 'cantidad'], rows([]));
    const id = r.fieldMatches.find(f => f.role === 'id');
    expect(id?.fieldName).toBe('id');
    expect(id?.confidence).toBe('alto');
  });

  it('detecta id=medio para "codigo_prod" (parcial)', () => {
    const r = reconstructInventory(['codigo_prod', 'cantidad'], rows([]));
    const id = r.fieldMatches.find(f => f.role === 'id');
    expect(id?.confidence).toBe('medio');
  });

  it('sin campo de cantidad → operacionDetectada: false', () => {
    const r = reconstructInventory(['nombre', 'descripcion'], rows([]));
    expect(r.operacionDetectada).toBe(false);
    expect(r.items).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('advertencia incluye los campos disponibles cuando no hay cantidad', () => {
    const r = reconstructInventory(['A', 'B', 'C'], rows([]));
    expect(r.warnings[0]).toContain('A');
    expect(r.warnings[0]).toContain('B');
    expect(r.warnings[0]).toContain('C');
  });
});

// ─── Reconstrucción de ítems ──────────────────────────────────────────────────

describe('reconstrucción de ítems', () => {
  it('CSV simple: id, nombre, cantidad', () => {
    const data = rows([
      { id: '1', nombre: 'Quetzal', cantidad: '12' },
      { id: '2', nombre: 'Obsidiana', cantidad: '5' },
    ]);
    const r = reconstructInventory(['id', 'nombre', 'cantidad'], data);
    expect(r.operacionDetectada).toBe(true);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ id: '1', nombre: 'Quetzal', cantidad: 12, source: 'recuperado' });
    expect(r.items[1]).toMatchObject({ id: '2', nombre: 'Obsidiana', cantidad: 5, source: 'recuperado' });
  });

  it('totalActivos es la suma correcta de registros activos', () => {
    const data = rows([
      { id: '1', cantidad: '10' },
      { id: '2', cantidad: '20' },
      { id: '3', cantidad: '5' },
    ]);
    const r = reconstructInventory(['id', 'cantidad'], data);
    expect(r.totalActivos).toBe(35);
    expect(r.totalBorrados).toBe(0);
  });

  it('registros borrados (DBF) → source: recuperado_borrado y totalBorrados correcto', () => {
    const data = rows(
      [{ id: '1', cantidad: '10' }, { id: '2', cantidad: '8' }, { id: '3', cantidad: '3' }],
      [1], // índice 1 borrado
    );
    const r = reconstructInventory(['id', 'cantidad'], data);
    expect(r.items[1].source).toBe('recuperado_borrado');
    expect(r.totalBorrados).toBe(8);
    expect(r.totalActivos).toBe(13);
  });

  it('cantidad no numérica → source: desconocido, no error', () => {
    const data = rows([
      { id: '1', cantidad: 'N/A' },
      { id: '2', cantidad: '' },
      { id: '3', cantidad: '0' },
    ]);
    const r = reconstructInventory(['id', 'cantidad'], data);
    expect(r.items[0].source).toBe('desconocido');
    expect(r.items[0].cantidad).toBeNull();
    expect(r.items[1].source).toBe('desconocido');
    expect(r.items[2].source).toBe('recuperado');
    expect(r.items[2].cantidad).toBe(0);
  });

  it('desconocidos cuenta correctamente', () => {
    const data = rows([
      { cantidad: 'x' },
      { cantidad: '' },
      { cantidad: '5' },
    ]);
    const r = reconstructInventory(['cantidad'], data);
    expect(r.desconocidos).toBe(2);
    expect(r.warnings.some(w => w.includes('2'))).toBe(true);
  });

  it('rowIndex refleja la posición original', () => {
    const data = rows([{ cantidad: '1' }, { cantidad: '2' }, { cantidad: '3' }]);
    const r = reconstructInventory(['cantidad'], data);
    expect(r.items.map(i => i.rowIndex)).toEqual([0, 1, 2]);
  });

  it('sin campo id: usa posición como id fallback', () => {
    const data = rows([{ cantidad: '10' }, { cantidad: '20' }]);
    const r = reconstructInventory(['cantidad'], data);
    expect(r.items[0].id).toBe('1');
    expect(r.items[1].id).toBe('2');
  });

  it('cantidad con coma decimal se parsea correctamente', () => {
    const data = rows([{ id: '1', cantidad: '3,5' }]);
    const r = reconstructInventory(['id', 'cantidad'], data);
    expect(r.items[0].cantidad).toBe(3.5);
  });

  it('0 registros → items vacío y totales 0', () => {
    const r = reconstructInventory(['id', 'cantidad'], []);
    expect(r.items).toHaveLength(0);
    expect(r.totalActivos).toBe(0);
    expect(r.totalBorrados).toBe(0);
    expect(r.desconocidos).toBe(0);
  });
});

// ─── Invariantes ─────────────────────────────────────────────────────────────

describe('invariantes', () => {
  it('totalActivos + totalBorrados = suma de cantidades parseables', () => {
    const data = rows(
      [
        { cantidad: '10' },
        { cantidad: '5' },
        { cantidad: 'X' },  // desconocido, no suma
        { cantidad: '3' },
      ],
      [3], // índice 3 borrado
    );
    const r = reconstructInventory(['cantidad'], data);
    expect(r.totalActivos + r.totalBorrados).toBe(18); // 10 + 5 + 3
    expect(r.desconocidos).toBe(1);
  });

  it('función pura: misma entrada → mismo resultado', () => {
    const headers = ['id', 'cantidad'];
    const data = rows([{ id: '1', cantidad: '42' }]);
    const r1 = reconstructInventory(headers, data);
    const r2 = reconstructInventory(headers, data);
    expect(r1).toEqual(r2);
  });

  it('no imputa valores: totalActivos no puede superar suma real', () => {
    const data = rows([{ id: '1', cantidad: '100' }]);
    const r = reconstructInventory(['id', 'cantidad'], data);
    expect(r.totalActivos).toBeLessThanOrEqual(100);
  });
});

// ─── Fixture del proyecto ─────────────────────────────────────────────────────

describe('fixture ejemplo.csv', () => {
  it('detecta campos del fixture existente del proyecto', () => {
    // fixtures/ejemplo.csv: id,nombre,cantidad / 1,Quetzal,12 / 2,Obsidiana,5
    const headers = ['id', 'nombre', 'cantidad'];
    const data = rows([
      { id: '1', nombre: 'Quetzal', cantidad: '12' },
      { id: '2', nombre: 'Obsidiana', cantidad: '5' },
    ]);
    const r = reconstructInventory(headers, data);
    expect(r.operacionDetectada).toBe(true);
    expect(r.totalActivos).toBe(17);
    expect(r.items[0]).toMatchObject({ id: '1', nombre: 'Quetzal', cantidad: 12 });
    expect(r.items[1]).toMatchObject({ id: '2', nombre: 'Obsidiana', cantidad: 5 });
  });
});
