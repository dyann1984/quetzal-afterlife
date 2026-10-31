import { describe, it, expect } from 'vitest';
import { ingest, sniffFormat, verifyIntegrity, sha256Hex, IngestError } from './ingest';
import { scanDbf } from './dbf-scan';
import { scanCsv } from './csv-scan';
import { diagnose } from './discovery';
import { buildScenario, buildDbf, ESCENARIO_ESPERADO } from './scenario';
import { parseDbf } from './dbf';

const NOW = '2026-10-31T00:00:00.000Z';
const file = (n: string) => buildScenario().find(f => f.name === n)!;

describe('ingest', () => {
  it('SHA-256 conocido', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('identifica por contenido, no por extensión', async () => {
    const dbfAsTxt = await ingest(file('CLIENTES.DBF').bytes, 'datos.txt', NOW);
    expect(dbfAsTxt.evidence.format).toBe('dbf');
    expect(dbfAsTxt.evidence.signals.join(' ')).toMatch(/extensión/);
  });
  it('trabaja sobre una copia y detecta alteraciones', async () => {
    const src = file('PRODUCTOS.DBF').bytes;
    const r = await ingest(src, 'p.dbf', NOW);
    expect(r.bytes).not.toBe(src);
    expect(await verifyIntegrity(r.evidence, r.bytes)).toBe(true);
    r.bytes[40] ^= 1;
    expect(await verifyIntegrity(r.evidence, r.bytes)).toBe(false);
  });
  it('rechaza vacíos, exceso de tamaño y ejecutables', async () => {
    await expect(ingest(new Uint8Array(0), 'x', NOW)).rejects.toBeInstanceOf(IngestError);
    await expect(ingest(new Uint8Array(100), 'x', NOW, { maxBytes: 50, maxRecords: 1 })).rejects.toMatchObject({ code: 'demasiado_grande' });
    expect(sniffFormat(new TextEncoder().encode('MZ\x90\x00'), 'a.dbf').format).toBe('rechazado');
    expect(sniffFormat(new TextEncoder().encode('#!/bin/sh\nrm'), 'a.csv').format).toBe('rechazado');
  });
  it('reconoce CSV, SQLite y desconocidos', () => {
    expect(sniffFormat(new TextEncoder().encode('a;b\n1;2\n'), 'x.dat').format).toBe('csv');
    expect(sniffFormat(file('RESPALDO.DB').bytes, 'r.db').format).toBe('sqlite');
    expect(sniffFormat(new Uint8Array([1, 2, 0, 3, 0, 0]), 'q.bin').format).toBe('desconocido');
  });
});

describe('scanDbf', () => {
  it('concuerda con el parser estricto en archivos íntegros', () => {
    const f = file('CLIENTES.DBF').bytes;
    const strict = parseDbf(f, 'c.dbf');
    const s = scanDbf(f);
    expect(s.records.length).toBe(strict.records.length);
    expect(s.records.every(r => r.intact)).toBe(true);
    expect(s.records[0].values.NOMBRE).toBe(strict.records[0].values.NOMBRE);
    expect(s.records.filter(r => r.deleted).length).toBe(1);
    expect(s.findings.filter(x => x.severity === 'dano')).toEqual([]);
  });
  it('localiza el truncamiento y el registro parcial', () => {
    const s = scanDbf(file('VENTAS.DBF').bytes);
    expect(s.truncated).toBe(true);
    expect(s.declaredRecords).toBe(ESCENARIO_ESPERADO.ventasDeclaradas);
    expect(s.records.length).toBe(ESCENARIO_ESPERADO.ventasLegibles);
    expect(s.records.filter(r => r.intact).length).toBe(ESCENARIO_ESPERADO.ventasIntactas);
    const partial = s.records[12];
    expect(partial.values.FOLIO).toBe('V-0013');
    expect(partial.unknownFields).toEqual(['FECHA', 'TOTAL']);
    expect(s.findings.some(f => f.code === 'truncamiento')).toBe(true);
    expect(s.unrecoverable.some(u => /ausentes del archivo/.test(u.reason))).toBe(true);
  });
  it('marca campos corruptos y bytes de borrado inválidos sin inventar valores', () => {
    const s = scanDbf(file('INVENTARIO.DBF').bytes);
    expect(s.records[3].unknownFields).toEqual(['EXISTENCIA']);
    expect(s.records[3].values.EXISTENCIA).toBe('');
    expect(s.records[7].issues.join()).toMatch(/borrado inválido/);
    expect(s.unrecoverable.some(u => u.record === 4)).toBe(true);
  });
  it('tolera entradas malformadas sin lanzar', () => {
    for (const len of [0, 1, 10, 32, 33, 40, 100]) {
      const junk = new Uint8Array(len).fill(0x41);
      expect(() => scanDbf(junk)).not.toThrow();
    }
    const hostile = new Uint8Array(200); hostile[0] = 3; hostile[8] = 0xff; hostile[9] = 0xff; hostile[10] = 0xff; hostile[11] = 0xff; hostile[4] = 0xff; hostile[5] = 0xff; hostile[6] = 0xff; hostile[7] = 0xff;
    expect(() => scanDbf(hostile)).not.toThrow();
  });
  it('respeta el límite de registros', () => {
    const big = buildDbf([{ name: 'A', len: 3 }], Array.from({ length: 50 }, (_, i) => ({ v: [String(i)] })));
    const s = scanDbf(big, 10);
    expect(s.records.length).toBe(10);
    expect(s.findings.some(f => f.code === 'limite_registros')).toBe(true);
  });
});

describe('scanCsv', () => {
  it('detecta filas irregulares con su línea', () => {
    const s = scanCsv(file('DETALLE.CSV').bytes);
    expect(s.headers).toEqual(['folio', 'codigo', 'cantidad', 'precio']);
    const bad = s.findings.filter(f => f.code === 'fila_irregular');
    expect(bad.length).toBe(1);
    expect(bad[0].record).toBeGreaterThan(1);
  });
  it('detecta comilla sin cerrar y delimitador', () => {
    const s = scanCsv(new TextEncoder().encode('a;b\n1;"dos\n3;4'));
    expect(s.delimiter).toBe(';');
    expect(s.truncatedQuote).toBe(true);
    expect(s.findings.some(f => f.code === 'comilla_sin_cerrar')).toBe(true);
  });
  it('no interpreta fórmulas: las conserva como texto', () => {
    const s = scanCsv(new TextEncoder().encode('a,b\n=cmd|calc,2\n'));
    expect(s.rows[0].cells[0]).toBe('=cmd|calc');
  });
  it('decodifica Latin-1 como estimación', () => {
    const s = scanCsv(new Uint8Array([0x61, 0x2c, 0x62, 0x0a, 0x4d, 0x75, 0xf1, 0x6f, 0x7a, 0x2c, 0x31]));
    expect(s.encoding).toBe('windows-1252');
    expect(s.rows[0].cells[0]).toBe('Muñoz');
    expect(s.encodingBasis).toMatch(/estimación/);
  });
});

describe('discovery', () => {
  it('diagnostica cada archivo del escenario con su nivel de soporte', async () => {
    const out: Record<string, ReturnType<typeof diagnose>> = {};
    for (const f of buildScenario()) {
      const ev = (await ingest(f.bytes, f.name, NOW)).evidence;
      out[f.name] = diagnose(ev, f.bytes);
    }
    expect(out['CLIENTES.DBF'].damaged).toBe(false);
    expect(out['VENTAS.DBF'].damaged).toBe(true);
    expect(out['INVENTARIO.DBF'].damaged).toBe(true);
    expect(out['DETALLE.CSV'].damaged).toBe(true);
    expect(out['RESPALDO.DB'].supportLevel).toBe('solo-diagnostico');
    expect(out['RESPALDO.DB'].findings.some(f => f.code === 'truncamiento')).toBe(true);
    expect(out['RESPALDO.DB'].tables).toEqual([]);
    expect(out['VENTAS.DBF'].tables[0]).toMatchObject({ name: 'VENTAS', declaredRecords: 15, readableRecords: 13 });
  });
  it('formato desconocido y rechazado no tienen adaptador', () => {
    expect(diagnose({ format: 'desconocido', name: 'x' }, new Uint8Array(3)).supportLevel).toBe('sin-soporte');
    expect(diagnose({ format: 'rechazado', name: 'x' }, new Uint8Array(3)).damaged).toBe(true);
  });
});
