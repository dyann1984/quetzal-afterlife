/**
 * Analizador de texto plano: detecta BOM/codificación, localiza cada secuencia UTF-8 inválida por offset exacto y
 * revierte la doble codificación (mojibake «Ã©» → «é») solo cuando la ida y vuelta lo demuestra. Nunca interpreta el contenido.
 */
import { damaged } from './core';
import type { AnalysisResult, Analyzer } from './types';
import { decodeText, fixMojibake } from './textutil';

export function analyzeText(b: Uint8Array, name = 'texto.txt'): AnalysisResult {
  const d = decodeText(b), enc = new TextEncoder();
  const nul = (d.text.match(/\u0000/g) ?? []).length;
  const findings: AnalysisResult['findings'] = [], dmg: AnalysisResult['damaged'] = [], limitations = ['La codificación se estima; sin BOM no hay forma de confirmarla.'];
  if (d.invalid.total) {
    findings.push({ severity: 'dano', code: 'secuencias_invalidas', message: `${d.invalid.total} secuencia(s) UTF-8 inválidas; la primera en el byte ${d.invalid.offsets[0]}.`, offset: d.invalid.offsets[0] });
    for (const o of d.invalid.offsets.slice(0, 16)) dmg.push(damaged(o, o + 1, 'secuencia UTF-8 inválida'));
  }
  if (nul) findings.push({ severity: 'aviso', code: 'bytes_nulos', message: `${nul} carácter(es) nulo(s).` });

  let repaired: AnalysisResult['repaired'];
  const moji = d.estimated ? null : fixMojibake(d.text);
  if (moji) {
    findings.push({ severity: 'aviso', code: 'doble_codificacion', message: `Doble codificación detectada (UTF-8 leído como Windows-1252): ${moji.before} secuencia(s) afectadas.` });
    const base = name.replace(/\.[^.]*$/, '');
    repaired = { name: `${base}.utf8-corregido.txt`, bytes: enc.encode(moji.text), structureVerified: moji.roundTrip && moji.after < moji.before,
      note: `Se revirtió la doble codificación en ${moji.segments} línea(s); quedan ${moji.after} secuencia(s) sospechosas. Cada línea se verificó con ida y vuelta exacta.` };
  } else if (d.estimated) {
    repaired = { name: `${name.replace(/\.[^.]*$/, '')}.utf8.txt`, bytes: enc.encode(d.text), structureVerified: false,
      note: 'Transcodificado de Windows-1252 a UTF-8. La codificación de origen es una estimación: revise los acentos.' };
    limitations.push('Los bytes inválidos se interpretaron como Windows-1252; si el original usaba otra página de códigos, algunos caracteres serán distintos.');
  }

  const clean = d.invalid.total === 0 && nul === 0 && !moji;
  const verified = clean && !d.estimated;
  return {
    integrity: clean ? 'integro' : (d.invalid.total + nul) / Math.max(b.length, 1) < 0.05 ? 'parcial' : 'danado',
    findings, damaged: dmg,
    items: [{ kind: 'texto', name: 'contenido', size: b.length, verified, basis: d.basis, preview: d.text.slice(0, 300) }],
    repaired, limitations,
    meta: { codificacion: d.encoding, caracteres: d.text.length, lineas: d.text.split('\n').length },
  };
}
export const textAnalyzer: Analyzer = { id: 'text', label: 'Texto', analyze: (b, ctx) => analyzeText(b, ctx.name) };
