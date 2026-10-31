import { describe, it, expect } from 'vitest';
import { sceneStore } from './sceneStore';
import type { SceneModel } from './experience';

describe('sceneStore', () => {
  it('publica, notifica una sola vez por cambio y permite cancelar', () => {
    const fake = { synthetic: true } as unknown as SceneModel;
    let calls = 0; const off = sceneStore.subscribe(() => { calls++; });
    expect(sceneStore.get()).toBeNull();
    sceneStore.set(fake); sceneStore.set(fake);
    expect(calls).toBe(1); expect(sceneStore.get()).toBe(fake);
    off(); sceneStore.set(null);
    expect(calls).toBe(1); expect(sceneStore.get()).toBeNull();
  });
});
