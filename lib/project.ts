/**
 * lib/project.ts — Persistencia local de proyectos
 * Quetzal Afterlife · The Digital Resurrection Engine
 *
 * Guarda y recupera proyectos de recuperación en localStorage del navegador.
 * No almacena credenciales, claves ni datos de usuario identificables.
 * El contenido es únicamente el resultado del análisis de archivos cargados
 * por el propio usuario en su navegador.
 *
 * Diseño:
 *  - Cada proyecto tiene un id único (generado con crypto.randomUUID o fallback).
 *  - El storage key es 'quetzal_projects'.
 *  - El tamaño máximo del store es 5 MB de JSON serializado.
 *  - No hay llamadas de red ni persistencia en servidor.
 *
 * Módulo isomórfico: las funciones de serialización/deserialización son puras
 * y testeables sin DOM. Las funciones de lectura/escritura de localStorage
 * están aisladas en ProjectStorage y solo se llaman desde la UI.
 */

import type { CsvResult } from './csv';
import type { DbfResult } from './dbf';
import type { InventoryResult } from './inventory';
import type { VerificationResult } from './verification';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type EvidenceType = 'csv' | 'dbf';

export interface ProjectEvidence {
  id: string;
  filename: string;
  type: EvidenceType;
  importedAt: string;            // ISO timestamp
  csvResult?: CsvResult;
  dbfResult?: DbfResult;
  inventoryResult?: InventoryResult;
}

export interface ProjectVerification {
  id: string;
  executedAt: string;
  principalEvidenceId: string;
  referenceEvidenceId: string;
  result: VerificationResult;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;               // true = datos sintéticos de ejemplo
  evidences: ProjectEvidence[];
  verifications: ProjectVerification[];
}

export interface ProjectStore {
  version: 1;
  projects: Project[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'quetzal_projects';
export const BACKUP_KEY = 'quetzal_projects_corrupt_backup';
const MAX_STORE_BYTES = 5 * 1024 * 1024; // 5 MB
export const STORE_VERSION = 1 as const;

// ─── Funciones puras (testeables sin DOM) ─────────────────────────────────────

/** Genera un id único. Usa crypto.randomUUID si está disponible, si no un fallback. */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback deterministico-suficiente para tests sin crypto
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Valida y deserializa un ProjectStore desde JSON. Lanza si el formato es inválido. */
export function deserializeStore(json: string): ProjectStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El almacén de proyectos contiene JSON inválido.');
  }
  if (
    typeof parsed !== 'object' || parsed === null ||
    !('version' in parsed) || !('projects' in parsed) ||
    (parsed as Record<string, unknown>).version !== 1 ||
    !Array.isArray((parsed as Record<string, unknown>).projects)
  ) {
    throw new Error('Formato de almacén desconocido o versión incompatible.');
  }
  return parsed as ProjectStore;
}

/** Serializa un ProjectStore a JSON. */
export function serializeStore(store: ProjectStore): string {
  return JSON.stringify(store);
}

/** Crea un ProjectStore vacío. */
export function emptyStore(): ProjectStore {
  return { version: STORE_VERSION, projects: [] };
}

/** Crea un proyecto nuevo con valores por defecto. */
export function createProject(name: string, isDemo = false, now = new Date().toISOString()): Project {
  return {
    id: generateId(),
    name: name.trim() || 'Proyecto sin nombre',
    createdAt: now,
    updatedAt: now,
    isDemo,
    evidences: [],
    verifications: [],
  };
}

/** Añade evidencia a un proyecto. Devuelve un nuevo Project (inmutable). */
export function addEvidence(project: Project, evidence: Omit<ProjectEvidence, 'id'>, now = new Date().toISOString()): Project {
  return {
    ...project,
    updatedAt: now,
    evidences: [...project.evidences, { ...evidence, id: generateId() }],
  };
}

/** Añade una verificación a un proyecto. Devuelve un nuevo Project (inmutable). */
export function addVerification(project: Project, verification: Omit<ProjectVerification, 'id'>, now = new Date().toISOString()): Project {
  return {
    ...project,
    updatedAt: now,
    verifications: [...project.verifications, { ...verification, id: generateId() }],
  };
}

/** Reemplaza un proyecto en el store por id. Devuelve un nuevo store. */
export function upsertProject(store: ProjectStore, project: Project): ProjectStore {
  const existing = store.projects.findIndex(p => p.id === project.id);
  if (existing === -1) {
    return { ...store, projects: [...store.projects, project] };
  }
  const projects = [...store.projects];
  projects[existing] = project;
  return { ...store, projects };
}

/** Elimina un proyecto del store por id. Devuelve un nuevo store. */
export function deleteProject(store: ProjectStore, id: string): ProjectStore {
  return { ...store, projects: store.projects.filter(p => p.id !== id) };
}

// ─── Acceso a localStorage (solo desde UI, no testear directamente) ───────────

export const ProjectStorage = {
  /** Lee el store de localStorage. Si no existe o está corrupto, devuelve store vacío. */
  load(): ProjectStore {
    if (typeof localStorage === 'undefined') return emptyStore();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      return deserializeStore(raw);
    } catch {
      // Store corrupto — se conserva una copia de respaldo antes de que un guardado lo sobrescriba.
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && !localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw);
      } catch { /* sin espacio o sin acceso: se devuelve vacío igualmente */ }
      return emptyStore();
    }
  },

  /** Escribe el store en localStorage. Lanza si supera el límite de tamaño. */
  save(store: ProjectStore): void {
    if (typeof localStorage === 'undefined') return;
    const json = serializeStore(store);
    if (json.length > MAX_STORE_BYTES) {
      throw new Error(
        `El almacén de proyectos supera el límite de 5 MB (${(json.length / 1024 / 1024).toFixed(2)} MB). ` +
        `Elimina proyectos antiguos para continuar guardando.`,
      );
    }
    localStorage.setItem(STORAGE_KEY, json);
  },

  /** Elimina completamente el store de localStorage. */
  clear(): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
  },
};
