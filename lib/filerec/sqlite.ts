/**
 * Analizador SQLite 3 de solo lectura (sin motor SQLite: lectura directa del formato de archivo documentado).
 *   · cabecera: tamaño de página, páginas declaradas frente a reales, codificación, truncamiento;
 *   · recorre sqlite_master y cada B-tree de tabla con control de ciclos y punteros fuera de rango;
 *   · decodifica cada registro (varints, tipos seriales, páginas de desbordamiento) y lo acepta solo si su
 *     cabecera es coherente con la longitud del payload.
 * Recuperación: las filas legibles de cada tabla se exportan a CSV y el esquema a SQL. Las páginas dañadas
 * se informan por rango de bytes; sus filas se dan por perdidas, nunca se rellenan.
 */
import { damaged, u16be, u32be } from './core';
import type { AnalysisResult, Analyzer, RecoveredItem } from './types';

type Val = null | number | string | Uint8Array;
export interface SqliteTable { name: string; rootpage: number; sql: string; columns: string[]; rows: Val[][]; lostCells: number; badPages: number[] }
export interface SqliteRead {
  ok: boolean; pageSize: number; pages: number; declared: number; encoding: string;
  tables: SqliteTable[]; indexes: number; problems: Array<{ page?: number; message: string; severity: 'aviso' | 'dano' }>;
}

const MAGIC = 'SQLite format 3\u0000';
const ENC: Record<number, string> = { 1: 'utf-8', 2: 'utf-16le', 3: 'utf-16be' };

function varint(b: Uint8Array, o: number): [number, number] {
  let v = 0;
  for (let k = 0; k < 8; k++) { const x = b[o + k]; if (x === undefined) return [NaN, k]; v = v * 128 + (x & 0x7f); if (!(x & 0x80)) return [v, k + 1]; }
  const x = b[o + 8]; if (x === undefined) return [NaN, 8];
  return [v * 256 + x, 9];
}
const serialLen = (t: number) => (t <= 4 ? t : t === 5 ? 6 : t === 6 || t === 7 ? 8 : t < 12 ? 0 : t % 2 === 0 ? (t - 12) / 2 : (t - 13) / 2);

function decodeRecord(p: Uint8Array, dec: TextDecoder): Val[] | null {
  const [hs, n] = varint(p, 0); if (!Number.isFinite(hs) || hs < n || hs > p.length) return null;
  const types: number[] = []; let o = n;
  while (o < hs) { const [t, k] = varint(p, o); if (!Number.isFinite(t) || t === 10 || t === 11) return null; types.push(t); o += k; }
  if (o !== hs) return null;
  const total = hs + types.reduce((a, t) => a + serialLen(t), 0);
  if (total !== p.length) return null;                        // la cabecera debe describir exactamente el payload
  const out: Val[] = []; o = hs;
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  for (const t of types) {
    const len = serialLen(t);
    if (t === 0) out.push(null);
    else if (t === 8) out.push(0); else if (t === 9) out.push(1);
    else if (t >= 1 && t <= 6) {
      let v = BigInt(0); for (let k = 0; k < len; k++) v = (v << BigInt(8)) | BigInt(p[o + k]);
      const bits = BigInt(len * 8); if (v >= (BigInt(1) << (bits - BigInt(1)))) v -= BigInt(1) << bits;
      out.push(v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString());
    } else if (t === 7) out.push(dv.getFloat64(o));
    else if (t % 2 === 1) out.push(dec.decode(p.subarray(o, o + len)));
    else out.push(p.slice(o, o + len));
    o += len;
  }
  return out;
}

/** Nombres de columna a partir del CREATE TABLE (aproximado; si falla, c1…cn). */
export function columnsFromSql(sql: string): string[] {
  const a = sql.indexOf('('), z = sql.lastIndexOf(')'); if (a < 0 || z < a) return [];
  const body = sql.slice(a + 1, z), parts: string[] = []; let depth = 0, cur = '';
  for (const c of body) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  return parts.map(x => x.trim()).filter(x => x && !/^(constraint|primary|unique|check|foreign)\b/i.test(x))
    .map(x => { const m = /^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))/.exec(x); return m ? (m[1] ?? m[2] ?? m[3] ?? m[4]) : x; });
}
/** Índice de la columna INTEGER PRIMARY KEY (alias del rowid: SQLite guarda NULL en el registro). */
export function rowidAlias(sql: string): number {
  const a = sql.indexOf('('), z = sql.lastIndexOf(')'); if (a < 0) return -1;
  const parts: string[] = []; let depth = 0, cur = '';
  for (const c of sql.slice(a + 1, z)) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += c; }
  parts.push(cur);
  return parts.map(x => x.trim()).filter(x => x && !/^(constraint|primary|unique|check|foreign)\b/i.test(x)).findIndex(x => /^\S+\s+integer\s+primary\s+key\b(?!.*\bdesc\b)/i.test(x));
}

export function readSqlite(b: Uint8Array, maxRows = 100000): SqliteRead {
  const problems: SqliteRead['problems'] = [];
  const bad = (message: string, page?: number, severity: 'aviso' | 'dano' = 'dano') => problems.push({ page, message, severity });
  const head = new TextDecoder('latin1').decode(b.subarray(0, 16));
  const empty = { ok: false, pageSize: 0, pages: 0, declared: 0, encoding: '?', tables: [], indexes: 0, problems };
  if (b.length < 100 || head !== MAGIC) { bad('Cabecera SQLite ausente o cortada'); return empty; }
  const raw = u16be(b, 16), pageSize = raw === 1 ? 65536 : raw;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1))) { bad(`Tamaño de página inválido (${raw})`); return empty; }
  const reserved = b[20], U = pageSize - reserved;
  if (U < 480) { bad('Espacio reservado por página inválido'); return { ...empty, pageSize }; }
  const pages = Math.floor(b.length / pageSize), declared = u32be(b, 28), sizeValid = u32be(b, 92) === u32be(b, 24) && declared > 0;
  const encoding = ENC[u32be(b, 56)] ?? 'utf-8'; if (!ENC[u32be(b, 56)]) bad(`Codificación de texto desconocida (${u32be(b, 56)}); se asume UTF-8`, undefined, 'aviso');
  if (b.length % pageSize) bad(`El tamaño del archivo no es múltiplo de la página: sobran ${b.length % pageSize} bytes`, undefined, 'aviso');
  if (sizeValid && declared > pages) bad(`Truncado: la cabecera declara ${declared} páginas y solo hay ${pages}`);
  const dec = new TextDecoder(encoding);

  type Cell = { page: number; payload: Uint8Array | null; rowid: number };
  /** Recorre un B-tree de tabla; devuelve los payloads de las celdas hoja (null = celda ilegible). */
  const walk = (root: number): { cells: Cell[]; badPages: number[] } => {
    const cells: Cell[] = [], badPages: number[] = [], seen = new Set<number>(), todo = [root];
    while (todo.length && cells.length < maxRows) {
      const pg = todo.pop()!;
      if (pg < 1 || pg > pages) { bad(`Puntero a la página ${pg}, fuera del archivo (${pages} páginas)`, pg); badPages.push(pg); continue; }
      if (seen.has(pg)) { bad(`Ciclo en el árbol: la página ${pg} aparece dos veces`, pg); continue; }
      seen.add(pg);
      const base = (pg - 1) * pageSize, h = base + (pg === 1 ? 100 : 0), type = b[h];
      if (type !== 13 && type !== 5) { bad(`La página ${pg} no es una página de tabla válida (tipo ${type})`, pg); badPages.push(pg); continue; }
      const n = u16be(b, h + 3), ptrs = h + (type === 5 ? 12 : 8);
      if (ptrs + n * 2 > base + pageSize) { bad(`La página ${pg} declara ${n} celdas que no caben`, pg); badPages.push(pg); continue; }
      if (type === 5) {
        const kids: number[] = [];
        for (let k = 0; k < n; k++) { const c = base + u16be(b, ptrs + k * 2); if (c < ptrs || c + 4 > base + pageSize) { bad(`Celda ${k} de la página ${pg} fuera de la página`, pg); continue; } kids.push(u32be(b, c)); }
        kids.push(u32be(b, h + 8));
        for (let k = kids.length - 1; k >= 0; k--) todo.push(kids[k]);   // de izquierda a derecha: filas en orden de rowid
        continue;
      }
      for (let k = 0; k < n; k++) {
        const c = base + u16be(b, ptrs + k * 2);
        if (c < ptrs + n * 2 || c >= base + pageSize) { cells.push({ page: pg, payload: null, rowid: NaN }); continue; }
        const [P, a] = varint(b, c), [rowid, r] = varint(b, c + a), start = c + a + r;
        if (!Number.isFinite(P) || P < 0 || P > 1 << 30) { cells.push({ page: pg, payload: null, rowid }); continue; }
        const X = U - 35, M = Math.floor(((U - 12) * 32) / 255) - 23, K = M + ((P - M) % (U - 4));
        const local = P <= X ? P : K <= X ? K : M;
        if (start + local > base + pageSize) { cells.push({ page: pg, payload: null, rowid }); continue; }
        const out = new Uint8Array(P); out.set(b.subarray(start, start + local));
        let got = local, next = P > local ? u32be(b, start + local) : 0, guard = 0, broken = false;
        while (got < P) {
          if (next < 1 || next > pages || guard++ > pages) { broken = true; break; }
          const ob = (next - 1) * pageSize, take = Math.min(U - 4, P - got);
          out.set(b.subarray(ob + 4, ob + 4 + take), got); got += take; next = u32be(b, ob);
        }
        cells.push({ page: pg, payload: broken ? null : out, rowid });
      }
    }
    return { cells, badPages };
  };

  const master = walk(1), tables: SqliteTable[] = []; let indexes = 0;
  for (const c of master.cells) {
    const rec = c.payload && decodeRecord(c.payload, dec);
    if (!rec || rec.length < 5) { bad('Una entrada de sqlite_master es ilegible', c.page); continue; }
    const [type, name, , rootpage, sql] = rec;
    if (type === 'index') { indexes++; continue; }
    if (type !== 'table' || typeof rootpage !== 'number' || rootpage < 1) continue;
    tables.push({ name: String(name), rootpage, sql: String(sql ?? ''), columns: columnsFromSql(String(sql ?? '')), rows: [], lostCells: 0, badPages: [] });
  }
  if (!master.cells.length) bad('La tabla sqlite_master no contiene entradas legibles');
  for (const t of tables) {
    const w = walk(t.rootpage), ipk = rowidAlias(t.sql); t.badPages = w.badPages;
    for (const c of w.cells) {
      const rec = c.payload && decodeRecord(c.payload, dec);
      if (!rec) { t.lostCells++; continue; }
      if (ipk >= 0 && rec[ipk] === null && Number.isFinite(c.rowid)) rec[ipk] = c.rowid;
      t.rows.push(rec);
    }
    if (t.lostCells) bad(`${t.name}: ${t.lostCells} registro(s) ilegibles`, undefined);
  }
  return { ok: true, pageSize, pages, declared: sizeValid ? declared : pages, encoding, tables, indexes, problems };
}

const csvCell = (v: Val) => v === null ? '' : v instanceof Uint8Array ? `[blob ${v.length} B]` : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const safeFile = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'tabla';

export function analyzeSqlite(b: Uint8Array): AnalysisResult {
  const r = readSqlite(b), enc = new TextEncoder();
  const findings: AnalysisResult['findings'] = r.problems.slice(0, 40).map((p, k) => ({ severity: p.severity, code: `sqlite_${k}`, message: `${p.message}.` }));
  const limitations = ['Solo se leen tablas (B-tree de tabla); los índices no se reconstruyen.', 'No se recuperan filas de páginas libres ni del WAL.', 'Se exportan datos, no un archivo .sqlite reparado.'];
  const meta: Record<string, string | number> = { 'tamaño de página': r.pageSize, paginas: r.pages, tablas: r.tables.length, indices: r.indexes, codificacion: r.encoding };
  if (!r.ok) return { integrity: 'irrecuperable', findings, damaged: [damaged(0, Math.min(b.length, 100), 'cabecera SQLite inválida')], items: [], meta, limitations };
  const badPages = new Set(r.problems.flatMap(p => (p.page && p.page <= r.pages ? [p.page] : [])));
  const dmg = [...badPages].sort((a, z) => a - z).slice(0, 32).map(p => damaged((p - 1) * r.pageSize, p * r.pageSize, `página ${p} ilegible o inconsistente`));
  const items: RecoveredItem[] = [];
  const schema = r.tables.map(t => `${t.sql};`).join('\n\n') + '\n';
  if (r.tables.length) items.push({ kind: 'estructura', name: 'esquema.sql', size: schema.length, verified: true, basis: 'leído de sqlite_master con registros coherentes', preview: schema.slice(0, 300), bytes: enc.encode(schema) });
  let rows = 0, lost = 0;
  for (const t of r.tables) {
    rows += t.rows.length; lost += t.lostCells;
    const width = Math.max(t.columns.length, ...t.rows.map(x => x.length), 0);
    const cols = Array.from({ length: width }, (_, k) => t.columns[k] ?? `c${k + 1}`);
    const csv = [cols.join(','), ...t.rows.map(x => x.map(csvCell).join(','))].join('\n') + '\n';
    const complete = !t.lostCells && !t.badPages.length;
    items.push({ kind: 'entrada', name: `${safeFile(t.name)}.csv`, size: csv.length, verified: true,
      basis: complete ? `${t.rows.length} fila(s); árbol completo y registros coherentes con su payload` : `${t.rows.length} fila(s) decodificadas y coherentes; ${t.lostCells} perdida(s) y ${t.badPages.length} página(s) del árbol ilegibles`,
      preview: csv.slice(0, 300), bytes: enc.encode(csv) });
  }
  meta.filas = rows; if (lost) meta['filas perdidas'] = lost;
  const hard = r.problems.some(p => p.severity === 'dano');
  return { integrity: !hard ? 'integro' : rows === 0 ? 'danado' : 'parcial', findings, damaged: dmg, items, meta, limitations };
}
export const sqliteAnalyzer: Analyzer = { id: 'sqlite', label: 'SQLite 3', analyze: b => analyzeSqlite(b) };
