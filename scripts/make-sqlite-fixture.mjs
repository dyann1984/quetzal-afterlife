// Genera lib/filerec/sqlite-fixture.ts: una base SQLite REAL creada con el SQLite de Node (datos sintéticos).
// Uso: node scripts/make-sqlite-fixture.mjs   (Node 22.13+). El resultado es determinista salvo la versión de SQLite.
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'qa-fx-')), file = join(dir, 'tienda.db');
const db = new DatabaseSync(file);
db.exec(`PRAGMA page_size=1024; PRAGMA journal_mode=DELETE;
CREATE TABLE clientes(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, ciudad TEXT, alta TEXT);
CREATE TABLE ventas(folio TEXT PRIMARY KEY, cliente INTEGER REFERENCES clientes(id), total REAL, fecha TEXT);
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<120)
INSERT INTO clientes SELECT x, 'Cliente sintético ' || x, CASE x % 4 WHEN 0 THEN 'Tecámac' WHEN 1 THEN 'Ecatepec' WHEN 2 THEN 'Texcoco' ELSE 'Zumpango' END, printf('2024-%02d-%02d', 1 + x % 12, 1 + x % 28) FROM n;
WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<200)
INSERT INTO ventas SELECT printf('V-%04d', x), 1 + (x * 7) % 120, round(50 + (x * 37) % 900 + 0.5, 2), printf('2025-%02d-%02d', 1 + x % 12, 1 + x % 28) FROM n;`);
db.close();
const b = readFileSync(file); rmSync(dir, { recursive: true, force: true });
const b64 = b.toString('base64').match(/.{1,120}/g).join('\\\n');
writeFileSync(new URL('../lib/filerec/sqlite-fixture.ts', import.meta.url),
`/** Base SQLite REAL (generada por scripts/make-sqlite-fixture.mjs con el SQLite de Node). Datos SINTÉTICOS. ${b.length} bytes. */
const B64 = '${b64}';
export function sqliteFixture(): Uint8Array {
  const s = typeof atob === 'function' ? atob(B64) : Buffer.from(B64, 'base64').toString('latin1');
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
`);
console.log('ok', b.length);
