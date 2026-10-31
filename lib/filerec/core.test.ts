import { describe, it, expect } from 'vitest';
import { deflateSync, deflateRawSync, inflateSync } from 'node:zlib';
import { crc32, adler32, inflateRaw, inflateZlib, deflateStored, safeName, sectorsOf, indexOfSeq, ascii } from './core';

const rnd = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function sample(n: number, kind: 'texto' | 'azar' | 'repetido'): Uint8Array {
  const r = rnd(n + 7), b = new Uint8Array(n);
  for (let i = 0; i < n; i++) b[i] = kind === 'azar' ? Math.floor(r() * 256) : kind === 'repetido' ? 65 + (i % 3) : 97 + Math.floor(r() * 6);
  return b;
}

describe('crc32 / adler32', () => {
  it('valores conocidos', () => {
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
    expect(adler32(ascii('Wikipedia'))).toBe(0x11e60398);
  });
});

describe('inflate propio', () => {
  it('coincide con zlib en datos de distinta naturaleza y tamaño (raw y zlib)', () => {
    for (const kind of ['texto', 'azar', 'repetido'] as const) for (const n of [0, 1, 100, 5000, 70000]) {
      const data = sample(n, kind);
      const raw = inflateRaw(new Uint8Array(deflateRawSync(data)));
      expect(raw.complete, `${kind}/${n}`).toBe(true);
      expect(Buffer.from(raw.out).equals(Buffer.from(data))).toBe(true);
      const z = inflateZlib(new Uint8Array(deflateSync(data)));
      expect(z.complete && z.adlerOk).toBe(true);
      expect(Buffer.from(z.out).equals(Buffer.from(data))).toBe(true);
    }
  });
  it('decodifica el flujo almacenado que escribe deflateStored (verificado por zlib nativo)', () => {
    const data = sample(150000, 'azar'), s = deflateStored(data);
    expect(Buffer.from(inflateSync(Buffer.from(s))).equals(Buffer.from(data))).toBe(true);
    expect(inflateZlib(s).adlerOk).toBe(true);
  });
  it('un flujo truncado devuelve el PREFIJO correcto y el motivo', () => {
    const data = sample(40000, 'texto'), full = new Uint8Array(deflateSync(data));
    const cut = inflateZlib(full.subarray(0, Math.floor(full.length * 0.6)));
    expect(cut.complete).toBe(false);
    expect(cut.error).toMatch(/fin de datos/);
    expect(cut.out.length).toBeGreaterThan(1000);
    expect(Buffer.from(cut.out).equals(Buffer.from(data.subarray(0, cut.out.length)))).toBe(true);
  });
  it('un byte corrupto no lanza; lo anterior a la corrupción es correcto y el Adler-32 la delata', () => {
    const data = sample(30000, 'azar'), z = new Uint8Array(deflateSync(data, { level: 6 }));
    z[Math.floor(z.length / 2)] ^= 0xff;                       // corrupción a mitad del flujo
    const r = inflateZlib(z);
    const safe = Math.floor(data.length * 0.4);                // el 40 % inicial queda antes del byte dañado
    expect(r.out.length).toBeGreaterThanOrEqual(safe);
    expect(Buffer.from(r.out.subarray(0, safe)).equals(Buffer.from(data.subarray(0, safe)))).toBe(true);
    // una corrupción puede decodificar "sin error": solo la suma de comprobación la detecta
    expect(r.complete && r.adlerOk === true).toBe(false);
  });  it('limita la salida (bomba de descompresión)', () => {
    const bomb = new Uint8Array(deflateRawSync(new Uint8Array(20_000_000)));
    const r = inflateRaw(bomb, 0, 1_000_000);
    expect(r.complete).toBe(false);
    expect(r.error).toMatch(/límite/);
    expect(r.out.length).toBeLessThanOrEqual(1_000_000);
  });
  it('entradas basura no lanzan excepciones', () => {
    for (let s = 0; s < 200; s++) {
      const junk = sample(1 + (s % 300), 'azar');
      expect(() => inflateRaw(junk)).not.toThrow();
      expect(() => inflateZlib(junk)).not.toThrow();
    }
  });
});

describe('seguridad de nombres y sectores', () => {
  it('safeName neutraliza zip-slip, rutas absolutas, unidades y controles', () => {
    expect(safeName('../../etc/passwd')).toBe('etc/passwd');
    expect(safeName('/abs/ruta.txt')).toBe('abs/ruta.txt');
    expect(safeName('C:\\Windows\\System32\\x.dll')).toBe('Windows/System32/x.dll');
    expect(safeName('a/./b/../c\u0000.txt')).toBe('a/b/c.txt');
    expect(safeName('..')).toBe('sin-nombre');
    expect(safeName('x'.repeat(500)).length).toBe(200);
  });
  it('sectorsOf usa sectores de 512 B', () => {
    expect(sectorsOf(0, 512)).toEqual([0, 0]);
    expect(sectorsOf(500, 520)).toEqual([0, 1]);
    expect(sectorsOf(1024, 2048)).toEqual([2, 3]);
  });
  it('indexOfSeq encuentra y respeta límites', () => {
    const b = ascii('xxPK\u0003\u0004yy');
    expect(indexOfSeq(b, [0x50, 0x4b, 3, 4])).toBe(2);
    expect(indexOfSeq(b, [0x50, 0x4b, 3, 4], 3)).toBe(-1);
  });
});

