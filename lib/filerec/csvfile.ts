/**
 * Analizador de CSV/TSV irregulares (archivo suelto, independiente del Laboratorio tabular).
 * Detecta delimitador por consistencia, recorre con comillas RFC 4180 y localiza cada fila con un número de campos
 * distinto del encabezado, comillas sin cerrar y finales de línea mezclados.
 * Reparación verificable sin inventar celdas: un CSV con el encabezado y SOLO las filas consistentes, y otro
 * archivo de «cuarentena» con las filas irregulares tal cual, cada una con su número de línea original.
 */
import { damaged } from './core';
import { buildZip } from './zip';
import type { AnalysisResult, Analyzer } from './types';
import { byteOffset, decodeText } from './textutil';

export interface CsvRow { line: number; start: number; end: number; fields: string[]; unterminated: boolean }
const DELIMS = [',', ';', '\t', '|'] as const;

/** Recorre el texto en registros (comillas con saltos de línea incluidas). `start`/`end` son índices de carácter. */
export function splitCsv(s: string, delim: string, maxRows = 200000): CsvRow[] {
  const rows: CsvRow[] = []; let i = 0, line = 1;
  while (i < s.length && rows.length < maxRows) {
    const start = i, startLine = line, fields: string[] = []; let field = '', inQ = false, unterminated = false;
    for (;;) {
      if (i >= s.length) { if (inQ) unterminated = true; fields.push(field); break; }
      const c = s[i];
      if (inQ) {
        if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        if (c === '\n') line++;
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { inQ = true; i++; continue; }
      if (c === delim) { fields.push(field); field = ''; i++; continue; }
      if (c === '\r' && s[i + 1] === '\n') { fields.push(field); i += 2; line++; break; }
      if (c === '\n' || c === '\r') { fields.push(field); i++; line++; break; }
      field += c; i++;
    }
    const end = i;
    if (!(fields.length === 1 && fields[0] === '' && !unterminated)) rows.push({ line: startLine, start, end, fields, unterminated });
  }
  return rows;
}

/** Elige el delimitador cuya cuenta de campos es más estable (y > 1) en las primeras 50 filas. */
export function detectDelimiter(s: string, ext = ''): { delim: string; consistency: number } {
  if (ext === 'tsv') return { delim: '\t', consistency: 1 };
  const sample = s.slice(0, 64 * 1024); let best = { delim: ',', consistency: 0, width: 1 };
  for (const d of DELIMS) {
    const rows = splitCsv(sample, d, 50); if (!rows.length) continue;
    const counts = new Map<number, number>(); for (const r of rows) counts.set(r.fields.length, (counts.get(r.fields.length) ?? 0) + 1);
    const [width, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const consistency = width > 1 ? n / rows.length : 0;
    if (consistency > best.consistency || (consistency === best.consistency && width > best.width)) best = { delim: d, consistency, width };
  }
  return { delim: best.delim, consistency: best.consistency };
}

const q = (v: string, d: string) => (/[",\r\n]/.test(v) || v.includes(d) ? `"${v.replace(/"/g, '""')}"` : v);
const DELIM_NAME: Record<string, string> = { ',': 'coma', ';': 'punto y coma', '\t': 'tabulador', '|': 'barra vertical' };

export function analyzeCsvFile(b: Uint8Array, name = 'datos.csv'): AnalysisResult {
  const d = decodeText(b), s = d.text, ext = name.toLowerCase().split('.').pop() ?? '';
  const findings: AnalysisResult['findings'] = [], dmg: AnalysisResult['damaged'] = [];
  const limitations = ['Las filas irregulares no se corrigen: se apartan en cuarentena para revisión humana.', 'El delimitador se detecta por consistencia; un archivo muy irregular puede confundirlo.'];
  if (d.invalid.total) findings.push({ severity: 'dano', code: 'secuencias_invalidas', message: `${d.invalid.total} secuencia(s) UTF-8 inválidas; la primera en el byte ${d.invalid.offsets[0]}.`, offset: d.invalid.offsets[0] });
  const { delim, consistency } = detectDelimiter(s, ext);
  const rows = splitCsv(s, delim);
  const meta: Record<string, string | number> = { codificacion: d.encoding, delimitador: DELIM_NAME[delim], filas: Math.max(rows.length - 1, 0) };
  if (!rows.length) return { integrity: 'irrecuperable', findings: [...findings, { severity: 'dano', code: 'csv_vacio', message: 'El archivo no contiene filas.' }], damaged: [], items: [], meta, limitations };
  const header = rows[0], width = header.fields.length; meta.columnas = width;
  if (width < 2 || consistency < 0.5) findings.push({ severity: 'aviso', code: 'csv_delimitador_incierto', message: `Delimitador poco consistente (${Math.round(consistency * 100)} % de filas con el mismo número de campos).` });
  const crlf = (s.match(/\r\n/g) ?? []).length, lf = (s.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf && lf) findings.push({ severity: 'aviso', code: 'csv_finales_mezclados', message: `Finales de línea mezclados: ${crlf} CRLF y ${lf} LF.` });
  const names = header.fields.map(f => f.trim()), dupes = names.filter((n, k) => n && names.indexOf(n) !== k);
  if (dupes.length) findings.push({ severity: 'aviso', code: 'csv_encabezado_duplicado', message: `Columnas repetidas en el encabezado: ${[...new Set(dupes)].join(', ')}.` });

  const good: CsvRow[] = [], bad: Array<CsvRow & { why: string }> = [];
  for (const r of rows.slice(1)) {
    if (r.unterminated) bad.push({ ...r, why: 'comillas sin cerrar hasta el final del archivo' });
    else if (r.fields.length !== width) bad.push({ ...r, why: `${r.fields.length} campo(s) en lugar de ${width}` });
    else good.push(r);
  }
  for (const r of bad.slice(0, 50)) findings.push({ severity: 'dano', code: r.unterminated ? 'csv_comillas' : 'csv_ancho', message: `Línea ${r.line}: ${r.why}.`, offset: byteOffset(s, r.start, d.bomBytes) });
  if (bad.length > 50) findings.push({ severity: 'aviso', code: 'csv_mas', message: `… y ${bad.length - 50} fila(s) irregulares más.` });
  for (const r of bad.slice(0, 32)) dmg.push(damaged(byteOffset(s, r.start, d.bomBytes), byteOffset(s, r.end, d.bomBytes), `fila irregular (línea ${r.line})`));
  meta['filas consistentes'] = good.length; meta['filas en cuarentena'] = bad.length;

  const preview = [header, ...good.slice(0, 4)].map(r => r.fields.join(' | ')).join('\n');
  if (!bad.length && !d.invalid.total)
    return { integrity: 'integro', findings, damaged: [], meta, limitations: limitations.slice(1),
      items: [{ kind: 'estructura', name: 'tabla CSV', size: b.length, verified: true, basis: `todas las filas tienen ${width} campos`, preview }] };

  const enc = new TextEncoder(), base = name.replace(/\.[^.]*$/, '');
  const clean = [header, ...good].map(r => r.fields.map(v => q(v, delim)).join(delim)).join('\n') + '\n';
  const quarantine = ['linea_original,motivo,contenido_original', ...bad.map(r => [String(r.line), q(r.why, ','), q(s.slice(r.start, r.end).replace(/\r?\n$/, ''), ',')].join(','))].join('\n') + '\n';
  const check = splitCsv(clean, delim), valid = check.length === good.length + 1 && check.every(r => r.fields.length === width && !r.unterminated);
  const zip = buildZip([{ name: `${base}.consistente.csv`, bytes: enc.encode(clean) }, { name: `${base}.cuarentena.csv`, bytes: enc.encode(quarantine) }]);
  const ratio = good.length / Math.max(rows.length - 1, 1);
  return {
    integrity: ratio >= 0.5 ? 'parcial' : 'danado', findings, damaged: dmg, meta, limitations,
    items: [
      { kind: 'estructura', name: 'filas consistentes', size: clean.length, verified: valid, basis: valid ? `al volver a leerlo, las ${good.length} filas tienen ${width} campos` : 'la tabla limpia no supera la relectura', preview },
      { kind: 'texto', name: 'filas en cuarentena', size: quarantine.length, verified: false, basis: 'copiadas tal cual del original para revisión humana', preview: quarantine.slice(0, 300) },
    ],
    repaired: { name: `${base}.recuperado.zip`, bytes: zip, structureVerified: valid,
      note: `${good.length} fila(s) consistentes conservadas; ${bad.length} fila(s) irregulares apartadas en cuarentena con su línea original. No se rellenó ni se recortó ninguna celda.` },
  };
}
export const csvFileAnalyzer: Analyzer = { id: 'csv', label: 'CSV', analyze: (b, ctx) => analyzeCsvFile(b, ctx.name) };
