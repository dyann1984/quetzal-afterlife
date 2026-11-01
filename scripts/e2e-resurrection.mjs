// Prueba E2E del protocolo de resurrección en un navegador real (Chrome/Chromium, sin descargar navegadores).
// Uso:  npm run build && npx next start -p 4173   (en otra terminal)
//       npm run test:e2e        # BASE=http://localhost:4173 CHROME_PATH=/ruta/a/chrome (opcionales)
// Genera capturas en docs/capturas-kiroween/ y termina con código 1 si alguna comprobación falla.
import { chromium } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
const OUT = 'docs/capturas-kiroween'; mkdirSync(OUT, { recursive: true });
const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok: !!ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`); };
if (!CHROME) { console.error('No se encontró Chrome/Chromium. Defina CHROME_PATH.'); process.exit(2); }

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, colorScheme: 'dark' });   // diseño oficial: oscuro
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} @ ${m.location().url}`); });
page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
const nav = name => page.locator('aside nav button', { hasText: name }).first().click();
const finished = () => page.waitForFunction(() => { const el = document.querySelector('[data-testid=resurrection]'); return el && el.getAttribute('aria-busy') === 'false'; }, null, { timeout: 30000 });
const json = '{\n  // exportado por un sistema heredado\n  "clientes": [\n    {"id": 1, "nombre": "Ana",},\n    {"id": 2, "nombre": "Luis"},\n  ],\n}\n';
const truncated = '{"clientes":[{"id":1,"nombre":"Ana"},{"id":2,"nombre":"Lu';

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('Dashboard sin datos muestra estado vacío explicativo (sin cifras de relleno)', await page.locator('.ds .rz-empty').isVisible());
  await page.screenshot({ path: `${OUT}/01-dashboard-vacio.png` });

  await nav('File Recovery');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'clientes.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await finished();
  const states = await page.$$eval('.rz-stage', els => els.map(e => [...e.classList].find(c => c.startsWith('rz-') && c !== 'rz-stage')));
  check('Las seis etapas terminan con estado real', states.length === 6 && states.every(s => !['rz-pendiente', 'rz-activo'].includes(s)), states.join(','));
  check('JSON con comentarios: veredicto «Reparado y validado»', /Reparado y validado/.test(await page.locator('.rz-core h3').textContent()));
  check('Quetzalito explica con datos del informe', /comentario/.test(await page.locator('.rz-explain').textContent()));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.rz-core button.primary').click()]);
  const body = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
  let parsed = null; try { parsed = JSON.parse(body); } catch { /* falla abajo */ }
  check('La descarga reparada es JSON válido con los mismos datos', parsed && parsed.clientes.length === 2 && parsed.clientes[1].nombre === 'Luis');
  await page.screenshot({ path: `${OUT}/02-json-reparado.png`, fullPage: true });

  await page.locator('input[type=file]').first().setInputFiles({ name: 'truncado.json', mimeType: 'application/json', buffer: Buffer.from(truncated) });
  await page.waitForFunction(() => document.querySelectorAll('.rz-chip').length === 2);
  await finished();
  check('Truncado: «Recuperación parcial verificada», nunca éxito completo', /Recuperación parcial/.test(await page.locator('.rz-core h3').textContent()));
  check('El comparador marca la zona dañada del original', (await page.locator('.rz-pane mark').count()) > 0);
  await page.screenshot({ path: `${OUT}/03-json-truncado-comparador.png`, fullPage: true });

  await nav('Dashboard');
  await page.waitForSelector('.ds-kpis');
  check('Dashboard muestra estadísticas reales (2 archivos)', /^2$/.test((await page.locator('.ds-kpis b').first().textContent()).trim()));
  await page.screenshot({ path: `${OUT}/04-dashboard-estadisticas.png` });
  await nav('File Recovery');
  check('Los resultados sobreviven al cambio de sección (antes se perdían)', (await page.locator('.rz-chip').count()) === 2);

  await page.locator('button', { hasText: 'Cargar fixtures SINTÉTICOS' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.rz-chip').length >= 20, null, { timeout: 60000 });
  await page.locator('.rz-chip', { hasText: 'tienda-pagina-danada.db' }).click();
  await finished();
  check('SQLite con página dañada: recuperación parcial con mapa de bytes', /parcial/i.test(await page.locator('.rz-core h3').textContent()) && (await page.locator('.rz-bytebar span').count()) > 0);
  await page.screenshot({ path: `${OUT}/05-sqlite-pagina-danada.png`, fullPage: true });

  await page.locator('button[aria-label="English"]').click();
  check('Cambio a inglés: etapas y veredicto traducidos', /Detection/.test(await page.locator('.rz-track').textContent()) && /recovery/i.test(await page.locator('.rz-core h3').textContent()));
  await page.selectOption('.ui-theme select', 'light');
  check('Tema claro aplicado', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  await page.screenshot({ path: `${OUT}/06-ingles-tema-claro.png`, fullPage: true });
  await page.locator('button[aria-label="Español"]').click(); await page.selectOption('.ui-theme select', 'dark');

  // Móvil + movimiento reducido
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const mp = await m.newPage(); mp.on('pageerror', e => errors.push(String(e))); mp.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await mp.goto(BASE, { waitUntil: 'networkidle' });
  await mp.locator('nav button', { hasText: 'File Recovery' }).first().click();
  await mp.locator('input[type=file]').first().setInputFiles({ name: 'clientes.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await mp.waitForFunction(() => document.querySelector('[data-testid=resurrection]')?.getAttribute('aria-busy') === 'false');
  check('Móvil: sin desplazamiento horizontal', await mp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('Movimiento reducido: sin animaciones en el protocolo', await mp.evaluate(() => [...document.querySelectorAll('.rz-node,.rz-orb i')].every(e => getComputedStyle(e).animationName === 'none')));
  await mp.screenshot({ path: `${OUT}/07-movil.png`, fullPage: true });
  await m.close();

  check('Sin errores en la consola ni excepciones', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('Ejecución sin excepciones', false, String(e).slice(0, 300));
} finally { await browser.close(); }

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} PASS`);
process.exit(failed ? 1 : 0);
