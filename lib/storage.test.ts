import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProjectStorage, BACKUP_KEY, createProject, upsertProject, emptyStore } from './project';

function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _m: m,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('ProjectStorage', () => {
  it('guarda y recupera proyectos (ida y vuelta)', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = upsertProject(emptyStore(), createProject('P1'));
    ProjectStorage.save(store);
    expect(ProjectStorage.load().projects.map(p => p.name)).toEqual(['P1']);
  });
  it('un almacén corrupto devuelve vacío y conserva respaldo', () => {
    const ls = fakeStorage({ quetzal_projects: '{corrupto' });
    vi.stubGlobal('localStorage', ls);
    expect(ProjectStorage.load().projects).toEqual([]);
    expect(ls.getItem(BACKUP_KEY)).toBe('{corrupto');
    ProjectStorage.save(emptyStore());
    expect(ls.getItem(BACKUP_KEY)).toBe('{corrupto');
  });
  it('rechaza guardar por encima de 5 MB', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const big = createProject('x'.repeat(6 * 1024 * 1024));
    expect(() => ProjectStorage.save(upsertProject(emptyStore(), big))).toThrow(/5 MB/);
  });
});
