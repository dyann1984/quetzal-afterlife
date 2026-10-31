/**
 * lib/verification.ts — Verificación de inventario reconstruido
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Compara un InventoryResult (recuperado de un archivo) contra una referencia
 * independiente (una segunda fuente de datos, también parseada y reconstruida).
 *
 * Principio: ningún resultado se presenta como "verificado" a menos que exista
 * una referencia independiente que lo confirme. Esta función produce la evidencia
 * de esa comparación.
 *
 * Función pura — sin I/O, sin acceso a red ni DOM.
 */

import type { InventoryResult, InventoryItem } from './inventory';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type VerificationStatus =
  | 'verificado'        // coincide con la referencia
  | 'discrepancia'      // la referencia tiene un valor diferente
  | 'solo_principal'    // existe en la fuente principal, no en la referencia
  | 'solo_referencia'   // existe en la referencia, no en la fuente principal
  | 'no_comparable';    // una o ambas cantidades son null

export interface VerificationEntry {
  id: string;
  nombre: string;
  cantidadPrincipal: number | null;
  cantidadReferencia: number | null;
  diferencia: number | null;        // principal - referencia (null si no comparable)
  status: VerificationStatus;
  rowIndexPrincipal?: number;
  rowIndexReferencia?: number;
}

export interface VerificationSummary {
  verificados: number;
  discrepancias: number;
  soloPrincipal: number;
  soloReferencia: number;
  noComparables: number;
  totalEntradas: number;
  porcentajeCoincidencia: number;   // verificados / (verificados + discrepancias) * 100
  diferenciaTotal: number;          // suma algebraica de diferencias comparables
}

export interface VerificationResult {
  ejecutadaEn: string;              // ISO timestamp, fijado por quien llama (no Date.now())
  fuentePrincipal: string;          // nombre del archivo / fuente
  fuenteReferencia: string;
  entries: VerificationEntry[];
  summary: VerificationSummary;
  warnings: string[];
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Verifica `principal` contra `referencia`.
 * Ambas deben provenir de fuentes independientes para que la verificación sea válida.
 *
 * @param principal    InventoryResult de la fuente a verificar
 * @param reference    InventoryResult de la referencia independiente
 * @param sourceName   nombre de la fuente principal (para metadatos)
 * @param refName      nombre de la referencia (para metadatos)
 * @param timestamp    ISO 8601 string — el llamador fija el tiempo (función pura)
 */
export function verifyInventory(
  principal: InventoryResult,
  reference: InventoryResult,
  sourceName: string,
  refName: string,
  timestamp: string,
): VerificationResult {
  const warnings: string[] = [];

  // Indexar referencia por id (normalizado)
  const refMap = new Map<string, InventoryItem>();
  for (const item of reference.items) {
    const key = normalizeId(item.id);
    if (refMap.has(key)) {
      warnings.push(`Referencia: id duplicado "${item.id}" — se usa la primera aparición.`);
    } else {
      refMap.set(key, item);
    }
  }

  // Indexar principal por id
  const mainMap = new Map<string, InventoryItem>();
  for (const item of principal.items) {
    const key = normalizeId(item.id);
    if (mainMap.has(key)) {
      warnings.push(`Principal: id duplicado "${item.id}" — se usa la primera aparición.`);
    } else {
      mainMap.set(key, item);
    }
  }

  const entries: VerificationEntry[] = [];
  const processedRefKeys = new Set<string>();

  // Comparar todos los ítems de principal contra referencia
  for (const [key, mainItem] of mainMap) {
    const refItem = refMap.get(key);
    processedRefKeys.add(key);

    if (!refItem) {
      entries.push({
        id: mainItem.id,
        nombre: mainItem.nombre,
        cantidadPrincipal: mainItem.cantidad,
        cantidadReferencia: null,
        diferencia: null,
        status: 'solo_principal',
        rowIndexPrincipal: mainItem.rowIndex,
      });
      continue;
    }

    const qMain = mainItem.cantidad;
    const qRef  = refItem.cantidad;

    if (qMain === null || qRef === null) {
      entries.push({
        id: mainItem.id,
        nombre: mainItem.nombre,
        cantidadPrincipal: qMain,
        cantidadReferencia: qRef,
        diferencia: null,
        status: 'no_comparable',
        rowIndexPrincipal: mainItem.rowIndex,
        rowIndexReferencia: refItem.rowIndex,
      });
      continue;
    }

    const diff = qMain - qRef;
    entries.push({
      id: mainItem.id,
      nombre: mainItem.nombre,
      cantidadPrincipal: qMain,
      cantidadReferencia: qRef,
      diferencia: diff,
      status: diff === 0 ? 'verificado' : 'discrepancia',
      rowIndexPrincipal: mainItem.rowIndex,
      rowIndexReferencia: refItem.rowIndex,
    });
  }

  // Ítems solo en referencia
  for (const [key, refItem] of refMap) {
    if (!processedRefKeys.has(key)) {
      entries.push({
        id: refItem.id,
        nombre: refItem.nombre,
        cantidadPrincipal: null,
        cantidadReferencia: refItem.cantidad,
        diferencia: null,
        status: 'solo_referencia',
        rowIndexReferencia: refItem.rowIndex,
      });
    }
  }

  // Calcular resumen
  let verificados = 0, discrepancias = 0, soloPrincipal = 0,
      soloReferencia = 0, noComparables = 0, diferenciaTotal = 0;

  for (const e of entries) {
    switch (e.status) {
      case 'verificado':      verificados++;     break;
      case 'discrepancia':    discrepancias++;   diferenciaTotal += e.diferencia ?? 0; break;
      case 'solo_principal':  soloPrincipal++;   break;
      case 'solo_referencia': soloReferencia++;  break;
      case 'no_comparable':   noComparables++;   break;
    }
  }

  const comparable = verificados + discrepancias;
  const porcentajeCoincidencia = comparable > 0
    ? Math.round((verificados / comparable) * 10000) / 100
    : 0;

  const summary: VerificationSummary = {
    verificados,
    discrepancias,
    soloPrincipal,
    soloReferencia,
    noComparables,
    totalEntradas: entries.length,
    porcentajeCoincidencia,
    diferenciaTotal,
  };

  if (discrepancias > 0) {
    warnings.push(
      `${discrepancias} discrepancia${discrepancias > 1 ? 's' : ''} encontrada${discrepancias > 1 ? 's' : ''}. ` +
      `Diferencia total: ${diferenciaTotal > 0 ? '+' : ''}${diferenciaTotal} unidades.`,
    );
  }
  if (soloPrincipal > 0) {
    warnings.push(`${soloPrincipal} ítem${soloPrincipal > 1 ? 's' : ''} presentes en la fuente principal pero no en la referencia.`);
  }
  if (soloReferencia > 0) {
    warnings.push(`${soloReferencia} ítem${soloReferencia > 1 ? 's' : ''} presentes en la referencia pero no en la fuente principal.`);
  }

  return {
    ejecutadaEn: timestamp,
    fuentePrincipal: sourceName,
    fuenteReferencia: refName,
    entries,
    summary,
    warnings,
  };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}
