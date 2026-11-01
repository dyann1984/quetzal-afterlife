// Aplica reemplazos exactos de texto a partir de un archivo de especificación. Formato:
//   @@@ ruta/archivo
//   <<<
//   texto original
//   ===
//   texto nuevo
//   >>>
// Falla (y lo dice) si el texto original no aparece exactamente una vez, salvo que se marque "<<<*" (todas las apariciones).
import fs from 'node:fs';

const spec = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
let file = null, body = '', n = 0, bad = 0;
const blocks = spec.split('\n@@@ ').map((b, i) => i === 0 ? b.replace(/^@@@ /, '') : b);
for (const b of blocks) {
  const nl = b.indexOf('\n'); file = b.slice(0, nl).trim(); body = b.slice(nl + 1);
  if (!file) continue;
  let src = fs.readFileSync(file, 'utf8'); const bom = src.charCodeAt(0) === 0xFEFF; if (bom) src = src.slice(1);
  const eol = src.includes('\r\n') ? '\r\n' : '\n'; src = src.replace(/\r\n/g, '\n');
  const re = /<<<(\*?)\n([\s\S]*?)\n===\n([\s\S]*?)\n>>>/g; let m;
  while ((m = re.exec(body))) {
    const all = m[1] === '*', oldT = m[2], newT = m[3];
    const count = src.split(oldT).length - 1;
    if (count === 0 || (!all && count > 1)) { console.error(`✗ ${file}: ${count} coincidencias para: ${oldT.slice(0, 90)}`); bad++; continue; }
    src = all ? src.split(oldT).join(newT) : src.replace(oldT, () => newT); n++;
  }
  fs.writeFileSync(file, (bom ? '﻿' : '') + src.replace(/\n/g, eol));
}
console.error(`${n} reemplazos aplicados, ${bad} con problemas`);
process.exit(bad ? 1 : 0);
