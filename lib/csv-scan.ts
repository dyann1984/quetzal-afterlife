/**
 * lib/csv-scan.ts — Lectura tolerante de texto delimitado
 * Quetzal Afterlife · Resurrection Engine
 *
 * Extrae filas aun cuando la estructura sea irregular y documenta cada anomalía
 * con su línea. No ejecuta ni interpreta el contenido (sin fórmulas).
 */

import { detectEncoding, type Finding } from './dbf-scan';

export interface CsvRow { line: number; cells: string[] }

export interface CsvScan {
  delimiter: string;
  encoding: string;
  encodingBasis: string;
  headers: string[];
  rows: CsvRow[];
  findings: Finding[];
  truncatedQuote: boolean;
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).slice(0, 10).filter(l => l.length > 0);
  let best = ',', bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts = lines.map(l => l.split(d).length - 1);
    if (counts.length === 0 || counts[0] === 0) continue;
    const consistent = counts.filter(c => c === counts[0]).length;
    const score = consistent * 100 + counts[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function scanCsv(bytes: Uint8Array, maxRows = 10_000): CsvScan {
  const findings: Finding[] = [];
  const enc = detectEncoding(bytes.subarray(0, 8192));
  let text = new TextDecoder(enc.encoding === 'ascii' ? 'utf-8' : enc.encoding).decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = detectDelimiter(text);

  const rows: CsvRow[] = [];
  let cells: string[] = [], cur = '', inQuotes = false, line = 1, rowLine = 1, sawAny = false;
  const pushRow = () => {
    cells.push(cur);
    if (!(cells.length === 1 && cells[0] === '' && !sawAny)) rows.push({ line: rowLine, cells });
    cells = []; cur = ''; sawAny = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else { if (ch === '\n') line++; cur += ch; }
    } else if (ch === '"' && cur === '') { inQuotes = true; sawAny = true; }
    else if (ch === delimiter) { cells.push(cur); cur = ''; sawAny = true; }
    else if (ch === '\n') { pushRow(); line++; rowLine = line; }
    else if (ch === '\r') { /* se ignora; \n cierra la fila */ }
    else { cur += ch; sawAny = true; }
    if (rows.length > maxRows) { findings.push({ severity: 'aviso', code: 'limite_filas', message: `Se alcanzó el límite de ${maxRows} filas.` }); break; }
  }
  const truncatedQuote = inQuotes;
  if (cur !== '' || cells.length > 0) pushRow();
  if (truncatedQuote) findings.push({ severity: 'dano', code: 'comilla_sin_cerrar', message: `Una comilla abierta en la línea ${rowLine} no se cierra antes del fin del archivo; la última fila puede estar truncada.`, record: rows.length });

  const headers = rows.length ? rows[0].cells.map(h => h.trim()) : [];
  if (new Set(headers).size !== headers.length) findings.push({ severity: 'aviso', code: 'encabezados_duplicados', message: 'Hay encabezados repetidos.' });
  const dataRows = rows.slice(1);
  for (const r of dataRows) {
    if (r.cells.length !== headers.length) {
      findings.push({ severity: 'dano', code: 'fila_irregular', message: `Línea ${r.line}: ${r.cells.length} celdas, se esperaban ${headers.length}.`, record: r.line });
    }
  }
  return { delimiter, encoding: enc.encoding, encodingBasis: enc.basis, headers, rows: dataRows, findings, truncatedQuote };
}
