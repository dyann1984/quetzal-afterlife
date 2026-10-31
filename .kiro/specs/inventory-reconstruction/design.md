# Diseño técnico — Reconstrucción de Inventario

**Spec:** inventory-reconstruction  
**Fecha:** 2026-10-30

---

## Tipos públicos

```typescript
// lib/inventory.ts

export type ConfidenceLevel = 'alto' | 'medio' | 'bajo';
export type ItemSource = 'recuperado' | 'recuperado_borrado' | 'desconocido';

export interface FieldMatch {
  fieldName: string;
  role: 'id' | 'cantidad' | 'nombre';
  confidence: ConfidenceLevel;
}

export interface InventoryItem {
  rowIndex: number;          // 0-indexed desde los registros de origen
  id: string;
  nombre: string;
  cantidad: number | null;   // null = no parseable
  source: ItemSource;
}

export interface InventoryResult {
  operacionDetectada: boolean;
  fieldMatches: FieldMatch[];
  items: InventoryItem[];
  totalActivos: number;
  totalBorrados: number;
  desconocidos: number;
  warnings: string[];
}

export function reconstructInventory(
  headers: string[],
  rows: Array<{ values: Record<string,string>; deleted?: boolean }>,
): InventoryResult
```

## Algoritmo de detección de campos

```
ID_PATTERNS   = [id, codigo, sku, clave, referencia, code, key]
QTY_PATTERNS  = [cantidad, qty, stock, units, piezas, existencias, quantity, cant]
NAME_PATTERNS = [nombre, name, descripcion, description, producto, articulo, item]

Para cada campo:
  normalizar(nombre) = quitar acentos, lowercase, quitar guiones/espacios
  si normalizado ∈ EXACT_SET → confianza alto
  si normalizado contiene algún patrón → confianza medio
  si tipo N y no matcheó nada → candidato bajo para cantidad
```

## Función pura

`reconstructInventory` es stateless y testeable sin DOM ni red.
Acepta el formato normalizado que tanto `CsvResult` como `DbfResult` pueden proveer.
