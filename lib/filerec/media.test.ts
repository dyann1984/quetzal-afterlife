import { describe, it, expect } from 'vitest';
import { analyzeFile } from './index';
import { analyzeGif, analyzeBmp, analyzeWav } from './media';
import { ascii, concat } from './core';

const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff];
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];

/** GIF mínimo de 1 cuadro 2×2 (los datos LZW son un relleno: no se decodifican). */
const makeGif = (): Uint8Array => new Uint8Array([
  ...ascii('GIF89a'), ...le16(2), ...le16(2), 0x80, 0, 0, 0, 0, 0, 255, 255, 255,
  0x21, 0xfe, 3, 0x68, 0x69, 0x21, 0,
  0x2c, ...le16(0), ...le16(0), ...le16(2), ...le16(2), 0, 2, 2, 0x44, 0x01, 0,
  0x3b,
]);
const makeBmp = (w = 2, h = 3): Uint8Array => {
  const row = Math.ceil((w * 24) / 32) * 4, size = 54 + row * h, px = new Uint8Array(row * h).fill(0x7f);
  return concat([new Uint8Array([0x42, 0x4d, ...le32(size), 0, 0, 0, 0, ...le32(54), ...le32(40), ...le32(w), ...le32(h), ...le16(1), ...le16(24), ...le32(0), ...le32(row * h), ...le32(2835), ...le32(2835), ...le32(0), ...le32(0)]), px]);
};
const makeWav = (samples = 800): Uint8Array => {
  const data = new Uint8Array(samples * 2).map((_, i) => i & 0xff);
  return concat([new Uint8Array([...ascii('RIFF'), ...le32(36 + data.length), ...ascii('WAVE'), ...ascii('fmt '), ...le32(16), ...le16(1), ...le16(1), ...le32(8000), ...le32(16000), ...le16(2), ...le16(16), ...ascii('data'), ...le32(data.length)]), data]);
};

describe('GIF', () => {
  it('íntegro: cuadro, comentario y terminador', () => {
    const r = analyzeGif(makeGif());
    expect(r.integrity).toBe('integro'); expect(r.meta).toMatchObject({ ancho: 2, alto: 2, cuadros: 1 });
    expect(r.repaired).toBeUndefined();
  });
  it('sin terminador: parcial y reparable', () => {
    const g = makeGif(), r = analyzeGif(g.subarray(0, g.length - 1));
    expect(r.integrity).toBe('parcial'); expect(r.findings.some(f => f.code === 'sin_trailer')).toBe(true);
    expect(r.repaired?.structureVerified).toBe(true);
  });
  it('cortado en mitad de un cuadro: conserva lo íntegro, descarta el resto', () => {
    const g = makeGif(), two = concat([g.subarray(0, g.length - 1), g.subarray(g.length - 12, g.length - 1)]);
    const r = analyzeGif(two.subarray(0, two.length - 4));
    expect(r.meta).toMatchObject({ cuadros: 1 }); expect(r.integrity).toBe('parcial'); expect(r.repaired?.structureVerified).toBe(true);
  });
  it('solo cabecera: dañado sin cuadros; basura: irrecuperable', () => {
    expect(analyzeGif(makeGif().subarray(0, 14)).integrity).toBe('danado');
    expect(analyzeGif(new Uint8Array(20)).integrity).toBe('irrecuperable');
  });
});

describe('BMP', () => {
  it('íntegro', () => { const r = analyzeBmp(makeBmp()); expect(r.integrity).toBe('integro'); expect(r.meta).toMatchObject({ ancho: 2, alto: 3, filasPresentes: 3 }); });
  it('filas ausentes: parcial, rangos dañados y reparación con relleno declarado', () => {
    const b = makeBmp(2, 3), r = analyzeBmp(b.subarray(0, b.length - 8));
    expect(r.integrity).toBe('parcial'); expect(r.damaged[0].reason).toMatch(/ausente/);
    expect(r.repaired?.structureVerified).toBe(true); expect(r.repaired?.note).toMatch(/ceros/);
    expect(r.items.find(i => i.kind === 'imagen-parcial')!.verified).toBe(false);
  });
  it('dimensiones absurdas y archivo sin píxeles no revientan', () => {
    const b = makeBmp(); b.set(le32(0x7fffffff), 18);
    expect(analyzeBmp(b).integrity).toBe('danado');
    expect(analyzeBmp(makeBmp().subarray(0, 54)).integrity).toBe('danado');
    expect(analyzeBmp(ascii('BM')).integrity).toBe('irrecuperable');
  });
});

describe('WAV', () => {
  it('íntegro: formato y duración', () => {
    const r = analyzeWav(makeWav());
    expect(r.integrity).toBe('integro'); expect(r.meta).toMatchObject({ canales: 1, hz: 8000, bits: 16 });
    expect(r.items.find(i => i.name === 'muestras de audio')!.verified).toBe(false);
  });
  it('truncado: parcial, recorta a muestras completas y corrige tamaños', () => {
    const w = makeWav(), r = analyzeWav(w.subarray(0, w.length - 501));
    expect(r.integrity).toBe('parcial'); expect(r.repaired?.structureVerified).toBe(true);
    expect((r.repaired!.bytes.length - 44) % 2).toBe(0);
  });
  it('sin chunk fmt o sin data', () => {
    expect(analyzeWav(makeWav().subarray(0, 30)).integrity).toBe('irrecuperable');
    expect(analyzeWav(makeWav().subarray(0, 44)).integrity).toBe('danado');
  });
});

describe('integración con analyzeFile', () => {
  it('los tres formatos se identifican por firma y llegan a su analizador', async () => {
    for (const [bytes, name, fmt] of [[makeGif(), 'a.dat', 'gif'], [makeBmp(), 'a.dat', 'bmp'], [makeWav(), 'a.dat', 'wav']] as const) {
      const r = await analyzeFile(bytes, name);
      expect(r.format).toBe(fmt); expect(r.integrity).toBe('integro'); expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
