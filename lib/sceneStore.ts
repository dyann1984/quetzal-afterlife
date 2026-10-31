/**
 * lib/sceneStore.ts — Almacén mínimo (sin React) para compartir el SceneModel actual.
 * El motor publica; la visualización (hero del Dashboard) solo lee. Así ninguno depende del otro.
 */
import type { SceneModel } from './experience';

let current: SceneModel | null = null;
const subs = new Set<() => void>();

export const sceneStore = {
  get: (): SceneModel | null => current,
  set(next: SceneModel | null) { if (next === current) return; current = next; subs.forEach(f => f()); },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};
