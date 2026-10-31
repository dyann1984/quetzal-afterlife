/** Analizador de texto plano: detecta BOM/codificación y cuenta secuencias inválidas. Nunca interpreta el contenido. */
import { damaged } from './core';
import type { AnalysisResult, Analyzer } from './types';

export function analyzeText(b: Uint8Array): AnalysisResult {
  let enc = 'utf-8', start = 0, basis = 'UTF-8 válido';
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) { start = 3; basis = 'BOM UTF-8'; }
  else if (b[0] === 0xff && b[1] === 0xfe) { enc = 'utf-16le'; start = 2; basis = 'BOM UTF-16 LE'; }
  else if (b[0] === 0xfe && b[1] === 0xff) { enc = 'utf-16be'; start = 2; basis = 'BOM UTF-16 BE'; }
  const dec = (e: string) => new TextDecoder(e, { fatal: false }).decode(b.subarray(start));
  let text = dec(enc), bad = (text.match(/�/g) ?? []).length;
  if (enc === 'utf-8' && bad > 0) { const alt = dec('windows-1252'); text = alt; enc = 'windows-1252'; basis = 'no es UTF-8 válido; decodificado como Windows-1252 (estimación)'; bad = 0; }
  const nul = (text.match(/\u0000/g) ?? []).length;
  const verified = bad === 0 && nul === 0 && !basis.includes('estimación');
  return {
    integrity: bad === 0 && nul === 0 ? 'integro' : bad / Math.max(text.length, 1) < 0.05 ? 'parcial' : 'danado',
    findings: [...(bad ? [{ severity: 'dano' as const, code: 'secuencias_invalidas', message: `${bad} secuencia(s) inválidas en ${enc}.` }] : []), ...(nul ? [{ severity: 'aviso' as const, code: 'bytes_nulos', message: `${nul} carácter(es) nulo(s).` }] : [])],
    damaged: bad ? [damaged(0, Math.min(b.length, 1), `${bad} secuencias inválidas (posición exacta no localizada)`)] : [],
    items: [{ kind: 'texto', name: 'contenido', size: b.length, verified, basis, preview: text.slice(0, 300) }],
    limitations: ['La codificación se estima; sin BOM no hay forma de confirmarla.'],
    meta: { codificacion: enc, caracteres: text.length },
  };
}
export const textAnalyzer: Analyzer = { id: 'text', label: 'Texto', analyze: b => analyzeText(b) };
