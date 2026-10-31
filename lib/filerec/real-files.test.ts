/**
 * Pruebas con archivos REALES no sensibles disponibles legítimamente:
 *  - public/quetzal-logo.png: activo del propio proyecto (siempre presente en el repositorio).
 *  - Fondo de pantalla JPEG de Windows (recurso del sistema): se omite si no existe en el equipo.
 * No hay PDF, DOCX, XLSX ni ZIP reales disponibles en este entorno: esos formatos solo se validan con fixtures sintéticos.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { analyzeFile } from './index';
import { analyzePng, walkPngChunks } from './png';
import { inflateZlib, concat } from './core';

const logo = new Uint8Array(readFileSync('public/quetzal-logo.png'));
const wall = 'C:\\Windows\\Web\\4K\\Wallpaper\\Windows\\img0_1920x1200.jpg';
const idat = (b: Uint8Array) => concat(walkPngChunks(b).filter(c => c.type === 'IDAT' && c.crcOk).map(c => b.subarray(c.offset + 8, c.offset + 8 + c.length)));

describe('PNG real (logotipo del proyecto)', () => {
  it('se reconoce como íntegro, con todas las filas y CRC válidos', async () => {
    const r = await analyzeFile(logo, 'quetzal-logo.png');
    expect(r.format).toBe('png');
    expect(r.integrity).toBe('integro');
    expect(r.meta!.ancho).toBe(1254); expect(r.meta!.alto).toBe(1254); expect(r.meta!.filasRecuperables).toBe(1254);
    expect(r.damaged).toEqual([]);
  });
  it('truncado al 40 %: las filas recuperadas coinciden byte a byte con las del original y el PNG reparado es válido', async () => {
    const cut = logo.slice(0, Math.floor(logo.length * 0.4));
    const r = await analyzeFile(cut, 'logo-truncado.png');
    expect(r.integrity).toBe('parcial');
    const rows = Number(r.meta!.filasRecuperables);
    expect(rows).toBeGreaterThan(100); expect(rows).toBeLessThan(1254);
    expect(r.repaired?.structureVerified).toBe(true);
    // verificación independiente: descomprimir el original y el reparado y comparar las filas
    const orig = inflateZlib(idat(logo)).out, fixed = inflateZlib(idat(r.repaired!.bytes)).out;
    expect(Buffer.from(fixed).equals(Buffer.from(orig.subarray(0, fixed.length)))).toBe(true);
    expect(analyzePng(r.repaired!.bytes).meta!.alto).toBe(rows);
  });
  it('un chunk IDAT intermedio alterado limita la recuperación a las filas anteriores', async () => {
    const b = logo.slice(); const ids = walkPngChunks(b).filter(c => c.type === 'IDAT');
    expect(ids.length).toBeGreaterThan(3);
    b[ids[2].offset + 20] ^= 0xff;
    const r = await analyzeFile(b, 'logo-idat.png');
    expect(r.integrity).toBe('parcial'); expect(r.findings.some(f => f.code === 'crc_invalido')).toBe(true);
    expect(Number(r.meta!.filasRecuperables)).toBeLessThan(1254);
  });
});

describe.skipIf(!existsSync(wall))('JPEG real (fondo de pantalla de Windows)', () => {
  const jpg = existsSync(wall) ? new Uint8Array(readFileSync(wall)) : new Uint8Array(0);
  it('estructura íntegra; los píxeles NO se declaran verificados', async () => {
    const r = await analyzeFile(jpg, 'img0.jpg');
    expect(r.format).toBe('jpeg'); expect(r.integrity).toBe('integro');
    expect(r.meta!.ancho).toBe(1920); expect(r.meta!.alto).toBe(1200);
    expect(r.items.find(i => i.kind === 'imagen-parcial')!.verified).toBe(false);
  });
  it('truncado al 50 %: parcial, daño localizado y EOI añadido sin inventar píxeles', async () => {
    const r = await analyzeFile(jpg.slice(0, Math.floor(jpg.length / 2)), 'img0-cortado.jpg');
    expect(r.integrity).toBe('parcial'); expect(r.findings.some(f => f.code === 'sin_eoi')).toBe(true);
    expect(r.damaged[0].start).toBeGreaterThan(1000);
    expect(r.repaired?.structureVerified).toBe(true); expect(r.repaired!.bytes.length).toBe(Math.floor(jpg.length / 2) + 2);
  });
});

