import Papa from 'papaparse';
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 10000;
export type CsvResult = { headers:string[]; rows:string[][]; warnings:string[] };
export function analyzeCsv(bytes: Uint8Array, name: string): CsvResult {
 if (!name.toLowerCase().endsWith('.csv')) throw new Error('Selecciona un archivo con extensión .csv.');
 if (!bytes.length) throw new Error('El archivo está vacío.');
 if (bytes.length > MAX_BYTES) throw new Error('El archivo supera el límite de 2 MB.');
 let text:string;
 try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch { throw new Error('Codificación inválida: solo se admite UTF-8 en esta fase.'); }
 if (text.includes('\0')) throw new Error('El archivo contiene bytes nulos y no parece CSV de texto.');
 const parsed = Papa.parse<string[]>(text, {skipEmptyLines:'greedy', preview:MAX_ROWS+2});
 const parseError = parsed.errors.find(error => error.code !== 'UndetectableDelimiter');
 if (parseError) throw new Error('CSV inválido: ' + parseError.message);
 const [rawHeaders,...rows] = parsed.data;
 if (!rawHeaders || !rawHeaders.length || rawHeaders.every(h=>!h.trim())) throw new Error('Falta la fila de encabezados.');
 const headers=rawHeaders.map(h=>h.trim());
 if (headers.some(h=>!h)) throw new Error('Los encabezados no pueden estar vacíos.');
 if (new Set(headers.map(h=>h.toLowerCase())).size!==headers.length) throw new Error('Hay encabezados duplicados.');
 if (rows.length>MAX_ROWS) throw new Error('El archivo supera el límite de 10 000 filas.');
 const bad=rows.findIndex(row=>row.length!==headers.length);
 if (bad!==-1) throw new Error('Número de columnas inconsistente en la fila de datos ' + (bad+1) + '.');
 return {headers,rows,warnings:rows.length ? [] : ['El archivo contiene encabezados pero no filas de datos.']};
}
