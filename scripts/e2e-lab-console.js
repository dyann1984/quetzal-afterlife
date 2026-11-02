/**
 * Verificación E2E del RESURRECTION LAB en un navegador real. Pegar en la consola del navegador (F12) con la app abierta
 * (npm run build && npm start). No usa dependencias ni red: ejecuta los 9 ejemplos con el motor real, comprueba que cada
 * verificación del laboratorio pasa, que el navegador decodifica los GIF/BMP/WAV recuperados y que el archivo que descarga
 * el botón «Descargar archivo recuperado» tiene el mismo SHA-256 que muestra el informe. Devuelve una tabla y un veredicto.
 */
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const sha = async buf => [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map(x => x.toString(16).padStart(2, '0')).join('');
  const rows = [], fail = m => rows.push({ ejemplo: '—', comprobacion: m, ok: false });
  const nav = [...document.querySelectorAll('nav button, aside button')].find(b => /Resurrection Lab/.test(b.textContent));
  if (!nav) return fail('no se encontró la sección Resurrection Lab') || console.table(rows);
  nav.click(); await sleep(400);
  document.querySelector('[data-testid=lab-run-all]').click();
  for (let i = 0; i < 120 && !document.querySelector('[data-testid=lab-summary]'); i++) await sleep(500);
  const summary = [...document.querySelectorAll('[data-testid=lab-summary] tr')];
  rows.push({ ejemplo: 'todos', comprobacion: `resumen con ${summary.length} ejemplos`, ok: summary.length === 9 });
  const blobs = []; const orig = URL.createObjectURL.bind(URL); URL.createObjectURL = b => { blobs.push(b); return orig(b); };
  const click = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { };
  try {
    for (const card of document.querySelectorAll('[data-testid^=lab-card-]')) {
      const id = card.dataset.testid.slice(9), n = card.querySelector('.lab-n').textContent; card.click();
      for (let i = 0; i < 50 && !document.querySelector('#lab-title')?.textContent.startsWith(n + '.'); i++) await sleep(100);
      await sleep(300);
      const res = document.querySelector('[data-testid=lab-result]');
      const checks = [...res.querySelectorAll('[data-testid=lab-checks] li')];
      rows.push({ ejemplo: id, comprobacion: `${checks.filter(c => c.classList.contains('ok')).length}/${checks.length} verificaciones del laboratorio`, ok: checks.length > 0 && checks.every(c => c.classList.contains('ok')) });
      if (/gif|bmp/.test(id)) {
        const img = res.querySelectorAll('figure.lab-pic img')[2]; let ok = false; try { await img.decode(); ok = img.naturalWidth > 0; } catch { }
        rows.push({ ejemplo: id, comprobacion: 'el navegador decodifica el archivo recuperado', ok });
        if (/gif/.test(id)) { const d = new ImageDecoder({ data: await (await fetch(img.src)).arrayBuffer(), type: 'image/gif' }); await d.tracks.ready; let n = 0; for (let i = 0; i < d.tracks.selectedTrack.frameCount; i++) { try { await d.decode({ frameIndex: i }); n++; } catch { } } rows.push({ ejemplo: id, comprobacion: `cuadros decodificados en el recuperado: ${n} (esperado 2)`, ok: n === 2 }); }
      }
      if (/wav/.test(id)) {
        const au = res.querySelectorAll('[data-testid=lab-audio] audio')[2]; let d = 0;
        try { const c = new AudioContext(); d = (await c.decodeAudioData(await (await fetch(au.src)).arrayBuffer())).duration; c.close(); } catch { }
        rows.push({ ejemplo: id, comprobacion: `duración decodificada del recuperado: ${d.toFixed(3)} s (esperado 0.825)`, ok: Math.abs(d - 0.825) < 0.002 });
      }
      const dl = [...res.querySelectorAll('.lab-actions button')][0];
      if (dl && /Descargar archivo recuperado|Download recovered/.test(dl.textContent)) {
        blobs.length = 0; dl.click(); await sleep(150);
        const shown = [...res.querySelectorAll('table tbody tr')].find(r => /Recuperado|Recovered/.test(r.querySelector('th')?.textContent || ''))?.querySelector('code')?.textContent;
        rows.push({ ejemplo: id, comprobacion: 'SHA-256 de la descarga = SHA-256 del informe', ok: !!blobs[0] && !!shown && (await sha(await blobs[0].arrayBuffer())) === shown });
      } else rows.push({ ejemplo: id, comprobacion: 'sin archivo recuperado (esperado solo en png-noise)', ok: id === 'png-noise' });
    }
  } finally { URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click; }
  console.table(rows);
  const bad = rows.filter(r => !r.ok);
  return bad.length ? `FALLAN ${bad.length} de ${rows.length}` : `OK: ${rows.length}/${rows.length} comprobaciones E2E`;
})();
