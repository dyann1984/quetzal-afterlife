/**
 * lib/demo.ts — Datos sintéticos de demostración
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Todos los datos de este módulo son SINTÉTICOS y se presentan explícitamente
 * como tal en la UI. No representan ningún sistema real.
 *
 * Propósito: demostrar el recorrido completo
 *   importar → reconstruir → verificar → guardar → reabrir
 * en Kiroween 2026 sin necesidad de archivos externos.
 */

import { reconstructInventory } from './inventory';
import { verifyInventory } from './verification';
import { createProject, addEvidence, addVerification } from './project';
import type { CsvResult } from './csv';
import type { Project } from './project';

// ─── Datos sintéticos ─────────────────────────────────────────────────────────

/**
 * Inventario principal: archivo CSV sintético del "sistema heredado A".
 * Incluye un registro borrado (simulado) y uno con cantidad desconocida.
 */
const DEMO_HEADERS_A = ['id', 'nombre', 'cantidad'];
const DEMO_ROWS_A: Array<{ values: Record<string,string>; deleted: boolean }> = [
  { values: { id: 'Q-001', nombre: 'Quetzal verde', cantidad: '12' },   deleted: false },
  { values: { id: 'Q-002', nombre: 'Obsidiana negra', cantidad: '5' },  deleted: false },
  { values: { id: 'Q-003', nombre: 'Jade esculpido', cantidad: '8' },   deleted: true  }, // borrado
  { values: { id: 'Q-004', nombre: 'Turquesa maya', cantidad: 'N/A' },  deleted: false }, // desconocido
  { values: { id: 'Q-005', nombre: 'Ámbar chiapaneco', cantidad: '3' }, deleted: false },
  { values: { id: 'Q-006', nombre: 'Obsidiana dorada', cantidad: '7' }, deleted: false },
];

/**
 * Referencia independiente: archivo CSV sintético del "sistema heredado B".
 * Mismos artículos con algunas discrepancias intencionales.
 */
const DEMO_HEADERS_B = ['id', 'nombre', 'cantidad'];
const DEMO_ROWS_B: Array<{ values: Record<string,string>; deleted: boolean }> = [
  { values: { id: 'Q-001', nombre: 'Quetzal verde', cantidad: '12' },   deleted: false }, // coincide
  { values: { id: 'Q-002', nombre: 'Obsidiana negra', cantidad: '6' },  deleted: false }, // discrepancia: 5 vs 6
  { values: { id: 'Q-003', nombre: 'Jade esculpido', cantidad: '8' },   deleted: false }, // en ref activo (era borrado en A)
  { values: { id: 'Q-005', nombre: 'Ámbar chiapaneco', cantidad: '3' }, deleted: false }, // coincide
  { values: { id: 'Q-006', nombre: 'Obsidiana dorada', cantidad: '9' }, deleted: false }, // discrepancia: 7 vs 9
  { values: { id: 'Q-007', nombre: 'Malaquita verde', cantidad: '2' },  deleted: false }, // solo en referencia
];

// ─── CsvResult sintéticos (para mostrar en "Evidencia recuperada") ────────────

export const DEMO_CSV_A: CsvResult = {
  headers: DEMO_HEADERS_A,
  rows: DEMO_ROWS_A.map(r => DEMO_HEADERS_A.map(h => r.values[h] ?? '')),
  warnings: [],
};

export const DEMO_CSV_B: CsvResult = {
  headers: DEMO_HEADERS_B,
  rows: DEMO_ROWS_B.map(r => DEMO_HEADERS_B.map(h => r.values[h] ?? '')),
  warnings: [],
};

// ─── Reconstrucciones ─────────────────────────────────────────────────────────

export const DEMO_INV_A = reconstructInventory(DEMO_HEADERS_A, DEMO_ROWS_A);
export const DEMO_INV_B = reconstructInventory(DEMO_HEADERS_B, DEMO_ROWS_B);

// ─── Verificación cruzada ─────────────────────────────────────────────────────

export const DEMO_VERIFICATION = verifyInventory(
  DEMO_INV_A,
  DEMO_INV_B,
  'sistema-A-demo.csv (sintético)',
  'sistema-B-demo.csv (sintético)',
  '2026-10-30T12:00:00.000Z',
);

// ─── Proyecto de demostración completo ───────────────────────────────────────

export function buildDemoProject(): Project {
  const NOW = '2026-10-30T12:00:00.000Z';

  let p = createProject('Demo Kiroween 2026 — Inventario Quetzal', true, NOW);

  p = addEvidence(p, {
    filename: 'sistema-A-demo.csv',
    type: 'csv',
    importedAt: NOW,
    csvResult: DEMO_CSV_A,
    inventoryResult: DEMO_INV_A,
  }, NOW);

  p = addEvidence(p, {
    filename: 'sistema-B-demo.csv',
    type: 'csv',
    importedAt: NOW,
    csvResult: DEMO_CSV_B,
    inventoryResult: DEMO_INV_B,
  }, NOW);

  const evidAId = p.evidences[0].id;
  const evidBId = p.evidences[1].id;

  p = addVerification(p, {
    executedAt: NOW,
    principalEvidenceId: evidAId,
    referenceEvidenceId: evidBId,
    result: DEMO_VERIFICATION,
  }, NOW);

  return p;
}
