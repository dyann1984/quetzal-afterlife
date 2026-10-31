/**
 * lib/project.test.ts — Pruebas del módulo de persistencia de proyectos
 * Quetzal Afterlife · The Digital Resurrection Engine
 */

import { describe, it, expect } from 'vitest';
import {
  createProject,
  addEvidence,
  addVerification,
  upsertProject,
  deleteProject,
  emptyStore,
  serializeStore,
  deserializeStore,
  STORE_VERSION,
} from './project';

const NOW = '2026-10-30T00:00:00.000Z';

// ─── Creación de proyectos ────────────────────────────────────────────────────

describe('createProject', () => {
  it('crea un proyecto con nombre y timestamps', () => {
    const p = createProject('Test', false, NOW);
    expect(p.name).toBe('Test');
    expect(p.createdAt).toBe(NOW);
    expect(p.updatedAt).toBe(NOW);
    expect(p.isDemo).toBe(false);
    expect(p.evidences).toHaveLength(0);
    expect(p.verifications).toHaveLength(0);
    expect(typeof p.id).toBe('string');
    expect(p.id.length).toBeGreaterThan(0);
  });

  it('recorta espacios del nombre', () => {
    const p = createProject('  Hola  ', false, NOW);
    expect(p.name).toBe('Hola');
  });

  it('nombre vacío usa fallback', () => {
    const p = createProject('', false, NOW);
    expect(p.name).toBe('Proyecto sin nombre');
  });

  it('isDemo=true se preserva', () => {
    const p = createProject('Demo', true, NOW);
    expect(p.isDemo).toBe(true);
  });

  it('dos proyectos tienen IDs distintos', () => {
    const p1 = createProject('A', false, NOW);
    const p2 = createProject('B', false, NOW);
    expect(p1.id).not.toBe(p2.id);
  });
});

// ─── Añadir evidencia ─────────────────────────────────────────────────────────

describe('addEvidence', () => {
  it('añade evidencia y actualiza updatedAt', () => {
    const p = createProject('P', false, NOW);
    const updated = addEvidence(p, {
      filename: 'test.csv', type: 'csv', importedAt: NOW,
    }, NOW);
    expect(updated.evidences).toHaveLength(1);
    expect(updated.evidences[0].filename).toBe('test.csv');
    expect(updated.evidences[0].id).toBeTruthy();
    expect(updated.updatedAt).toBe(NOW);
  });

  it('no muta el proyecto original', () => {
    const p = createProject('P', false, NOW);
    addEvidence(p, { filename: 'a.csv', type: 'csv', importedAt: NOW }, NOW);
    expect(p.evidences).toHaveLength(0);
  });

  it('múltiples evidencias tienen IDs distintos', () => {
    let p = createProject('P', false, NOW);
    p = addEvidence(p, { filename: 'a.csv', type: 'csv', importedAt: NOW }, NOW);
    p = addEvidence(p, { filename: 'b.csv', type: 'csv', importedAt: NOW }, NOW);
    expect(p.evidences[0].id).not.toBe(p.evidences[1].id);
  });
});

// ─── Añadir verificación ──────────────────────────────────────────────────────

describe('addVerification', () => {
  it('añade verificación al proyecto', () => {
    let p = createProject('P', false, NOW);
    p = addEvidence(p, { filename: 'a.csv', type: 'csv', importedAt: NOW }, NOW);
    p = addEvidence(p, { filename: 'b.csv', type: 'csv', importedAt: NOW }, NOW);
    const [eA, eB] = p.evidences;
    const updated = addVerification(p, {
      executedAt: NOW,
      principalEvidenceId: eA.id,
      referenceEvidenceId: eB.id,
      result: {} as never,
    }, NOW);
    expect(updated.verifications).toHaveLength(1);
    expect(updated.verifications[0].principalEvidenceId).toBe(eA.id);
  });
});

// ─── Store ────────────────────────────────────────────────────────────────────

describe('store', () => {
  it('emptyStore tiene versión correcta y proyectos vacíos', () => {
    const s = emptyStore();
    expect(s.version).toBe(STORE_VERSION);
    expect(s.projects).toHaveLength(0);
  });

  it('upsertProject añade proyecto nuevo', () => {
    const s = emptyStore();
    const p = createProject('A', false, NOW);
    const s2 = upsertProject(s, p);
    expect(s2.projects).toHaveLength(1);
    expect(s2.projects[0].id).toBe(p.id);
  });

  it('upsertProject reemplaza proyecto existente', () => {
    let s = emptyStore();
    const p = createProject('A', false, NOW);
    s = upsertProject(s, p);
    const p2 = { ...p, name: 'A modificado' };
    s = upsertProject(s, p2);
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].name).toBe('A modificado');
  });

  it('deleteProject elimina por id', () => {
    let s = emptyStore();
    const p1 = createProject('A', false, NOW);
    const p2 = createProject('B', false, NOW);
    s = upsertProject(s, p1);
    s = upsertProject(s, p2);
    s = deleteProject(s, p1.id);
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].id).toBe(p2.id);
  });

  it('no muta el store original', () => {
    const s = emptyStore();
    const p = createProject('A', false, NOW);
    upsertProject(s, p);
    expect(s.projects).toHaveLength(0);
  });
});

// ─── Serialización ────────────────────────────────────────────────────────────

describe('serialización', () => {
  it('serialize → deserialize produce el mismo store', () => {
    let s = emptyStore();
    s = upsertProject(s, createProject('Test', false, NOW));
    const json = serializeStore(s);
    const s2 = deserializeStore(json);
    expect(s2).toEqual(s);
  });

  it('deserializeStore rechaza JSON inválido', () => {
    expect(() => deserializeStore('not json')).toThrow();
  });

  it('deserializeStore rechaza formato desconocido (sin version)', () => {
    expect(() => deserializeStore('{"projects":[]}')).toThrow();
  });

  it('deserializeStore rechaza versión incompatible', () => {
    expect(() => deserializeStore('{"version":99,"projects":[]}')).toThrow();
  });

  it('deserializeStore rechaza si projects no es array', () => {
    expect(() => deserializeStore('{"version":1,"projects":"no"}')).toThrow();
  });
});

// ─── Demo ─────────────────────────────────────────────────────────────────────

describe('demo project', () => {
  it('buildDemoProject produce un proyecto isDemo=true con 2 evidencias y 1 verificación', async () => {
    const { buildDemoProject } = await import('./demo');
    const p = buildDemoProject();
    expect(p.isDemo).toBe(true);
    expect(p.evidences).toHaveLength(2);
    expect(p.verifications).toHaveLength(1);
  });

  it('demo inventory A detecta operación con totales correctos', async () => {
    const { DEMO_INV_A } = await import('./demo');
    expect(DEMO_INV_A.operacionDetectada).toBe(true);
    // Activos: Q-001=12, Q-002=5, Q-005=3, Q-006=7 → 27 (Q-004=N/A, Q-003 borrado=8)
    expect(DEMO_INV_A.totalActivos).toBe(27);
    expect(DEMO_INV_A.totalBorrados).toBe(8);
    expect(DEMO_INV_A.desconocidos).toBe(1);
  });

  it('demo verification tiene discrepancias conocidas', async () => {
    const { DEMO_VERIFICATION } = await import('./demo');
    // Q-002: 5 vs 6 → discrepancia
    // Q-006: 7 vs 9 → discrepancia
    // Q-007: solo en referencia
    // Q-004: solo en principal (cantidad N/A → no_comparable)
    expect(DEMO_VERIFICATION.summary.discrepancias).toBeGreaterThanOrEqual(2);
    expect(DEMO_VERIFICATION.summary.soloReferencia).toBeGreaterThanOrEqual(1);
  });
});
