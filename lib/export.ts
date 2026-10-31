/**
 * lib/export.ts — Exportación de resultados
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Funciones puras: producen texto (JSON o CSV) a partir de resultados ya
 * calculados. La descarga en el navegador se hace desde la UI.
 *
 * Cada exportación incluye trazabilidad (fila de origen, clasificación de la
 * fuente, campo y confianza de la detección) y un aviso cuando los datos son
 * sintéticos o los roles de campo fueron inferidos por heurística.
 */

import type { InventoryResult } from './inventory';
import type { VerificationResult } from './verification';

export interface ExportContext {
  filename: string;
  synthetic: boolean;
  generatedAt: string;
}

export const EXPORT_DISCLAIMER =
  'Los valores clasificados como "recuperado" o "recuperado_borrado" provienen del archivo indicado, ' +
  'en la fila indicada. La asignación de campos (id, cantidad, nombre) es una detección heurística ' +
  'con el nivel de confianza informado; no es un hecho confirmado salvo verificación independiente.';

/** Campos cuyo rol fue inferido sin confianza alta. */
export function inferredFields(inv: InventoryResult): string[] {
  return inv.fieldMatches.filter(m => m.confidence !== 'alto').map(m => `${m.fieldName} (${m.role}, ${m.confidence})`);
}

/** Escapa una celda CSV y neutraliza inyección de fórmulas en hojas de cálculo. */
export function csvCell(value: string | number | null): string {
  let s = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells: Array<string | number | null>): string {
  return cells.map(csvCell).join(',');
}

export function exportInventoryJson(inv: InventoryResult, ctx: ExportContext): string {
  return JSON.stringify({
    tipo: 'inventario-reconstruido',
    sintetico: ctx.synthetic,
    archivoOrigen: ctx.filename,
    generadoEn: ctx.generatedAt,
    aviso: EXPORT_DISCLAIMER,
    camposInferidos: inferredFields(inv),
    fieldMatches: inv.fieldMatches,
    totales: { activos: inv.totalActivos, borrados: inv.totalBorrados, desconocidos: inv.desconocidos },
    items: inv.items.map(i => ({ ...i, filaOrigen: i.rowIndex + 1, archivoOrigen: ctx.filename })),
    advertencias: inv.warnings,
  }, null, 2);
}

export function exportInventoryCsv(inv: InventoryResult, ctx: ExportContext): string {
  const lines = [csvLine(['archivo_origen', 'fila_origen', 'id', 'nombre', 'cantidad', 'fuente', 'sintetico'])];
  for (const i of inv.items) {
    lines.push(csvLine([ctx.filename, i.rowIndex + 1, i.id, i.nombre, i.cantidad, i.source, ctx.synthetic ? 'si' : 'no']));
  }
  return lines.join('\n') + '\n';
}

export function exportVerificationJson(v: VerificationResult, ctx: ExportContext): string {
  return JSON.stringify({
    tipo: 'verificacion',
    sintetico: ctx.synthetic,
    generadoEn: ctx.generatedAt,
    aviso: EXPORT_DISCLAIMER,
    ...v,
  }, null, 2);
}

export function exportVerificationCsv(v: VerificationResult, ctx: ExportContext): string {
  const lines = [csvLine(['fuente_principal', 'fuente_referencia', 'id', 'nombre', 'cantidad_principal', 'cantidad_referencia', 'diferencia', 'estado', 'sintetico'])];
  for (const e of v.entries) {
    lines.push(csvLine([v.fuentePrincipal, v.fuenteReferencia, e.id, e.nombre, e.cantidadPrincipal, e.cantidadReferencia, e.diferencia, e.status, ctx.synthetic ? 'si' : 'no']));
  }
  return lines.join('\n') + '\n';
}
