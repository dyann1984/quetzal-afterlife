import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { CAPACIDADES, resumen, type Area } from './capabilities';
import { ANALYZERS } from './filerec';

describe('matriz de capacidades (no puede afirmar más de lo que existe)', () => {
  it('ids únicos y las 7 áreas del alcance están cubiertas', () => {
    expect(new Set(CAPACIDADES.map(c => c.id)).size).toBe(CAPACIDADES.length);
    const areas = new Set<Area>(CAPACIDADES.map(c => c.area));
    for (const a of ['documentos', 'fotografias', 'audio-video', 'bases-de-datos', 'programas', 'imagenes-de-disco', 'reconstruccion-de-aplicaciones'] as Area[]) expect(areas.has(a), a).toBe(true);
  });
  it('lo implementado o parcial apunta a un módulo y a pruebas que EXISTEN', () => {
    for (const c of CAPACIDADES.filter(x => x.estado !== 'no-implementado')) {
      expect(c.modulo && existsSync(c.modulo), `${c.id}: módulo ${c.modulo}`).toBe(true);
      expect(c.pruebas && existsSync(c.pruebas), `${c.id}: pruebas ${c.pruebas}`).toBe(true);
    }
  });
  it('lo no implementado no declara módulo, pruebas ni capacidades', () => {
    for (const c of CAPACIDADES.filter(x => x.estado === 'no-implementado')) { expect(c.modulo).toBeNull(); expect(c.pruebas).toBeNull(); expect(c.soporta).toMatch(/Nada|Solo diseño/); }
  });
  it('toda entrada declara limitaciones, riesgos y dependencias (nada "sin límites")', () => {
    for (const c of CAPACIDADES) for (const k of ['limitaciones', 'riesgos', 'dependencias', 'soporta'] as const) expect(c[k].length, `${c.id}.${k}`).toBeGreaterThanOrEqual(5);
  });
  it('los analizadores declarados como implementados existen en el registro real', () => {
    for (const id of ['png', 'jpeg', 'pdf', 'zip']) expect(ANALYZERS[id], id).toBeTruthy();
    expect(CAPACIDADES.find(c => c.id === 'png')!.estado).toBe('implementado-probado');
    expect(CAPACIDADES.find(c => c.id === 'jpeg')!.estado).not.toBe('implementado-probado');   // sin decodificación
    expect(CAPACIDADES.find(c => c.id === 'audio-video')!.estado).toBe('parcial');
  });
  it('no se promete recuperación universal ni de código fuente', () => {
    const texto = JSON.stringify(CAPACIDADES).toLowerCase();
    expect(texto).not.toMatch(/recuperaci[oó]n universal|garantiz|código fuente original recuperado/);
    expect(CAPACIDADES.find(c => c.id === 'software-archaeology')!.limitaciones).toMatch(/no se afirma recuperar código fuente/i);
  });
  it('los archivos reales citados existen', () => {
    expect(existsSync('public/quetzal-logo.png')).toBe(true);
    expect(readFileSync('docs/software-archaeology.md', 'utf8')).toMatch(/NO afirma/);
  });
  it('el resumen cuadra', () => {
    const r = resumen(); expect(r.implementadoProbado + r.parcial + r.noImplementado).toBe(r.total); expect(r.noImplementado).toBeGreaterThan(3);
  });
});


