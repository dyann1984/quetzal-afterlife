import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';

const tsx=readFileSync('app/quetzalito/Quetzalito.tsx','utf8'),css=readFileSync('app/quetzalito/quetzalito.css','utf8'),page=readFileSync('app/page.tsx','utf8'),avatar=readFileSync('app/quetzalito/Avatar.tsx','utf8');

describe('Quetzalito: estructura de accesibilidad, temas y movimiento (comprobación estática; el comportamiento se probó en el navegador)',()=>{
 it('diálogo accesible, teclado y registro de mensajes',()=>{
  expect(tsx).toMatch(/role="dialog"/);expect(tsx).toMatch(/aria-labelledby/);expect(tsx).toMatch(/role="log"/);expect(tsx).toMatch(/aria-live="polite"/);
  expect(tsx).toMatch(/e\.key==='Escape'/);expect(tsx).toMatch(/fabRef\.current\?\.focus\(\)/);expect(tsx).toMatch(/inputRef\.current\?\.focus\(\)/);
  expect(tsx).toMatch(/aria-expanded/);expect(tsx).toMatch(/aria-pressed/);expect(tsx).toMatch(/htmlFor=/);
  expect(avatar).toMatch(/aria-hidden="true"/);
 });
 it('recuerda abierto/minimizado, usa el idioma y tema globales y valida las secciones antes de navegar',()=>{
  expect(tsx).toMatch(/setPrefs\(\{open:true/);expect(tsx).toMatch(/setPrefs\(\{min:/);expect(tsx).toMatch(/setLang\(l\)/);expect(tsx).toMatch(/setTheme\(/);expect(tsx).toMatch(/useUi\(\)/);
  expect(tsx).toMatch(/SECTION_IDS as readonly string\[\]\)\.includes\(goto\)/);
 });
 it('CSS: tema claro y oscuro, movimiento reducido y móvil',()=>{
  expect(css).toMatch(/\.qz-root\[data-qz-theme=light\]/);expect(css).toMatch(/@media\(prefers-reduced-motion:reduce\)\{\.qz-root \*[^}]*animation:none!important[^}]*transition:none!important/);
  expect(css).toMatch(/@media\(max-width:600px\)/);expect(css).toMatch(/:focus-visible/);
  expect(css).not.toMatch(/z-index:\s*(?:[1-9]\d{3,})/);   // no compite con los modales de la plataforma
 });
 it('se integra con una sola línea en la página y no importa ningún motor ni el holograma',()=>{
  expect(page).toMatch(/<Quetzalito section=\{section\}/);
  for(const f of [tsx,avatar]){expect(f).not.toMatch(/lib\/(ingest|discovery|recovery|schema|reconstruct|analyst|studio|vault|filerec|experience)/);expect(f).not.toMatch(/experience\//);}
  expect(tsx+readFileSync('lib/quetzalito/engine.ts','utf8')+readFileSync('lib/quetzalito/kb.ts','utf8')).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|api\.openai|anthropic/i);   // sin red
 });
});
