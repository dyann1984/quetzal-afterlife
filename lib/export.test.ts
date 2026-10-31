import { describe, it, expect } from 'vitest';
import { reconstructInventory } from './inventory';
import { verifyInventory } from './verification';
import {
  csvCell, exportInventoryCsv, exportInventoryJson, exportVerificationCsv, exportVerificationJson, inferredFields,
} from './export';

const ctx = { filename: 'a.csv', synthetic: true, generatedAt: '2026-10-31T00:00:00.000Z' };
const inv = reconstructInventory(['id', 'nombre', 'cantidad'], [
  { values: { id: 'A-1', nombre: 'Tornillo, grande', cantidad: '10' } },
  { values: { id: 'A-2', nombre: 'Tuerca', cantidad: '5' }, deleted: true },
  { values: { id: 'A-3', nombre: '=HYPERLINK("x")', cantidad: 'N/A' } },
]);

describe('csvCell', () => {
  it('escapa comas y comillas', () => expect(csvCell('a,"b"')).toBe('"a,""b"""'));
  it('neutraliza fórmulas', () => expect(csvCell('=1+1')).toBe("'=1+1"));
  it('conserva negativos numéricos', () => expect(csvCell(-3)).toBe('-3'));
  it('null es vacío', () => expect(csvCell(null)).toBe(''));
});

describe('exportInventory', () => {
  it('CSV incluye fila de origen, fuente y marca sintética', () => {
    const lines = exportInventoryCsv(inv, ctx).trim().split('\n');
    expect(lines[0]).toContain('fila_origen');
    expect(lines[1]).toBe('a.csv,1,A-1,"Tornillo, grande",10,recuperado,si');
    expect(lines[2]).toContain('recuperado_borrado');
    expect(lines[3]).toContain('desconocido');
    expect(lines[3]).toContain("'=HYPERLINK");
  });
  it('JSON conserva trazabilidad y aviso', () => {
    const j = JSON.parse(exportInventoryJson(inv, ctx));
    expect(j.sintetico).toBe(true);
    expect(j.aviso).toMatch(/heurística/);
    expect(j.items[1].filaOrigen).toBe(2);
    expect(j.totales).toEqual({ activos: 10, borrados: 5, desconocidos: 1 });
  });
  it('sin campos inferidos cuando todo es de confianza alta', () => {
    expect(inferredFields(inv)).toEqual([]);
  });
  it('lista campos de confianza no alta', () => {
    const fake = { ...inv, fieldMatches: [{ fieldName: 'x', role: 'cantidad' as const, confidence: 'bajo' as const }] };
    expect(inferredFields(fake)).toEqual(['x (cantidad, bajo)']);
  });
});

describe('exportVerification', () => {
  const b = reconstructInventory(['id', 'nombre', 'cantidad'], [{ values: { id: 'A-1', nombre: 'Tornillo', cantidad: '9' } }]);
  const v = verifyInventory(inv, b, 'a.csv', 'b.csv', ctx.generatedAt);
  it('CSV y JSON reflejan las entradas', () => {
    const lines = exportVerificationCsv(v, ctx).trim().split('\n');
    expect(lines.length).toBe(v.entries.length + 1);
    expect(lines.some(l => l.includes('discrepancia'))).toBe(true);
    expect(JSON.parse(exportVerificationJson(v, ctx)).tipo).toBe('verificacion');
  });
});
