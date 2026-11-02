import { describe, it, expect } from 'vitest';
import { buildLabExamples, runLab } from './lab';
import { explainReport } from './explain';

describe('explicación determinista (no IA)', () => {
  it('declara su origen y es idéntica ante la misma entrada', async () => {
    const run = await runLab(buildLabExamples()[1]), a = explainReport(run.report), b = explainReport(run.report);
    expect(a).toEqual(b);
    expect(a.source.es).toMatch(/reglas deterministas/); expect(a.source.en).toMatch(/not an AI model/);
  });
  it('cada ejemplo explica el daño con frases de reglas y sin prometer de más', async () => {
    for (const ex of buildLabExamples()) {
      const r = (await runLab(ex)).report, e = explainReport(r), all = JSON.stringify(e);
      expect(e.kind.es).toContain('Tipo probable'); expect(e.next.length).toBeGreaterThan(0);
      if (ex.id === 'png-noise') { expect(e.reading.es).toMatch(/no se inventa/); expect(all).not.toMatch(/recuperaci[oó]n completa/i); expect(e.damage.length).toBeGreaterThan(0); }
      if (ex.id === 'png-crc') expect(e.reading.es).toMatch(/completo/);
      if (ex.id === 'txt-partial') expect(e.reading.es).toMatch(/parcial/i);
      for (const d of e.damage) expect(d.es && d.en).toBeTruthy();
    }
  });
});
