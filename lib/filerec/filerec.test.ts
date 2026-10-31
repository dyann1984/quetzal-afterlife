import { describe, it, expect } from 'vitest';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { analyzeFile, carveImage, exportRecovered, reportJson, identify, buildZip, DEFAULT_LIMITS } from './index';
import { readZip, extractEntry, analyzeZip } from './zip';
import { analyzePng } from './png';
import { analyzeJpeg } from './jpeg';
import { analyzePdf } from './pdf';
import { crc32, ascii, concat } from './core';
import { buildFixtures, buildDisk, makePng, makeJpeg, makePdf, makeDocx, makeXlsx } from './fixtures';

const fx = (n: string) => buildFixtures().find(f => f.name === n)!.bytes;
const rep = (n: string) => analyzeFile(fx(n), n);

describe('identificación por firma', () => {
  it('reconoce por contenido, no por extensión', () => {
    expect(identify(makePng(), 'foto.txt').id).toBe('png');
    expect(identify(makePng(), 'foto.txt').signals.join(' ')).toMatch(/extensión/);
    expect(identify(makeJpeg(), 'x.dat').id).toBe('jpeg');
    expect(identify(makePdf(), 'x').id).toBe('pdf');
    expect(identify(makeDocx(), 'x.bin').id).toBe('zip');
    expect(identify(concat([ascii('basura previa\n'), makePdf()]), 'x.pdf').id).toBe('pdf');
  });
  it('marca ejecutables como peligrosos y no los analiza', async () => {
    const exe = concat([ascii('MZ'), new Uint8Array(200)]);
    expect(identify(exe, 'x.png').dangerous).toBe(true);
    const r = await analyzeFile(exe, 'x.png');
    expect(r.integrity).toBe('no-analizado');
    expect(r.findings[0].code).toBe('ejecutable_no_ejecutado');
    expect(r.items).toEqual([]);
  });
  it('formatos reconocidos sin analizador se declaran como no analizados (no se inventa contenido)', async () => {
    const gif = concat([ascii('GIF89a'), new Uint8Array(40)]);
    const r = await analyzeFile(gif, 'a.gif');
    expect(r.format).toBe('gif');
    expect(r.integrity).toBe('no-analizado');
    expect(r.items.length).toBe(0);
  });
});

describe('PNG', () => {
  it('íntegro: CRC, filas y SHA-256', async () => {
    const r = await rep('imagen-integra.png');
    expect(r.integrity).toBe('integro');
    expect(r.items.find(i => i.kind === 'imagen-parcial')!.name).toBe('imagen completa');
    expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.repaired).toBeUndefined();
    expect(r.items.some(i => i.name === 'tEXt:Comment' && i.verified)).toBe(true);
  });
  it('IDAT con CRC alterado: recupera solo filas íntegras, registra el daño y repara con verificación', async () => {
    const r = await rep('imagen-crc-idat.png');
    expect(r.integrity).toBe('parcial');
    expect(r.findings.some(f => f.code === 'crc_invalido')).toBe(true);
    expect(r.findings.some(f => f.code === 'idat_interrumpido')).toBe(true);
    const rows = Number(r.meta!.filasRecuperables);
    expect(rows).toBeGreaterThan(0); expect(rows).toBeLessThan(24);
    expect(r.damaged.length).toBeGreaterThan(0);
    expect(r.damaged[0].sectors).toBeTruthy();
    expect(r.repaired?.structureVerified).toBe(true);
    const again = analyzePng(r.repaired!.bytes);
    expect(again.integrity).toBe('integro');
    expect(again.meta!.alto).toBe(rows);              // la altura se reduce: no se inventan filas
  });
  it('truncado: filas parciales y falta de IEND', async () => {
    const r = await rep('imagen-truncada.png');
    expect(['parcial', 'irrecuperable']).toContain(r.integrity);
    expect(r.findings.some(f => ['chunk_truncado', 'sin_iend'].includes(f.code))).toBe(true);
    if (r.integrity === 'parcial') expect(r.repaired?.structureVerified).toBe(true);
  });
  it('cabecera IHDR dañada: irrecuperable, sin inventar dimensiones', () => {
    const b = makePng().slice(); b[20] ^= 0xff;
    const r = analyzePng(b);
    expect(r.integrity).toBe('irrecuperable'); expect(r.items.filter(i => i.kind === 'imagen-parcial')).toEqual([]);
  });
});

describe('JPEG', () => {
  it('íntegro estructuralmente, pero los píxeles NO se declaran verificados', async () => {
    const r = await rep('foto-integra.jpg');
    expect(r.integrity).toBe('integro');
    expect(r.items.find(i => i.kind === 'metadatos')!.preview).toMatch(/32×32/);
    expect(r.items.find(i => i.kind === 'imagen-parcial')!.verified).toBe(false);
    expect(r.limitations.join(' ')).toMatch(/No hay decodificación/);
  });
  it('truncado: localiza el daño y propone reparación estructural (EOI)', async () => {
    const r = await rep('foto-truncada.jpg');
    expect(r.integrity).toBe('parcial');
    expect(r.findings.some(f => f.code === 'sin_eoi')).toBe(true);
    expect(r.repaired?.structureVerified).toBe(true);
    expect(r.repaired!.bytes.length).toBe(fx('foto-truncada.jpg').length + 2);
    expect(r.repaired!.note).toMatch(/no existen/);
  });
  it('sin tablas o sin escaneo no se declara recuperable', () => {
    const b = makeJpeg(), t = new Uint8Array(b.length); t.set(b);
    expect(analyzeJpeg(b.slice(0, 40)).integrity).not.toBe('integro');
    expect(analyzeJpeg(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9)).integrity).toBe('irrecuperable');
  });
});

describe('PDF', () => {
  it('íntegro: xref válida, texto verificado por Adler-32', async () => {
    const r = await rep('documento-integro.pdf');
    expect(r.integrity).toBe('integro');
    const txt = r.items.filter(i => i.kind === 'texto' && i.verified).map(i => i.preview).join(' ');
    expect(txt).toContain('Hola Quetzal'); expect(txt).toContain('Recuperacion');
    expect(txt).toContain('Segunda pagina (sintetica)');
    expect(r.meta!.paginasEstimadas).toBe(2);
    expect(r.items.find(i => i.name === 'páginas')!.verified).toBe(false);   // heurística, no verificada
  });
  it('truncado: recupera texto y reconstruye xref con verificación', async () => {
    const r = await rep('documento-truncado.pdf');
    expect(r.integrity).not.toBe('integro');
    expect(r.items.some(i => i.kind === 'texto' && i.preview?.includes('Hola Quetzal'))).toBe(true);
    expect(r.repaired?.structureVerified).toBe(true);
    expect(analyzePdf(r.repaired!.bytes).integrity).toBe('integro');
  });
  it('xref inválida: se detecta y se repara', async () => {
    const r = await rep('documento-xref-roto.pdf');
    expect(r.findings.some(f => f.code === 'xref_invalido')).toBe(true);
    expect(r.repaired?.structureVerified).toBe(true);
  });
  it('flujo Flate corrupto: se registra el rango dañado y el texto de ese flujo NO se da por recuperado', () => {
    const b = makePdf().slice(), s = new TextDecoder('latin1').decode(b), at = s.indexOf('stream\n') + 7 + 6;
    b[at] ^= 0x55; b[at + 1] ^= 0x55;
    const r = analyzePdf(b);
    expect(r.findings.some(f => f.code === 'flujo_danado')).toBe(true);
    expect(r.damaged.length).toBeGreaterThan(0);
    expect(r.items.filter(i => i.kind === 'texto' && i.verified).map(i => i.preview).join('')).not.toContain('Hola Quetzal');
  });
  it('sin objetos: irrecuperable', () => {
    expect(analyzePdf(ascii('%PDF-1.4\nnada util aqui')).integrity).toBe('irrecuperable');
  });
});

describe('ZIP / DOCX / XLSX', () => {
  it('DOCX íntegro: CRC verificados y texto extraído', async () => {
    const r = await rep('informe-integro.docx');
    expect(r.integrity).toBe('integro'); expect(r.meta!.tipo).toBe('DOCX');
    const t = r.items.find(i => i.name.startsWith('texto del documento'))!;
    expect(t.verified).toBe(true); expect(t.preview).toContain('Informe sintetico'); expect(t.preview).toContain('Linea con & simbolo y tabulacion');
  });
  it('XLSX íntegro: hojas y textos compartidos', async () => {
    const r = await rep('inventario.xlsx');
    expect(r.meta!.tipo).toBe('XLSX');
    expect(r.items.find(i => i.name.startsWith('hojas'))!.preview).toContain('Inventario, Ventas');
    expect(r.items.find(i => i.name.startsWith('hojas'))!.preview).toContain('Cafe & miel');
  });
  it('entrada alterada: CRC detecta la corrupción, no se da por verificada y se reconstruye con el resto', async () => {
    const r = await rep('informe-alterado.docx');
    expect(r.integrity).toBe('parcial');
    expect(r.findings.some(f => f.code === 'entrada_crc')).toBe(true);
    const bad = r.items.filter(i => i.kind === 'entrada' && !i.verified);
    expect(bad.length).toBeGreaterThanOrEqual(1);
    expect(r.repaired?.structureVerified).toBe(true);
    expect(r.damaged.length).toBeGreaterThan(0);
  });
  it('sin directorio central: recorre cabeceras locales y recupera contenido verificable', async () => {
    const r = await rep('sin-directorio.zip');
    expect(r.findings.some(f => f.code === 'sin_eocd')).toBe(true);
    expect(r.findings.some(f => f.code === 'recorrido_por_cabeceras')).toBe(true);
    expect(r.items.some(i => i.kind === 'entrada' && i.verified)).toBe(true);
    expect(r.integrity).not.toBe('integro');
  });
  it('lee entradas Deflate reales (zip creado con zlib) y verifica CRC', () => {
    const data = new TextEncoder().encode('contenido '.repeat(500)), comp = new Uint8Array(deflateRawSync(data));
    const name = ascii('a.txt'), lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(8, 8, true); dv.setUint32(14, crc32(data), true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(data), true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); ch.set(name, 46);
    const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, ch.length, true); ev.setUint32(16, lh.length + comp.length, true);
    const zip = concat([lh, comp, ch, end]), z = readZip(zip);
    expect(z.entries.length).toBe(1);
    const x = extractEntry(zip, z.entries[0], DEFAULT_LIMITS, { left: 1e9 });
    expect(x.status).toBe('ok'); expect(Buffer.from(x.data!).equals(Buffer.from(data))).toBe(true);
  });
});

describe('exportación segura', () => {
  it('el ZIP exportado se relee y verifica; los nombres no pueden salir del directorio', async () => {
    const hostile = buildZip([{ name: '../../evil.txt', bytes: ascii('x') }, { name: '/abs/otro.txt', bytes: ascii('y') }, { name: 'C:\\w\\z.txt', bytes: ascii('z') }]);
    const z = readZip(hostile);
    expect(z.entries.map(e => e.name)).toEqual(['evil.txt', 'abs/otro.txt', 'w/z.txt']);
    for (const e of z.entries) expect(extractEntry(hostile, e, DEFAULT_LIMITS, { left: 1e9 }).status).toBe('ok');
    const r = await rep('informe-integro.docx');
    const out = exportRecovered(r), re = readZip(out);
    expect(re.entries.some(e => e.name === 'informe.json')).toBe(true);
    expect(re.entries.every(e => !e.name.includes('..') && !e.name.startsWith('/'))).toBe(true);
    expect(re.entries.every(e => extractEntry(out, e, DEFAULT_LIMITS, { left: 1e9 }).status === 'ok')).toBe(true);
  });
  it('el informe JSON no incluye bytes crudos y conserva los hashes', async () => {
    const r = await rep('informe-integro.docx'), j = JSON.parse(reportJson(r));
    expect(JSON.stringify(j)).not.toContain('"bytes"');
    expect(j.sha256).toBe(r.sha256); expect(j.items.some((i: { sha256?: string }) => i.sha256)).toBe(true);
  });
  it('analizar no modifica los bytes de entrada (original inmutable)', async () => {
    const b = makeDocx(), copy = b.slice();
    await analyzeFile(b, 'x.docx');
    expect(Buffer.from(b).equals(Buffer.from(copy))).toBe(true);
  });
});

describe('seguridad ante entradas hostiles', () => {
  it('bomba de descompresión: se limita y no agota memoria', () => {
    const data = new Uint8Array(30_000_000), comp = new Uint8Array(deflateRawSync(data));
    const name = ascii('bomba.bin'), lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(8, 8, true); dv.setUint32(14, crc32(data), true); dv.setUint32(18, comp.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); lh.set(name, 30);
    const ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(10, 8, true); cv.setUint32(16, crc32(data), true); cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true); ch.set(name, 46);
    const end = new Uint8Array(22), ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, ch.length, true); ev.setUint32(16, lh.length + comp.length, true);
    const r = analyzeZip(concat([lh, comp, ch, end]));
    expect(r.findings.some(f => f.code === 'entrada_bomba')).toBe(true);
    expect(r.items[0].verified).toBe(false);
  });
  it('un ZIP con nombres hostiles REALES (../ y ruta absoluta) se normaliza al leerlo y se avisa', () => {
    // buildZip normaliza al escribir; aquí se parchean los bytes para simular un archivo malicioso externo
    const z = buildZip([{ name: 'xx/evil.txt', bytes: ascii('1') }, { name: 'ab/abs.txt', bytes: ascii('2') }]);
    const patch = (b: Uint8Array, from: string, to: string) => { const s = new TextDecoder('latin1').decode(b); let i = -1; while ((i = s.indexOf(from, i + 1)) >= 0) for (let k = 0; k < to.length; k++) b[i + k] = to.charCodeAt(k); };
    patch(z, 'xx/', '../'); patch(z, 'ab/', '/a/');
    const raw = readZip(z);
    expect(raw.entries.map(e => e.name)).toEqual(['../evil.txt', '/a/abs.txt']);
    expect(raw.entries.map(e => e.safe)).toEqual(['evil.txt', 'a/abs.txt']);
    const r = analyzeZip(z);
    expect(r.findings.filter(f => f.code === 'ruta_peligrosa').length).toBe(2);
    expect(r.items.map(i => i.name)).toEqual(['evil.txt', 'a/abs.txt']);
    const out = readZip(exportRecovered({ items: r.items, repaired: undefined, name: 'x', size: 0, sha256: '', format: 'zip', label: '', category: 'comprimido', confidence: 'alta', signals: [], dangerous: false, elapsedMs: 0, integrity: 'integro', findings: [], damaged: [], limitations: [] }));
    expect(out.entries.every(e => !e.name.includes('..') && !e.name.startsWith('/'))).toBe(true);
  });  it('ningún truncamiento ni corrupción lanza excepciones (fuzz determinista)', async () => {
    const samples = [makePng(), makeJpeg(), makePdf(), makeDocx(), makeXlsx()];
    let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (const s of samples) {
      for (let cut = 0; cut < s.length; cut += Math.max(1, Math.floor(s.length / 25))) {
        const r = await analyzeFile(s.slice(0, cut), 'x'); expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      for (let k = 0; k < 15; k++) { const c = s.slice(); for (let j = 0; j < 4; j++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256); await analyzeFile(c, 'x'); }
    }
  });
  it('archivos que superan el límite de tamaño no se analizan', async () => {
    const r = await analyzeFile(new Uint8Array(2000), 'grande.png', { ...DEFAULT_LIMITS, maxFileBytes: 1000 });
    expect(r.integrity).toBe('no-analizado'); expect(r.findings[0].code).toBe('demasiado_grande');
  });
  it('el carving respeta el presupuesto de tiempo y lo informa', async () => {
    const r = await carveImage(buildDisk(), 'disco.img', { ...DEFAULT_LIMITS, maxMillis: 0 });
    expect(r.truncatedScan).toBe(true);
    expect(r.notes.join(' ')).toMatch(/tiempo agotado/i);
  });
});
describe('carving de imagen de disco (solo lectura)', () => {
  it('localiza PNG, JPEG, PDF y DOCX en sus sectores con hashes y distingue el sobrescrito', async () => {
    const disk = buildDisk(), before = disk.slice();
    const r = await carveImage(disk, 'disco.img');
    expect(Buffer.from(disk).equals(Buffer.from(before))).toBe(true);           // la imagen original no se modifica
    const by = (f: string) => r.candidates.filter(c => c.format === f);
    expect(by('png').length).toBeGreaterThanOrEqual(2);
    const png1 = r.candidates.find(c => c.format === 'png' && c.sectorStart === 8)!;
    expect(png1.aligned).toBe(true); expect(png1.endFound).toBe(true); expect(png1.integrity).toBe('integro');
    expect(r.candidates.find(c => c.format === 'jpeg' && c.sectorStart === 24)!.integrity).toBe('integro');
    expect(r.candidates.find(c => c.format === 'pdf' && c.sectorStart === 40)!.integrity).toBe('integro');
    expect(r.candidates.find(c => c.format === 'zip' && c.sectorStart === 64)!.report.meta!.tipo).toBe('DOCX');
    const over = r.candidates.find(c => c.format === 'png' && c.sectorStart === 100)!;
    expect(over.integrity).not.toBe('integro');                                // el sobrescrito no se declara recuperable
    expect(r.candidates.every(c => c.sha256 && /^[0-9a-f]{64}$/.test(c.sha256))).toBe(true);
    expect(r.notes.join(' ')).toMatch(/no hay reensamblado/i);
  });
  it('una imagen sin archivos no produce candidatos inventados', async () => {
    const r = await carveImage(new Uint8Array(20000).fill(0), 'vacio.img');
    expect(r.candidates).toEqual([]);
  });
  it('los candidatos están limitados', async () => {
    const png = makePng(4, 4, 1), many = concat(Array.from({ length: 30 }, () => png));
    const r = await carveImage(many, 'muchos.img', { ...DEFAULT_LIMITS, maxEntries: 5 });
    expect(r.candidates.length).toBeLessThanOrEqual(5); expect(r.truncatedScan).toBe(true);
  });
  it('deflate de node y fixtures PNG son consistentes (sanidad del generador)', () => {
    expect(analyzePng(makePng(32, 8, 2)).integrity).toBe('integro');
    expect(deflateSync(new Uint8Array(4)).length).toBeGreaterThan(0);
  });
});


