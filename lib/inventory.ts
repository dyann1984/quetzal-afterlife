/**
 * lib/inventory.ts — Reconstrucción de inventario
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Función pura que opera sobre datos ya parseados (CSV o DBF).
 * No lee archivos, no accede a la red, no tiene efectos secundarios.
 *
 * Toda afirmación sobre los datos se clasifica como:
 *   recuperado        — valor presente en el archivo original (activo)
 *   recuperado_borrado — valor presente en registro marcado como borrado
 *   desconocido       — valor no parseable o campo no identificado
 *
 * No se imputa, extrapola ni inventa ningún valor.
 */

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type ConfidenceLevel = 'alto' | 'medio' | 'bajo';
export type ItemSource = 'recuperado' | 'recuperado_borrado' | 'desconocido';

export interface FieldMatch {
  fieldName: string;
  role: 'id' | 'cantidad' | 'nombre';
  confidence: ConfidenceLevel;
}

export interface InventoryItem {
  rowIndex: number;
  id: string;
  nombre: string;
  cantidad: number | null; // null = no parseable o desconocido
  source: ItemSource;
}

export interface InventoryResult {
  operacionDetectada: boolean;
  fieldMatches: FieldMatch[];
  items: InventoryItem[];
  totalActivos: number;     // suma de cantidad de registros activos parseables
  totalBorrados: number;    // suma de cantidad de registros borrados parseables
  desconocidos: number;     // recuento de ítems con cantidad: null
  warnings: string[];
}

// ─── Tablas de patrones ───────────────────────────────────────────────────────

/** Nombres exactos (normalizados) → rol */
const EXACT_ID: Set<string> = new Set([
  'id', 'codigo', 'sku', 'clave', 'referencia', 'code', 'key', 'ref',
  'codigoproducto', 'productcode', 'itemcode', 'itemid',
]);
const EXACT_QTY: Set<string> = new Set([
  'cantidad', 'qty', 'stock', 'units', 'piezas', 'existencias',
  'quantity', 'cant', 'existencia', 'saldo', 'disponible',
  'stockactual', 'currentstock', 'unidades',
]);
const EXACT_NAME: Set<string> = new Set([
  'nombre', 'name', 'descripcion', 'description', 'producto',
  'articulo', 'item', 'denominacion', 'detalle', 'concepto',
  'descripcion', 'nombreprod', 'productname',
]);

/** Subcadenas parciales → rol (confianza medio) */
const PARTIAL_ID = ['cod', 'sku', 'clave', 'ref', 'key', 'id'];
const PARTIAL_QTY = ['cant', 'qty', 'stock', 'unit', 'piez', 'exist', 'saldo', 'disp'];
const PARTIAL_NAME = ['nom', 'name', 'desc', 'prod', 'artic', 'item', 'denom'];

// ─── Normalización de nombres de campo ───────────────────────────────────────

/**
 * Elimina acentos, pasa a minúsculas y quita guiones/espacios/underscores.
 * "Código" → "codigo", "STOCK_ACTUAL" → "stockactual"
 */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar diacríticos
    .toLowerCase()
    .replace(/[\s_\-\.]/g, '');       // quitar separadores
}

// ─── Detección de campos ──────────────────────────────────────────────────────

function detectFields(headers: string[]): FieldMatch[] {
  const matches: FieldMatch[] = [];
  const usedRoles = new Set<'id' | 'cantidad' | 'nombre'>();

  for (const raw of headers) {
    const norm = normalize(raw);

    // Exacto primero
    if (!usedRoles.has('id') && EXACT_ID.has(norm)) {
      matches.push({ fieldName: raw, role: 'id', confidence: 'alto' });
      usedRoles.add('id');
      continue;
    }
    if (!usedRoles.has('cantidad') && EXACT_QTY.has(norm)) {
      matches.push({ fieldName: raw, role: 'cantidad', confidence: 'alto' });
      usedRoles.add('cantidad');
      continue;
    }
    if (!usedRoles.has('nombre') && EXACT_NAME.has(norm)) {
      matches.push({ fieldName: raw, role: 'nombre', confidence: 'alto' });
      usedRoles.add('nombre');
      continue;
    }

    // Parcial
    if (!usedRoles.has('id') && PARTIAL_ID.some(p => norm.includes(p))) {
      matches.push({ fieldName: raw, role: 'id', confidence: 'medio' });
      usedRoles.add('id');
      continue;
    }
    if (!usedRoles.has('cantidad') && PARTIAL_QTY.some(p => norm.includes(p))) {
      matches.push({ fieldName: raw, role: 'cantidad', confidence: 'medio' });
      usedRoles.add('cantidad');
      continue;
    }
    if (!usedRoles.has('nombre') && PARTIAL_NAME.some(p => norm.includes(p))) {
      matches.push({ fieldName: raw, role: 'nombre', confidence: 'medio' });
      usedRoles.add('nombre');
      continue;
    }
  }

  return matches;
}

// ─── Parseo de cantidad ───────────────────────────────────────────────────────

function parseQty(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  // Permitir punto o coma como separador decimal, ignorar separadores de miles
  const cleaned = raw.trim()
    .replace(/\./g, '')   // quitar puntos de miles
    .replace(',', '.');   // normalizar coma decimal
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n;
}

// ─── Función principal ────────────────────────────────────────────────────────

export interface InventoryRow {
  values: Record<string, string>;
  deleted?: boolean;
}

export function reconstructInventory(
  headers: string[],
  rows: InventoryRow[],
): InventoryResult {
  const warnings: string[] = [];
  const fieldMatches = detectFields(headers);

  const idField  = fieldMatches.find(m => m.role === 'id')?.fieldName;
  const qtyField = fieldMatches.find(m => m.role === 'cantidad')?.fieldName;
  const nameField = fieldMatches.find(m => m.role === 'nombre')?.fieldName;

  // Si no hay campo de cantidad, no hay operación de inventario detectable
  if (!qtyField) {
    warnings.push(
      `No se detectó ningún campo de cantidad. Campos disponibles: ${headers.join(', ')}.`,
    );
    return {
      operacionDetectada: false,
      fieldMatches,
      items: [],
      totalActivos: 0,
      totalBorrados: 0,
      desconocidos: 0,
      warnings,
    };
  }

  const items: InventoryItem[] = [];
  let totalActivos = 0;
  let totalBorrados = 0;
  let desconocidos = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rawQty  = row.values[qtyField] ?? '';
    const rawId   = idField   ? (row.values[idField]   ?? '') : String(i + 1);
    const rawName = nameField ? (row.values[nameField] ?? '') : '';

    const cantidad = parseQty(rawQty);
    const isDeleted = row.deleted === true;

    let source: ItemSource;
    if (cantidad === null) {
      source = 'desconocido';
      desconocidos++;
    } else if (isDeleted) {
      source = 'recuperado_borrado';
      totalBorrados += cantidad;
    } else {
      source = 'recuperado';
      totalActivos += cantidad;
    }

    items.push({
      rowIndex: i,
      id: rawId.trim() || String(i + 1),
      nombre: rawName.trim(),
      cantidad,
      source,
    });
  }

  if (desconocidos > 0) {
    warnings.push(
      `${desconocidos} registro${desconocidos > 1 ? 's' : ''} con cantidad no parseable ` +
      `(campo "${qtyField}"). Se clasifican como desconocidos.`,
    );
  }

  return {
    operacionDetectada: true,
    fieldMatches,
    items,
    totalActivos,
    totalBorrados,
    desconocidos,
    warnings,
  };
}
