// Prueba de humo de la Experiencia de resurrección (se ejecuta en la consola del navegador).
// Uso: npm run build && npx next start -p 4173, abrir http://localhost:4173 con la pestaña VISIBLE
// (un panel oculto reduce requestAnimationFrame a 1 fps y falsea las mediciones) y pegar este script.
// Devuelve un objeto con cada comprobación; todo debe ser true / coincidir con lo esperado.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (f, ms = 8000) => { const t = performance.now(); while (!f() && performance.now() - t < ms) await sleep(50); return !!f(); };
  const btn = t => [...document.querySelectorAll('button')].find(b => b.textContent.trim().includes(t) && b.offsetParent !== null);
  const ctl = t => [...document.querySelectorAll('.exp-btns button')].find(b => b.textContent.includes(t));
  const tab = t => [...document.querySelectorAll('.exp-tabs button')].find(b => b.textContent.trim() === t);
  const R = { visible: document.visibilityState === 'visible' };
  window.__errs = []; window.addEventListener('error', e => window.__errs.push(e.message));

  btn('Ver resurrección').click(); await waitFor(() => document.querySelector('.exp-overlay')); await sleep(250);
  R.focoEnCerrar = document.activeElement?.getAttribute('aria-label') === 'Cerrar la experiencia';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await sleep(300);
  R.escCierra = !document.querySelector('.exp-overlay');

  btn('Ver resurrección').click(); await waitFor(() => document.querySelector('.exp-overlay'));
  R.estadoVacioSinInventar = !!document.querySelector('.exp-empty') && !document.querySelector('.exp-stage canvas');
  btn('Cargar escenario SINTÉTICO').click();
  R.webglConFrames = await waitFor(() => window.__quetzalPerf && window.__quetzalPerf.frames > 5);
  R.bannerSintetico = document.querySelector('.exp-banner')?.textContent.includes('SINTÉTICO');
  R.narrativaReal = /75 de 77 registros declarados/.test(document.querySelector('.exp-narrative').textContent);

  R.etapas = {};
  for (const [s, k] of [['Discovery', 'discovery'], ['Recovery', 'recovery'], ['Reconstruction', 'reconstruction'], ['Studio', 'studio'], ['Vault', 'vault'], ['Materialización', 'materializar']]) {
    tab(s).click(); await waitFor(() => window.__quetzalPerf.stage === k, 3000);
    R.etapas[s] = window.__quetzalPerf.stage === k && tab(s).getAttribute('aria-pressed') === 'true';
  }
  ctl('Pausar').click(); await sleep(1800); const f1 = window.__quetzalPerf.frames; await sleep(2000);
  R.fotogramasEnPausa2s = window.__quetzalPerf.frames - f1;          // esperado: 0
  ctl('Reanudar').click(); await sleep(1200); R.reanuda = window.__quetzalPerf.frames - f1 > 0;

  // esperado: Girar pasa de "true" a "false"; Explorar de "false" a "true"
  const g0 = ctl('Girar').getAttribute('aria-pressed'), e0 = ctl('Explorar').getAttribute('aria-pressed');
  ctl('Girar').click(); ctl('Explorar').click(); await sleep(250);
  R.alternaGirarYExplorar = ctl('Girar').getAttribute('aria-pressed') !== g0 && ctl('Explorar').getAttribute('aria-pressed') !== e0;
  ctl('Explorar').click(); ctl('Girar').click(); await sleep(250);

  ctl('Ver 2D').click(); await sleep(500);
  R.fallback2D = !!document.querySelector('[data-testid=exp-fallback]') && !document.querySelector('.exp-stage canvas') && ctl('Girar').disabled;
  for (let i = 0; i < 3; i++) { ctl('Ver 3D').click(); await sleep(700); ctl('Ver 2D').click(); await sleep(250); }
  ctl('Ver 3D').click(); R.vuelve3D = await waitFor(() => document.querySelector('.exp-stage canvas'), 6000);

  ctl('Reiniciar').click(); await sleep(800); const s0 = window.__quetzalPerf.stage; await sleep(8500);
  R.recorridoAvanza = s0 === 'materializar' && window.__quetzalPerf.stage === 'discovery';

  const c = document.querySelector('.exp-stage canvas');
  (c.getContext('webgl2') || c.getContext('webgl')).getExtension('WEBGL_lose_context').loseContext(); await sleep(800);
  R.perdidaDeContextoVa2D = !!document.querySelector('[data-testid=exp-fallback]');
  R.erroresJS = window.__errs;
  return R;
})();
