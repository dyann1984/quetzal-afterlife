/**
 * lib/verification.test.ts — Pruebas del módulo de verificación
 * Quetzal Afterlife · The Digital Resurrection Engine
 */

import { describe, it, expect } from 'vitest';
import { verifyInventory } from './verification';
import { reconstructInventory, type InventoryResult } from './inventory';

const TS = '2026-10-30T00:00:00.000Z';

function inv(data: Array<{ id: string; cantidad: string; deleted?: boolean }>): InventoryResult {
  const rows = data.map(d => ({
    values: { id: d.id, cantidad: d.cantidad },
    deleted: d.deleted ?? false,
  }));
  return reconstructInventory(['id', 'cantidad'], rows);
}

// ─── Comparación básica ───────────────────────────────────────────────────────

describe('verificación básica', () => {
  it('dos inventarios idénticos → summary.verificados === items.length', () => {
    const a = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '5' }]);
    const b = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.summary.verificados).toBe(2);
    expect(r.summary.discrepancias).toBe(0);
    expect(r.summary.porcentajeCoincidencia).toBe(100);
  });

  it('discrepancia en cantidad → status discrepancia y diferencia correcta', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([{ id: '1', cantidad: '7' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.summary.discrepancias).toBe(1);
    expect(r.entries[0].status).toBe('discrepancia');
    expect(r.entries[0].diferencia).toBe(3); // 10 - 7
  });

  it('ítem solo en principal → status solo_principal', () => {
    const a = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '5' }]);
    const b = inv([{ id: '1', cantidad: '10' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    const entry = r.entries.find(e => e.id === '2');
    expect(entry?.status).toBe('solo_principal');
    expect(entry?.cantidadReferencia).toBeNull();
  });

  it('ítem solo en referencia → status solo_referencia', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '3' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    const entry = r.entries.find(e => e.id === '2');
    expect(entry?.status).toBe('solo_referencia');
    expect(entry?.cantidadPrincipal).toBeNull();
  });

  it('cantidad null en principal → status no_comparable', () => {
    const a = inv([{ id: '1', cantidad: 'N/A' }]);
    const b = inv([{ id: '1', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.entries[0].status).toBe('no_comparable');
    expect(r.entries[0].diferencia).toBeNull();
  });

  it('inventarios vacíos → resultado vacío sin error', () => {
    const a = inv([]);
    const b = inv([]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.entries).toHaveLength(0);
    expect(r.summary.totalEntradas).toBe(0);
  });
});

// ─── Resumen ──────────────────────────────────────────────────────────────────

describe('summary', () => {
  it('porcentajeCoincidencia = 0 cuando todos son discrepancias', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([{ id: '1', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.summary.porcentajeCoincidencia).toBe(0);
  });

  it('porcentajeCoincidencia = 0 cuando no hay ítems comparables', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([{ id: '2', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.summary.porcentajeCoincidencia).toBe(0);
  });

  it('diferenciaTotal suma diferencias algebraicas', () => {
    const a = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '3' }]);
    const b = inv([{ id: '1', cantidad: '7' }, { id: '2', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    // (10-7) + (3-5) = 3 + (-2) = 1
    expect(r.summary.diferenciaTotal).toBe(1);
  });

  it('metadatos de fuente y timestamp preservados', () => {
    const a = inv([]);
    const b = inv([]);
    const r = verifyInventory(a, b, 'fuente-A', 'ref-B', TS);
    expect(r.fuentePrincipal).toBe('fuente-A');
    expect(r.fuenteReferencia).toBe('ref-B');
    expect(r.ejecutadaEn).toBe(TS);
  });
});

// ─── IDs case-insensitive y espacios ─────────────────────────────────────────

describe('normalización de IDs', () => {
  it('IDs con diferente capitalización se emparejan', () => {
    const a = inv([{ id: 'ABC-001', cantidad: '10' }]);
    const b = inv([{ id: 'abc-001', cantidad: '10' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.entries[0].status).toBe('verificado');
  });

  it('IDs con espacios extra se emparejan', () => {
    const a = inv([{ id: '  X1  ', cantidad: '5' }]);
    const b = inv([{ id: 'X1', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.entries[0].status).toBe('verificado');
  });
});

// ─── Advertencias ────────────────────────────────────────────────────────────

describe('advertencias', () => {
  it('discrepancias producen advertencia en warnings', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([{ id: '1', cantidad: '5' }]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.warnings.some(w => w.includes('discrepancia'))).toBe(true);
  });

  it('ítems solo en principal producen advertencia', () => {
    const a = inv([{ id: '1', cantidad: '10' }]);
    const b = inv([]);
    const r = verifyInventory(a, b, 'A', 'B', TS);
    expect(r.warnings.some(w => w.includes('principal'))).toBe(true);
  });
});

// ─── Función pura ─────────────────────────────────────────────────────────────

describe('invariante pureza', () => {
  it('misma entrada → mismo resultado', () => {
    const a = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '3' }]);
    const b = inv([{ id: '1', cantidad: '10' }, { id: '2', cantidad: '4' }]);
    const r1 = verifyInventory(a, b, 'A', 'B', TS);
    const r2 = verifyInventory(a, b, 'A', 'B', TS);
    expect(r1).toEqual(r2);
  });
});
