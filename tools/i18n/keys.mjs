// Extrae las claves de traducción (primer argumento literal de tr/tf) de los componentes. Uso: node tools/i18n/keys.mjs > claves.json
import fs from 'node:fs';
import path from 'node:path';
const out = new Set();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) walk(p); }
  else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) && !/quetzalito[\\/]/.test(p) && !/i18n[\\/](en|msgs|index|hooks|store)/.test(p)) {
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/\b(?:tr|tf)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) out.add((m[1] ?? m[2]).replace(/\\'/g, "'").replace(/\\n/g, '\n').replace(/\\\\/g, '\\'));
  }
});
walk('app');
console.log(JSON.stringify([...out].sort(), null, 1));
