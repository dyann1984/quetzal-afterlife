import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeFile, identify } from './index';
import { scanJson } from './json';
import { scanXml } from './xml';
import { splitCsv, detectDelimiter } from './csvfile';
import { readSqlite, columnsFromSql } from './sqlite';
import { invalidUtf8, fixMojibake, encode1252 } from './textutil';

const enc = new TextEncoder(), dec = new TextDecoder();
const run = (s: string | Uint8Array, name: string) => analyzeFile(typeof s === 'string' ? enc.encode(s) : s, name);

// ─── Identificación ─────────────────────────────────────────────────────────
describe('identificación de texto estructurado', () => {
  it('por contenido y por extensión', () => {
    expect(identify(enc.encode('  {"a":1}'), 'x.bin').id).toBe('json');
    expect(identify(enc.encode('<?xml version="1.0"?><a/>'), 'x.dat').id).toBe('xml');
    expect(identify(enc.encode('a,b\n1,2\n'), 'x.csv').id).toBe('csv');
    expect(identify(enc.encode('hola mundo'), 'nota.txt').id).toBe('txt');
    expect(identify(enc.encode('[1,2'), 'notas.txt').id).toBe('txt');   // .txt manda: no se reinterpreta
  });
  it('texto con bytes de control por daño: decide por extensión con confianza baja', () => {
    const b = enc.encode('{"clientes":[{"id":1,"nombre":"Ana"}]}'); b[5] = 0; b[6] = 1; b[7] = 2;
    const id = identify(b, 'clientes.json');
    expect(id.id).toBe('json'); expect(id.confidence).toBe('baja');
  });
});

// ─── UTF-8 y mojibake ───────────────────────────────────────────────────────
describe('texto: offsets exactos y doble codificación', () => {
  it('localiza cada byte UTF-8 inválido', () => {
    const b = Uint8Array.from([0x61, 0xc3, 0xa9, 0x62, 0xff, 0x63, 0xe2, 0x82]);
    const r = invalidUtf8(b); expect(r.offsets).toEqual([4, 6]); expect(r.total).toBe(2);
    expect(invalidUtf8(enc.encode('añoñ €𝄞')).total).toBe(0);
    expect(invalidUtf8(Uint8Array.from([0xc0, 0x80])).total).toBeGreaterThan(0);          // sobrelarga
    expect(invalidUtf8(Uint8Array.from([0xed, 0xa0, 0x80])).total).toBeGreaterThan(0);    // sustituto
  });
  it('revierte el mojibake solo si la ida y vuelta es exacta', async () => {
    const original = 'Año de fundación: 1998\nDirección: Calle Niños Héroes\nsin acentos';
    const broken = new TextDecoder('windows-1252').decode(enc.encode(original));
    expect(broken).toContain('Ã±');
    const fx = fixMojibake(broken)!; expect(fx.text).toBe(original); expect(fx.roundTrip).toBe(true);
    const r = await run(broken, 'datos.txt');
    expect(r.repaired?.structureVerified).toBe(true);
    expect(dec.decode(r.repaired!.bytes)).toBe(original);
    expect(r.findings.some(f => f.code === 'doble_codificacion')).toBe(true);
    expect(fixMojibake('texto normal con ñ y é')).toBeNull();
    expect(encode1252('漢')).toBeNull();
  });
  it('UTF-8 inválido: rango dañado exacto y transcodificación marcada como estimación', async () => {
    const b = Uint8Array.from([...enc.encode('Precio: '), 0xa3, ...enc.encode('20')]);   // £ en Latin-1
    const r = await run(b, 'precio.txt');
    expect(r.damaged[0].start).toBe(8);
    expect(r.repaired?.structureVerified).toBe(false);
    expect(dec.decode(r.repaired!.bytes)).toBe('Precio: £20');
  });
});

// ─── JSON ───────────────────────────────────────────────────────────────────
describe('JSON', () => {
  const doc = JSON.stringify({ empresa: 'Quetzal', clientes: [{ id: 1, nombre: 'Ana', saldo: 10.5 }, { id: 2, nombre: 'Luis', activo: true }, { id: 3, nombre: 'Eva', notas: null }] }, null, 2);
  it('íntegro', async () => {
    const r = await run(doc, 'c.json'); expect(r.integrity).toBe('integro'); expect(r.items[0].verified).toBe(true);
  });
  it('comentarios y comas finales: reparación sin pérdida validada con JSON.parse', async () => {
    const s = '{\n // config\n "a": [1, 2, 3,],\n /* bloque */ "b": {"c": "x//y",},\n}';
    const r = await run(s, 'cfg.json');
    expect(r.integrity).toBe('parcial'); expect(r.repaired?.structureVerified).toBe(true);
    expect(JSON.parse(dec.decode(r.repaired!.bytes))).toEqual({ a: [1, 2, 3], b: { c: 'x//y' } });
    expect(r.repaired!.note).toMatch(/No se perdió ningún dato/);
  });
  it('truncado: conserva hasta el último valor completo y cierra la pila', async () => {
    const cut = doc.slice(0, doc.indexOf('"Luis"') + 3);
    const r = await run(cut, 'c.json');
    const out = JSON.parse(dec.decode(r.repaired!.bytes));
    expect(out.empresa).toBe('Quetzal'); expect(out.clientes).toEqual([{ id: 1, nombre: 'Ana', saldo: 10.5 }, { id: 2 }]);
    expect(r.repaired!.structureVerified).toBe(true);
    expect(r.damaged[0].end).toBe(enc.encode(cut).length);
    expect(r.findings.some(f => f.code === 'json_truncado')).toBe(true);
  });
  it('error de sintaxis a mitad: localiza línea/columna y no inventa el resto', async () => {
    const s = '{"a": 1, "b": [1, 2 3], "c": 4}';
    const r = await run(s, 'x.json');
    expect(r.findings.find(f => f.code === 'json_sintaxis')!.message).toMatch(/columna 21/);
    expect(JSON.parse(dec.decode(r.repaired!.bytes))).toEqual({ a: 1, b: [1, 2] });
  });
  it('nada recuperable', async () => {
    const r = await run('{"sin', 'x.json'); expect(r.integrity).toBe('irrecuperable'); expect(r.repaired).toBeUndefined();
  });
  it('fuzz: cualquier truncamiento produce JSON válido o se declara irrecuperable, y nunca añade valores', () => {
    for (let n = 0; n <= doc.length; n += 3) {
      const s = doc.slice(0, n), sc = scanJson(s, true);
      if (sc.ok) { expect(() => JSON.parse(s)).not.toThrow(); continue; }
      if (sc.values === 0) continue;
      const kept = s.slice(0, sc.cut).replace(/\s+$/, '');
      const closers = [...sc.cutStack].reverse().map(c => (c === '{' ? '}' : ']')).join('');
      expect(() => JSON.parse(kept + closers), `n=${n}`).not.toThrow();
      expect(doc.startsWith(kept)).toBe(true);
    }
  });
});

// ─── XML ────────────────────────────────────────────────────────────────────
describe('XML', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- inventario -->\n<inventario fecha="2026-10-31">\n  <item sku="A1"><nombre>Tornillo</nombre><cant>40</cant></item>\n  <item sku="B2"><nombre><![CDATA[Tuerca <M8>]]></nombre><cant>12</cant></item>\n</inventario>\n';
  it('íntegro', async () => { const r = await run(xml, 'i.xml'); expect(r.integrity).toBe('integro'); expect(r.meta?.raiz).toBe('inventario'); });
  it('& sin escapar: reparación sin pérdida', async () => {
    const r = await run('<a><b>Pan & Sal</b><c x="1 & 2"/></a>', 'a.xml');
    expect(dec.decode(r.repaired!.bytes)).toBe('<a><b>Pan &amp; Sal</b><c x="1 &amp; 2"/></a>\n');
    expect(r.repaired!.structureVerified).toBe(true);
  });
  it('truncado: cierra las etiquetas abiertas en orden', async () => {
    const cut = xml.slice(0, xml.indexOf('<cant>12') + 4);
    const r = await run(cut, 'i.xml');
    const out = dec.decode(r.repaired!.bytes);
    expect(out.trim().endsWith('</item></inventario>')).toBe(true);
    expect(r.repaired!.structureVerified).toBe(true);
    expect(scanXml(out).ok).toBe(true);
  });
  it('etiquetas cruzadas y atributos duplicados se localizan', () => {
    expect(scanXml('<a><b></a></b>').error!.message).toMatch(/no corresponde/);
    expect(scanXml('<a x="1" x="2"/>').error!.message).toMatch(/duplicado/);
    expect(scanXml('<a/><b/>').error!.message).toMatch(/más de un elemento raíz/);
  });
  it('fuzz: cada truncamiento da XML bien formado o irrecuperable', async () => {
    for (let n = 0; n <= xml.length; n += 5) {
      const r = await run(xml.slice(0, n) || ' ', 'i.xml');
      if (r.repaired) expect(scanXml(dec.decode(r.repaired.bytes)).ok, `n=${n}`).toBe(true);
    }
  });
  it('no resuelve entidades externas (XXE)', async () => {
    const s = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>';
    const r = await run(s, 'x.xml'); expect(r.integrity).toBe('integro');
    expect(JSON.stringify(r)).not.toContain('root:');
  });
});

// ─── CSV irregular ──────────────────────────────────────────────────────────
describe('CSV irregular', () => {
  it('delimitador y comillas RFC 4180 con saltos de línea', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n4;5;6\n').delim).toBe(';');
    const rows = splitCsv('a,b\n"x, y","línea 1\nlínea 2"\n', ',');
    expect(rows[1].fields).toEqual(['x, y', 'línea 1\nlínea 2']);
  });
  it('filas irregulares a cuarentena; tabla limpia verificada', async () => {
    const s = 'id;nombre;saldo\n1;Ana;10\n2;Luis\n3;Eva;30;extra\n4;"Sofía; hija";40\n5;"sin cerrar;50\n';
    const r = await run(s, 'clientes.csv');
    expect(r.integrity).toBe('danado');   // 3 de 5 filas irregulares
    expect(r.meta?.['filas consistentes']).toBe(2); expect(r.meta?.['filas en cuarentena']).toBe(3);
    const z = await analyzeFile(r.repaired!.bytes, 'recuperado.zip');
    expect(z.integrity).toBe('integro');
    const clean = dec.decode(z.items.find(e => e.name.endsWith('consistente.csv'))!.bytes!);
    expect(clean).toBe('id;nombre;saldo\n1;Ana;10\n4;"Sofía; hija";40\n');
    const q = dec.decode(z.items.find(e => e.name.endsWith('cuarentena.csv'))!.bytes!);
    expect(q).toContain('3,'); expect(q).toContain('2 campo(s) en lugar de 3');
    expect(r.repaired!.structureVerified).toBe(true);
  });
  it('CSV regular es íntegro', async () => { expect((await run('a,b\n1,2\n3,4\n', 'x.csv')).integrity).toBe('integro'); });
});

// ─── SQLite (archivos REALES creados con el SQLite de Node) ───────────────────
type Db = { exec(s: string): void; close(): void };
async function makeDb(sqlSetup: string): Promise<Uint8Array | null> {
  let mod: { DatabaseSync: new (p: string) => Db };
  try { mod = await import('node:sqlite' as string) as typeof mod; } catch { return null; }
  const dir = mkdtempSync(join(tmpdir(), 'qa-sqlite-')), file = join(dir, 'prueba.db');
  try { const db = new mod.DatabaseSync(file); db.exec(sqlSetup); db.close(); return new Uint8Array(readFileSync(file)); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
const SETUP = `PRAGMA page_size=1024; PRAGMA journal_mode=DELETE;
CREATE TABLE clientes(id INTEGER PRIMARY KEY, nombre TEXT, saldo REAL, nota TEXT);
CREATE TABLE "ventas detalle"(folio TEXT, cliente INTEGER, total INTEGER, foto BLOB);
CREATE INDEX ix_cli ON clientes(nombre);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<400)
INSERT INTO clientes SELECT x, 'Cliente ' || x, x * 1.5, CASE WHEN x % 50 = 0 THEN printf('%.900c', 'n') END FROM n;
INSERT INTO "ventas detalle" VALUES ('V-1', 1, 9007199254740993, x'00ff10'), ('V-2', 2, -5, NULL);`;

describe('SQLite real', () => {
  it('lee esquema, filas (rowid alias, enteros grandes, blobs, desbordamiento) de una base íntegra', async () => {
    const b = await makeDb(SETUP); if (!b) return;
    const r = readSqlite(b);
    expect(r.pageSize).toBe(1024); expect(r.problems.filter(p => p.severity === 'dano')).toEqual([]);
    const cl = r.tables.find(t => t.name === 'clientes')!;
    expect(cl.rows.length).toBe(400); expect(cl.rows[0]).toEqual([1, 'Cliente 1', 1.5, null]);
    expect(cl.rows[49][3]).toBe('n'.repeat(900));                        // payload con páginas de desbordamiento
    const v = r.tables.find(t => t.name === 'ventas detalle')!;
    expect(v.rows[0][2]).toBe('9007199254740993'); expect(v.rows[1][2]).toBe(-5);
    expect(r.indexes).toBe(1);
    const rep = await analyzeFile(b, 'prueba.db');
    expect(rep.integrity).toBe('integro'); expect(rep.items.find(i => i.name === 'clientes.csv')!.verified).toBe(true);
  });
  it('página de datos dañada: se informa el rango y se recuperan las demás filas', async () => {
    const b = await makeDb(SETUP); if (!b) return;
    const r0 = readSqlite(b), root = r0.tables.find(t => t.name === 'clientes')!.rootpage;
    // daña una hoja del árbol de clientes: busca una página de tipo 13 alcanzable desde la raíz
    const page = (n: number) => b.subarray((n - 1) * 1024, n * 1024);
    const kids: number[] = []; const p = page(root); const n = (p[3] << 8) | p[4];
    for (let k = 0; k < n; k++) { const c = (p[12 + k * 2] << 8) | p[13 + k * 2]; kids.push(((p[c] << 24) | (p[c + 1] << 16) | (p[c + 2] << 8) | p[c + 3]) >>> 0); }
    const victim = kids[1]; const d = b.slice(); d.fill(0xee, (victim - 1) * 1024, victim * 1024);
    const r = await analyzeFile(d, 'prueba.db');
    expect(r.integrity).toBe('parcial');
    expect(r.damaged.some(x => x.start === (victim - 1) * 1024)).toBe(true);
    const rows = Number(r.meta?.filas);
    expect(rows).toBeGreaterThan(300); expect(rows).toBeLessThan(402);
  });
  it('truncado: lo declarado frente a lo presente', async () => {
    const b = await makeDb(SETUP); if (!b) return;
    const r = await analyzeFile(b.slice(0, b.length - 4096), 'prueba.db');
    expect(r.findings.some(f => /truncado/i.test(f.message))).toBe(true);
    expect(r.integrity).not.toBe('integro');
  });
  it('cabecera destruida: irrecuperable sin inventar nada', async () => {
    const b = await makeDb(SETUP); if (!b) return;
    const d = b.slice(); d[16] = 3; d[17] = 0;
    const r = await analyzeFile(d, 'prueba.db');
    expect(r.integrity).toBe('irrecuperable'); expect(r.items).toEqual([]);
  });
  it('nombres de columna desde el SQL', () => {
    expect(columnsFromSql('CREATE TABLE t("a b" TEXT, [c] INT, `d`, e REAL, PRIMARY KEY(e))')).toEqual(['a b', 'c', 'd', 'e']);
  });
});

// ─── Traducción de mensajes compuestos (las partes unidas con «; » se traducen por separado) ─────
import { translateMessage } from '../i18n/msgs';
describe('mensajes en inglés', () => {
  it('notas de reparación compuestas', () => {
    expect(translateMessage('se quitaron 1 comentario(s); se quitaron 5 coma(s) final(es). No se perdió ningún dato.')).toBe('1 comment(s) removed; 5 trailing comma(s) removed. No data was lost.');
    expect(translateMessage('Línea 3: 3 campo(s) en lugar de 4.')).toBe('Line 3: 3 field(s) instead of 4.');
    expect(translateMessage('Error XML en línea 1, columna 8: </b> no corresponde a <a>.')).toBe('XML error at line 1, column 8: </b> does not match <a>.');
  });
});

// ─── Robustez: entradas hostiles o aleatorias nunca lanzan ni se cuelgan ─────────────────────────
import { sqliteFixture } from './sqlite-fixture';
describe('fuzz de robustez', () => {
  const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  it('SQLite con bytes alterados al azar: termina sin excepción y sin filas incoherentes', () => {
    const base = sqliteFixture(), R = rng(42), t0 = Date.now();
    for (let n = 0; n < 150; n++) {
      const b = base.slice(); const hits = 1 + Math.floor(R() * 40);
      for (let k = 0; k < hits; k++) b[Math.floor(R() * b.length)] = Math.floor(R() * 256);
      const r = readSqlite(b);
      for (const t of r.tables) for (const row of t.rows) expect(Array.isArray(row)).toBe(true);
    }
    expect(Date.now() - t0).toBeLessThan(15000);
  });
  it('JSON, XML, CSV y texto con basura aleatoria: siempre un informe', async () => {
    const R = rng(7);
    for (let n = 0; n < 60; n++) {
      const b = Uint8Array.from({ length: 50 + Math.floor(R() * 400) }, () => (R() < 0.7 ? 32 + Math.floor(R() * 95) : Math.floor(R() * 256)));
      for (const name of ['x.json', 'x.xml', 'x.csv', 'x.txt']) { const r = await analyzeFile(b, name); expect(r.integrity).toBeTruthy(); }
    }
  });
  it('anidamiento extremo no desborda la pila', async () => {
    const deep = '['.repeat(100000), x = '<a>'.repeat(5000);
    expect((await analyzeFile(enc.encode(deep), 'd.json')).findings.some(f => /profundidad/.test(f.message))).toBe(true);
    expect((await analyzeFile(enc.encode(x), 'd.xml')).findings.some(f => /profundidad/.test(f.message))).toBe(true);
  });
});
