/**
 * Orquestador del módulo de recuperación de archivos.
 *   identify (firmas) → analizador del formato → informe con SHA-256, hallazgos, rangos dañados (y sectores),
 *   elementos recuperados verificados y reparación opcional. Nunca ejecuta ni escribe nada: solo lee bytes.
 */
import { sha256Hex } from '../ingest';
import { Deadline, DEFAULT_LIMITS, entropy, type Limits } from './core';
import { identify } from './identify';
import { pngAnalyzer } from './png';
import { jpegAnalyzer } from './jpeg';
import { pdfAnalyzer } from './pdf';
import { zipAnalyzer, buildZip } from './zip';
import { textAnalyzer } from './text';
import { gifAnalyzer, bmpAnalyzer, wavAnalyzer } from './media';
import { carve, type Carved, type CarveResult } from './carve';
import type { Analyzer, FileReport } from './types';

export const ANALYZERS: Record<string, Analyzer> = { png: pngAnalyzer, jpeg: jpegAnalyzer, pdf: pdfAnalyzer, zip: zipAnalyzer, text: textAnalyzer, gif: gifAnalyzer, bmp: bmpAnalyzer, wav: wavAnalyzer };
export * from './types';
export { DEFAULT_LIMITS, buildZip, identify, carve };

export async function analyzeFile(bytes: Uint8Array, name: string, limits: Limits = DEFAULT_LIMITS): Promise<FileReport> {
  const t0 = performance.now(), id = identify(bytes, name), sha = await sha256Hex(bytes);
  const base = { name: name.slice(0, 200), size: bytes.length, sha256: sha, format: id.id, label: id.label, category: id.category, confidence: id.confidence, signals: id.signals, dangerous: id.dangerous };
  const done = (r: Omit<FileReport, keyof typeof base | 'elapsedMs'>): FileReport => ({ ...base, ...r, elapsedMs: Math.round(performance.now() - t0) });
  if (bytes.length > limits.maxFileBytes) return done({ integrity: 'no-analizado', findings: [{ severity: 'aviso', code: 'demasiado_grande', message: `El archivo (${bytes.length} B) supera el límite de ${limits.maxFileBytes} B: no se analiza.` }], damaged: [], items: [], limitations: ['Límite de tamaño configurable.'] });
  if (id.dangerous) return done({ integrity: 'no-analizado', findings: [{ severity: 'aviso', code: 'ejecutable_no_ejecutado', message: `${id.label}: se identifica por firma pero NO se ejecuta ni se carga.` }], damaged: [], items: [], limitations: ['El análisis estático de programas pertenece al módulo Software Archaeology (diseño, sin implementar).'] });
  const an = id.analyzer ? ANALYZERS[id.analyzer] : null;
  if (!an) return done({ integrity: 'no-analizado', findings: [{ severity: 'info', code: 'sin_analizador', message: `${id.label} identificado por firma; todavía no hay analizador: no se verifica su integridad ni se extrae contenido.` }], damaged: [], items: [], limitations: ['Formato fuera de la matriz de capacidades implementadas.'] });
  let res;
  try { res = an.analyze(bytes, { name, deadline: new Deadline(limits.maxMillis), limits }); }
  catch (e) { return done({ integrity: 'no-analizado', findings: [{ severity: 'dano', code: 'error_interno', message: `El analizador falló con una entrada malformada: ${e instanceof Error ? e.message : String(e)}.` }], damaged: [], items: [], limitations: [] }); }
  if (res.integrity === 'irrecuperable') res.meta = { ...res.meta, entropiaBitsPorByte: Number(entropy(bytes).toFixed(2)) };
  for (const it of res.items) if (it.bytes) it.sha256 = await sha256Hex(it.bytes);
  if (res.repaired) res.repaired.sha256 = await sha256Hex(res.repaired.bytes);
  return done(res);
}

export interface CarveReport extends Omit<CarveResult, 'candidates'> { candidates: Array<Carved & { report: FileReport }>; name: string; sha256: string; size: number }
/** Busca archivos incrustados en una imagen en bruto y analiza cada candidato. */
export async function carveImage(bytes: Uint8Array, name: string, limits: Limits = DEFAULT_LIMITS): Promise<CarveReport> {
  const sha256 = await sha256Hex(bytes), r = carve(bytes, limits), candidates: CarveReport['candidates'] = [];
  for (const c of r.candidates) {
    const report = await analyzeFile(c.bytes, `${name}@${c.offset}.${c.format}`, limits);
    candidates.push({ ...c, integrity: report.integrity, sha256: report.sha256, report });
  }
  return { ...r, candidates, name, sha256, size: bytes.length };
}

/** JSON del informe sin bytes crudos (los hashes bastan para verificar). */
export function reportJson(r: FileReport | CarveReport): string {
  return JSON.stringify(r, (k, v) => (k === 'bytes' ? undefined : v), 2);
}
/** ZIP seguro con lo recuperado y verificado + el informe. Los nombres se normalizan; solo almacenado. */
export function exportRecovered(r: FileReport): Uint8Array {
  const enc = new TextEncoder(), files: Array<{ name: string; bytes: Uint8Array }> = [];
  for (const it of r.items) if (it.verified && it.bytes) files.push({ name: `recuperado/${it.name}`, bytes: it.bytes });
  for (const it of r.items) if (it.partialBytes) files.push({ name: `parcial-no-verificado/${it.name.replace(/[^\w.-]+/g, '_')}`, bytes: it.partialBytes });
  for (const it of r.items) if (it.kind === 'texto' && it.verified && it.preview !== undefined) files.push({ name: `texto/${it.name.replace(/[^\w.-]+/g, '_')}.txt`, bytes: enc.encode(it.preview) });
  if (r.repaired) files.push({ name: `reparado/${r.repaired.name}`, bytes: r.repaired.bytes });
  files.push({ name: 'informe.json', bytes: enc.encode(reportJson(r)) });
  return buildZip(files);
}
