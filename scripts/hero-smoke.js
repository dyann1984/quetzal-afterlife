// Prueba de humo del HERO holográfico del Dashboard (consola del navegador, pestaña VISIBLE).
// Uso: npm run build && npx next start -p 4173; abrir http://localhost:4173 y pegar. Todo debe dar true.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (f, ms = 10000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(50); return !!f(); };
  const hero = document.querySelector('.hero-holo');
  const R = {};
  R.logoOficialEnBarraLateral = document.querySelector('.brand img')?.getAttribute('src') === '/quetzal-logo.png';
  R.posterLogoEnHero = hero.querySelector('.hero-poster')?.getAttribute('src') === '/quetzal-logo.png';
  hero.scrollIntoView({ block: 'start' });
  R.escenaListaTrasVisible = await waitFor(() => hero.dataset.ready === '1');
  R.badgeLogoVisible = !!hero.querySelector('.hero-badge');
  await sleep(2500);
  const p = window.__quetzalHero;
  R.fpsDelHero = p?.fps; R.drawCalls = p?.calls; R.triangulos = p?.triangles; R.puntos = p?.points; R.calidad = p?.quality;
  R.presupuestoDrawCalls = p?.calls <= 25; R.presupuestoTriangulos = p?.triangles < 40000;
  R.leyendaEmblemaSinDatos = /EMBLEMA/.test(hero.querySelector('.hero-caption').textContent) && !/íntegros/.test(hero.querySelector('.hero-caption').textContent);
  // arrastre con el ratón → cambia el azimut de la cámara
  const c = hero.querySelector('canvas'), r = c.getBoundingClientRect(), a0 = window.__quetzalHero.azimuth;
  const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: r.top + r.height / 2 }));
  ev('pointerdown', r.left + r.width * 0.3); for (let i = 1; i <= 10; i++) { ev('pointermove', r.left + r.width * (0.3 + i * 0.04)); await sleep(30); } ev('pointerup', r.left + r.width * 0.7);
  await sleep(900);
  R.arrastreGiraElAve = Math.abs(window.__quetzalHero.azimuth - a0) > 5;
  // botón «Ver resurrección»
  [...hero.querySelectorAll('button')].find(b => b.textContent.includes('Ver resurrección')).click();
  R.abreExperienciaCompleta = await waitFor(() => document.querySelector('.exp-overlay'));
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Cargar escenario SINTÉTICO'))?.click();
  await waitFor(() => window.__quetzalPerf && window.__quetzalPerf.frames > 3);
  R.experienciaConEscenaReal = /75 de 77/.test(document.querySelector('.exp-narrative').textContent);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await sleep(500);
  R.heroRefleja = /71 íntegros · 4 recuperados con daño · 2 perdidos/.test(hero.querySelector('.hero-caption').textContent) && /SINTÉTICO/.test(hero.querySelector('.hero-caption').textContent);
  R.sigueVisibleElBotonYContenido = !!hero.querySelector('.hero-actions button') && !!document.querySelector('.intro h1');
  return R;
})();
