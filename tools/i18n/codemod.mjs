// Envuelve en t('…') los textos visibles de JSX (texto y atributos de accesibilidad) y registra las claves.
// Uso: node tools/i18n/codemod.mjs app/page.tsx ...  → reescribe los archivos y escribe tools/i18n/keys.json
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const ATTRS = /^(placeholder|title|aria-label|alt|label|aria-description)$/;
const LETTERS = /[A-Za-zÀ-ÿ]{2,}/;
const dec = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
const keys = new Set();

for (const file of process.argv.slice(2)) {
  let src = fs.readFileSync(file, 'utf8');
  const bom = src.charCodeAt(0) === 0xFEFF; if (bom) src = src.slice(1);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const visit = n => {
    if (ts.isJsxText(n)) {
      const raw = src.slice(n.getFullStart(), n.getEnd());
      const body = dec(raw);
      if (LETTERS.test(body)) {
        const lead = (raw.match(/^\s*/) || [''])[0], trail = (raw.match(/\s*$/) || [''])[0];
        const core = dec(raw).split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(' ');
        const keepL = lead && !/\n/.test(lead) ? lead : '', keepT = trail && !/\n/.test(trail) ? trail : '';
        keys.add(core);
        edits.push([n.getFullStart(), n.getEnd(), `${keepL}{tr(${q(core)})}${keepT}`]);
      }
    } else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && ATTRS.test(n.name.getText()) && LETTERS.test(n.initializer.text)) {
      keys.add(n.initializer.text);
      edits.push([n.initializer.getStart(), n.initializer.getEnd(), `{tr(${q(n.initializer.text)})}`]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  edits.sort((a, b) => b[0] - a[0]).forEach(([s, e, t]) => { src = src.slice(0, s) + t + src.slice(e); });
  if (edits.length && !/from '.*lib\/i18n'/.test(src)) {
    const rel = path.relative(path.dirname(file), 'lib/i18n').replace(/\\/g, '/');
    const importRe = /^import .*$/gm; let last = 0, m; while ((m = importRe.exec(src))) last = m.index + m[0].length;
    src = src.slice(0, last) + `\nimport {tr} from '${rel.startsWith('.') ? rel : './' + rel}';` + src.slice(last);
  }
  fs.writeFileSync(file, (bom ? '﻿' : '') + src);
  console.error(`${file}: ${edits.length} textos envueltos`);
}
fs.writeFileSync('tools/i18n/keys.json', JSON.stringify([...keys].sort(), null, 1));
console.error(`${keys.size} claves → tools/i18n/keys.json`);
