import { describe, it, expect } from 'vitest';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { deflateRawFixed, deflateZlib, inflateRaw, entropy } from './core';
import { buildLabExamples, runLab } from './lab';
import { analyzeFile, exportRecovered } from './index';
import { sha256Hex } from '../ingest';

describe('compresor Deflate propio', () => {
  it('es compatible con zlib de Node y con el inflate del motor', () => {
    const data = new TextEncoder().encode('QUETZAL '.repeat(500) + 'fin ' + Array.from({ length: 300 }, (_, i) => i % 251).join(','));
    const raw = deflateRawFixed(data);
    expect(new Uint8Array(inflateRawSync(raw))).toEqual(data);
    expect(inflateRaw(raw).out).toEqual(data);
    expect(new Uint8Array(inflateSync(deflateZlib(data)))).toEqual(data);
    expect(raw.length).toBeLessThan(data.length / 2);
  });
  it('vacío y un byte', () => {
    expect(inflateRaw(deflateRawFixed(new Uint8Array(0))).out.length).toBe(0);
    expect(inflateRaw(deflateRawFixed(Uint8Array.of(7))).out).toEqual(Uint8Array.of(7));
  });
  it('entropía: ruido ≈ 8, texto repetido bajo', () => {
    expect(entropy(new Uint8Array(1000))).toBe(0);
    expect(entropy(new TextEncoder().encode('abababab'))).toBeCloseTo(1, 5);
  });
});

describe('RESURRECTION LAB — ejemplos reproducibles', () => {
  it('son deterministas y cada dañado difiere del original', async () => {
    const a = buildLabExamples(), b = buildLabExamples();
    expect(a).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(await sha256Hex(a[i].damaged.bytes)).toBe(await sha256Hex(b[i].damaged.bytes));
      expect(await sha256Hex(a[i].original.bytes)).toBe(await sha256Hex(b[i].original.bytes));
      expect(await sha256Hex(a[i].damaged.bytes)).not.toBe(await sha256Hex(a[i].original.bytes));
    }
  });
  it('los originales se analizan como íntegros (sin daño de fábrica)', async () => {
    for (const ex of buildLabExamples().filter(e => e.id !== 'png-noise')) expect((await analyzeFile(ex.original.bytes, ex.original.name)).integrity, ex.id).toBe('integro');
  });
  for (const id of ['png-crc', 'txt-partial', 'docx-signature', 'zip-deflate', 'png-noise', 'png-partial']) {
    it(`ejecución real: ${id} — todas las comprobaciones contra el original pasan`, async () => {
      const ex = buildLabExamples().find(e => e.id === id)!, stages: number[] = [], run = await runLab(ex, s => stages.push(s.pct));
      expect(run.checks.length).toBeGreaterThan(0);
      for (const c of run.checks) expect(c.ok, `${id}: ${c.label.es} (${c.detail})`).toBe(true);
      expect(stages[stages.length - 1]).toBe(100);
      expect(stages).toEqual([...stages].sort((x, y) => x - y));
    });
  }
  it('PNG con CRC alterados: recuperación exacta, byte a byte, confianza alta', async () => {
    const run = await runLab(buildLabExamples()[0]);
    expect(run.report.integrity).toBe('danado');
    expect(run.recoveredSha).toBe(run.originalSha);
    expect(run.confidence).toBe('alta');
  });
  it('DOCX con firma alterada: identificado por estructura, reparación idéntica al original', async () => {
    const ex = buildLabExamples()[2], run = await runLab(ex);
    expect(run.report.format).toBe('zip'); expect(run.report.confidence).toBe('media');
    expect(run.report.items.filter(i => i.kind === 'entrada').every(i => i.verified)).toBe(true);
    expect(run.recoveredSha).toBe(run.originalSha);
  });
  it('texto parcial: marca lo perdido y no inventa contenido', async () => {
    const run = await runLab(buildLabExamples()[1]), rep = run.report.repaired!;
    const out = new TextDecoder().decode(rep.bytes);
    expect(out).toContain('�'); expect(out).toContain('Fin del documento.');
    expect(run.report.damaged.length).toBe(4); expect(run.confidence).toBe('media');
  });
  it('irrecuperable: confianza nula, sin reparado y sin exportar nada verificado', async () => {
    const run = await runLab(buildLabExamples()[4]);
    expect(run.confidence).toBe('nula'); expect(run.report.repaired).toBeUndefined();
    expect(run.report.meta?.entropiaBitsPorByte).toBeGreaterThan(7.5);
  });
  it('el ZIP exportado contiene el prefijo no verificado en una carpeta aparte', async () => {
    const run = await runLab(buildLabExamples()[3]), z = exportRecovered(run.report), txt = new TextDecoder('latin1').decode(z);
    expect(txt).toContain('parcial-no-verificado/'); expect(txt).toContain('recuperado/notas.txt');
  });
});

describe('reparación PNG: límites', () => {
  it('CRC de IDAT alterado Y datos alterados: no se declara recuperación completa', async () => {
    const ex = buildLabExamples()[0], b = ex.original.bytes.slice(), p = 8 + 25 + 12 + 60 + 20; b[p] ^= 0xff; b[p + 1] ^= 0xff;
    const r = await analyzeFile(b, 'x.png'); expect(r.integrity).not.toBe('integro');
    if (r.repaired) expect(await sha256Hex(r.repaired.bytes)).not.toBe(await sha256Hex(ex.original.bytes));
  });
  it('firma alterada con IHDR en su sitio se identifica y repara; sin IHDR no', async () => {
    const ex = buildLabExamples()[0], b = ex.original.bytes.slice(); b.fill(0, 0, 8);
    const r = await analyzeFile(b, 'x.bin'); expect(r.format).toBe('png'); expect(r.repaired?.sha256).toBe(await sha256Hex(ex.original.bytes));
    const c = b.slice(); c.fill(0, 0, 40);
    expect((await analyzeFile(c, 'x.bin')).format).not.toBe('png');
  });
});
