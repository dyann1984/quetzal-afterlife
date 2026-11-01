// Convierte los colores #rrggbb de la hoja de estilos y de los estilos en línea de los componentes en variables CSS
// (--c-rrggbb), con los valores oscuros originales por defecto y una paleta clara derivada para data-theme="light".
// Los recuadros que deben seguir siendo oscuros (holograma y experiencia 3D) redefinen las variables oscuras.
// Uso: node tools/i18n/themeify.mjs   (idempotente: si ya hay variables, no vuelve a transformar)
import fs from 'node:fs';

const CSS = 'app/globals.css';
const TSX = ['app/page.tsx', 'app/engine.tsx', 'app/file-recovery.tsx'];
const HEX = /#[0-9a-fA-F]{6}\b/g;
const toHsl = h => { const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let H = 0, S = 0; if (mx !== mn) { const d = mx - mn; S = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H /= 6; } return [H, S, l]; };
const fromHsl = ([h, s, l]) => { const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; let r, g, b; if (s === 0) r = g = b = l; else { const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); } return '#' + [r, g, b].map(x => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0')).join(''); };
// oscuros (fondos, bordes) → claros; claros y medios (texto, acentos) → más oscuros para mantener el contraste sobre fondo claro
const light = h => { const [H, S, l] = toHsl(h); if (l < .3) return fromHsl([H, S * .45, 1 - l]); if (l >= .8) return fromHsl([H, S * .8, Math.max(.07, 1 - l)]); return fromHsl([H, Math.min(1, S * 1.05), Math.max(.2, Math.min(.46, .62 - (l - .3) * .42))]); };

let css = fs.readFileSync(CSS, 'utf8'); const bom = css.charCodeAt(0) === 0xFEFF; if (bom) css = css.slice(1);
if (css.includes('--c-')) {   // ya transformado: solo se recalcula la paleta clara a partir de la oscura
  const dm = /:root\{color-scheme:dark;([^}]*)\}/.exec(css);
  const hexes = [...dm[1].matchAll(/--c-([0-9a-f]{6}):#[0-9a-f]{6}/g)].map(m => '#' + m[1]);
  const block = ':root[data-theme=light]{color-scheme:light;' + hexes.map(h => '--c-' + h.slice(1) + ':' + light(h)).join(';') + '}';
  css = css.replace(/:root\[data-theme=light\]\{color-scheme:light;[^}]*\}/, () => block);
  fs.writeFileSync(CSS, (bom ? '﻿' : '') + css); console.error('Paleta clara recalculada.'); process.exit(0);
}
const tsx = Object.fromEntries(TSX.map(f => [f, fs.readFileSync(f, 'utf8')]));
const all = new Set([...css.match(HEX) ?? [], ...Object.values(tsx).flatMap(s => s.match(HEX) ?? [])].map(h => h.toLowerCase()));
const v = h => `var(--c-${h.slice(1).toLowerCase()})`;
css = css.replace(HEX, h => v(h));
for (const f of TSX) fs.writeFileSync(f, tsx[f].replace(HEX, h => v(h)));
const dark = [...all].map(h => `--c-${h.slice(1)}:${h}`).join(';'), lite = [...all].map(h => `--c-${h.slice(1)}:${light(h)}`).join(';');
const head = `:root{color-scheme:dark;${dark}}\n:root[data-theme=light]{color-scheme:light;${lite}}\n/* recuadros que siguen oscuros en el tema claro: holograma y experiencia 3D */\n.hero-holo,.exp-overlay{color-scheme:dark;${dark}}\n`;
fs.writeFileSync(CSS, (bom ? '﻿' : '') + head + css);
console.error(`${all.size} colores → variables`);
