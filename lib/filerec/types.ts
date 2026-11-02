import type { DamagedRange, FileFinding } from './core';

export type Integrity = 'integro' | 'parcial' | 'danado' | 'irrecuperable' | 'no-analizado';
export type Category = 'documento' | 'imagen' | 'audio' | 'video' | 'comprimido' | 'ejecutable' | 'base-de-datos' | 'texto' | 'desconocido';

/** Elemento recuperado. `verified` solo es true si una comprobación objetiva (CRC, Adler-32, estructura) lo respalda. */
export interface RecoveredItem {
  kind: 'metadatos' | 'texto' | 'imagen-parcial' | 'entrada' | 'estructura';
  name: string;
  size: number;
  verified: boolean;
  basis: string;
  preview?: string;
  bytes?: Uint8Array;
  /** Prefijo legible de un flujo dañado. NO verificado: no hay suma de comprobación que lo respalde. */
  partialBytes?: Uint8Array;
  sha256?: string;
}

export interface Repaired { name: string; bytes: Uint8Array; note: string; structureVerified: boolean; sha256?: string }

export interface AnalysisResult {
  integrity: Integrity;
  findings: FileFinding[];
  damaged: DamagedRange[];
  items: RecoveredItem[];
  repaired?: Repaired;
  limitations: string[];
  meta?: Record<string, string | number>;
}

export interface Analyzer {
  id: string;
  label: string;
  analyze(bytes: Uint8Array, ctx: { name: string; deadline: import('./core').Deadline; limits: import('./core').Limits }): AnalysisResult;
}

export interface Identification {
  id: string; label: string; category: Category; analyzer: string | null;
  confidence: 'alta' | 'media' | 'baja'; signals: string[]; dangerous: boolean;
}

export interface FileReport extends AnalysisResult {
  name: string; size: number; sha256: string;
  format: string; label: string; category: Category; confidence: Identification['confidence']; signals: string[];
  dangerous: boolean; elapsedMs: number;
}
