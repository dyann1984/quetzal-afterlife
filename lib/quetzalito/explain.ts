/**
 * Quetzalito explica un resultado de recuperación. Función pura: TODO el texto se arma con datos del informe real
 * (formato, hallazgos, rangos dañados, etapas, validación, limitaciones). Si el motor no dijo algo, Quetzalito tampoco.
 */
import type { ResurrectionRun } from '../filerec/protocol';
import { OUTCOME_LABEL } from '../filerec/protocol';
import { translateMessage } from '../i18n/msgs';

export type Lang = 'es' | 'en';
export interface Explanation { headline: string; sections: Array<{ title: string; lines: string[] }>; next: string }

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KiB` : `${n} B`);

export function explainRun(run: ResurrectionRun, lang: Lang): Explanation {
  const es = lang === 'es', T = (s: string) => (es ? s : translateMessage(s)), r = run.report, id = run.identification;
  const stage = (k: string) => run.stages.find(s => s.id === k);
  const sections: Explanation['sections'] = [];
  const outcome = T(OUTCOME_LABEL[run.outcome]);

  // ¿Qué es?
  const what: string[] = [];
  if (id) what.push(es ? `Lo identifiqué como ${id.label} con confianza ${id.confidence}: ${T(id.signals[0] ?? '')}.` : `I identified it as ${id.label} with ${translateMessage(id.confidence)} confidence: ${T(id.signals[0] ?? '')}.`);
  if (id?.signals.some(s => s.includes('no coincide'))) what.push(es ? 'Ojo: la extensión no coincide con el contenido; manda el contenido.' : 'Note: the extension does not match the content; the content wins.');
  if (id?.dangerous) what.push(es ? 'Es un programa: no lo ejecuto ni lo analizo por dentro.' : 'It is a program: I do not execute it or look inside it.');
  sections.push({ title: es ? '¿Qué es?' : 'What is it?', lines: what });

  if (r && r.integrity !== 'no-analizado') {
    // Daño
    const dano = r.findings.filter(f => f.severity === 'dano'), avisos = r.findings.filter(f => f.severity === 'aviso');
    const dmgBytes = r.damaged.reduce((a, d) => a + Math.max(0, d.end - d.start), 0);
    const dmg: string[] = [];
    if (!dano.length && !avisos.length) dmg.push(es ? 'No encontré daños: todas las comprobaciones pasaron.' : 'I found no damage: every check passed.');
    for (const f of [...dano, ...avisos].slice(0, 4)) dmg.push(T(f.message));
    if (r.damaged.length) dmg.push(es ? `${r.damaged.length} rango(s) dañado(s), unos ${kb(dmgBytes)} del archivo; el primero empieza en el byte ${r.damaged[0].start}.` : `${r.damaged.length} damaged range(s), about ${kb(dmgBytes)} of the file; the first starts at byte ${r.damaged[0].start}.`);
    sections.push({ title: es ? 'Daño detectado' : 'Damage detected', lines: dmg });

    // Qué se hizo
    const did: string[] = [];
    const rec = stage('reconstruccion'), val = stage('validacion');
    if (rec?.detail) did.push(T(rec.detail));
    if (val?.detail && val.state !== 'omitido') did.push(T(val.detail));
    const verified = r.items.filter(i => i.verified).length;
    if (r.items.length) did.push(es ? `${verified} de ${r.items.length} elemento(s) extraído(s) tienen una comprobación objetiva que los respalda.` : `${verified} of ${r.items.length} extracted item(s) are backed by an objective check.`);
    sections.push({ title: es ? 'Qué hice' : 'What I did', lines: did });

    // Qué no se recuperó y límites
    const lost: string[] = [];
    for (const d of r.damaged.slice(0, 3)) lost.push(T(d.reason));
    for (const l of r.limitations.slice(0, 2)) lost.push(T(l));
    if (run.recoverability.intactBytesPct !== null && run.recoverability.intactBytesPct < 100) lost.push(es ? `El ${run.recoverability.intactBytesPct} % de los bytes está fuera de las zonas dañadas; lo que había en esas zonas no se inventa.` : `${run.recoverability.intactBytesPct} % of the bytes lie outside damaged zones; what was inside those zones is not invented.`);
    if (lost.length) sections.push({ title: es ? 'Lo que no se recuperó y los límites' : 'What was not recovered, and the limits', lines: lost });
  } else if (r) {
    sections.push({ title: es ? 'Diagnóstico' : 'Diagnosis', lines: r.findings.slice(0, 2).map(f => T(f.message)) });
  }

  const next: Record<ResurrectionRun['outcome'], [string, string]> = {
    integro: ['No hace falta repararlo. Puedes descargar el informe JSON como constancia (incluye el SHA-256).', 'No repair is needed. You can download the JSON report as a record (it includes the SHA-256).'],
    'reparado-validado': ['Descarga el archivo reparado: superó un re-análisis completo. Conserva el original sin tocar.', 'Download the repaired file: it passed a full re-analysis. Keep the original untouched.'],
    'recuperacion-parcial': ['Descarga lo recuperado y revisa la parte perdida con otra fuente (un respaldo o una versión anterior).', 'Download what was recovered and review the lost part against another source (a backup or an earlier version).'],
    'reparacion-sin-verificar': ['La reparación es una propuesta: ábrela y revísala antes de usarla.', 'The repair is a proposal: open it and review it before using it.'],
    'solo-diagnostico': ['Con este archivo no hay una reparación verificable. Busca un respaldo o una versión anterior y compáralos aquí.', 'There is no verifiable repair for this file. Look for a backup or an earlier version and compare them here.'],
    irrecuperable: ['No queda estructura que recuperar. Solo un respaldo o una copia anterior pueden devolver esos datos.', 'No structure is left to recover. Only a backup or an earlier copy can bring that data back.'],
    'no-analizado': ['Este formato todavía no tiene analizador; revisa la Matriz de capacidades.', 'This format has no analyser yet; check the Capability matrix.'],
  };
  return { headline: `${run.name}: ${outcome}.`, sections: sections.filter(s => s.lines.length), next: next[run.outcome][es ? 0 : 1] };
}
