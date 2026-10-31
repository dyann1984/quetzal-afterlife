# Experiencia de resurrección (3D holográfico)

Rama: `feat/quetzal-resurrection-experience` (base: producción `57e9d61`). No sustituye ningún módulo: es una capa de **visualización** que se abre con **✦ Ver resurrección** (cabecera).

## Arquitectura

| Capa | Archivo | Notas |
|---|---|---|
| Datos de escena (puro, sin React/three) | `lib/experience.ts` | Convierte el estado REAL del motor en cifras, nodos, columnas, grafo y nube de partículas. Probado con vitest. |
| Overlay + controles + fallback 2D | `app/experience/ExperienceOverlay.tsx` | Detecta WebGL, movimiento reducido y calidad; recorrido automático; Esc/foco; texto equivalente. |
| Escena WebGL (R3F) | `app/experience/HoloScene.tsx` | **Carga diferida**: solo se descarga al pulsar «Ver resurrección». |
| Integración | `app/engine.tsx`, `app/page.tsx` | El motor no importa la visualización; solo le entrega un `SceneModel` de solo lectura. |

**Decisión Three.js / R3F / Drei.** R3F v9 + three 0.187 son compatibles con React 19 y Next 16 y `npm audit --omit=dev` da 0 vulnerabilidades. Drei se usa **solo para `OrbitControls`**. Se descartaron `Html` (provocó un error `removeChild` de React al desmontar el Canvas; los rótulos son ahora sprites con textura propia) y `Text` (descarga fuentes de un CDN externo). No se midió una variante sin Drei, así que no se afirma cuánto pesaría de menos.

## Qué muestra cada etapa (todo derivado del estado real)

1. **Materialización:** ~6000 partículas forman el quetzal. Las partículas se reparten por estado con las fracciones reales (íntegros / recuperados con daño / perdidos). **Las de registros perdidos nunca se ensamblan**: quedan dispersas, tenues y rojas. Escenario: 75 de 77 declarados.
2. **Discovery:** un nodo por archivo (forma según formato), anillo rojo si hay daños, SHA-256 abreviado.
3. **Recovery:** columnas de cubos por tabla — azul íntegro, dorado recuperado con daño, rojo fantasma perdido. 1 cubo = 1 registro (o N si hay más de 40).
4. **Reconstruction:** red de entidades; líneas brillantes = relaciones **aprobadas**, tenues = inferidas no aplicadas; octaedros rojos = huérfanos reales.
5. **Studio:** sistema reconstruido (izq.) frente a la evidencia original (der.), con enlaces tabla → archivo de origen.
6. **Vault:** anillo con proporciones reales, un cubo por evidencia, validaciones y pérdidas.

Sin evidencia analizada no se dibuja nada: se ofrece cargar el escenario sintético. Los datos sintéticos llevan la etiqueta **SINTÉTICO** en la capa.

## Rendimiento, accesibilidad y robustez

- **Calidad adaptativa:** alta 6000 partículas (DPR ≤ 2) · media 3500 (≤ 1.5) · baja 1800 (1). Se elige por ancho, núcleos y memoria; `?q=alta|media|baja` la fija. Si hay < 24 fps sostenidos baja un nivel (se ignora < 4 fps, que indica estrangulamiento por pestaña oculta).
- **Movimiento reducido (`prefers-reduced-motion`):** quetzal ya formado, sin recorrido ni giro automático.
- **Pausa real:** `frameloop="demand"`; medido 0 fotogramas en 2 s en pausa.
- **Fallback 2D accesible:** sin WebGL, pérdida real de contexto, error de render o botón «Ver 2D»: tabla/lista equivalente, barra de proporciones y narrativa `aria-live`. En 3D hay además un `<details>` con los mismos datos en texto.
- **Privacidad:** todo local; ninguna red; sin fuentes ni assets externos.

## Mediciones (Chromium embebido, Windows, Intel UHD 630, ventana 1024×768, DPR 1.25, 12 núcleos)

| Medida | Resultado |
|---|---|
| Chunk 3D diferido | 928.6 KB sin comprimir · **244.6 KB gzip** (solo al abrir la experiencia) |
| Chunk de la app (motor 2.0) | 137.3 KB · 41.7 KB gzip (sin three) |
| Primer fotograma tras cargar el escenario | ≈ 2.2 s (incluye descarga del chunk 3D y compilación de shaders) |
| Draw calls / triángulos (alta) | Materialización 5 / 768 · Recovery 9 / 910 · Reconstruction 24 / 4282 · Discovery 23 / 2140 · Studio 49 / 6426 · Vault 13 / 8068 |
| Puntos | 6000 (alta) · 1800 (baja) |
| Memoria JS | 10–16 MB |
| FPS medidos | **30 fps** estables en todas las etapas y calidades con el panel visible; un bucle `requestAnimationFrame` vacío mide 61 fps en el mismo entorno |
| Generar la nube de 6000 partículas (vitest) | < 100 ms (presupuesto verificado), buffers < 300 KB |

**Caveat honesto:** los 30 fps no varían entre «alta» y «baja», lo que sugiere un límite del entorno de pruebas (composición del panel), no de la escena; no se aisló la causa y **no se midió en otros equipos ni en celulares reales**. El arranque (~2 s) y los primeros segundos de Materialización son más lentos por la compilación de shaders.

## Pruebas

- `lib/experience.test.ts` (10): cifras = informes de recuperación (77 declarados, 71/4/2, 5 celdas desconocidas, derivadas a mano), relaciones aprobadas/no, cubos fantasma, sin evidencia no inventa nada, determinismo de la nube, reparto de estados por fracciones, presupuesto de generación, calidad adaptativa.
- `scripts/experience-smoke.js`: batería de interacción en navegador (foco, Esc, 6 etapas, pausa, girar, explorar, 2D↔3D ×4, recorrido automático, pérdida de contexto).
- Verificado a mano: móvil 375 px (calidad «baja» automática, sin desbordamiento), movimiento reducido simulado reemplazando `matchMedia`.

## Fallos encontrados y corregidos durante la verificación
1. `Html` de Drei → error `removeChild` al desmontar → reemplazado por sprites.
2. Desmontar el Canvas (cambio a 2D) disparaba `webglcontextlost` y bloqueaba el 3D para siempre → el escuchador se retira al desmontar.
3. Estrangulamiento por panel oculto degradaba la calidad sin motivo → se ignoran muestras < 4 fps.
4. Encuadre: cola cortada, red apelotonada, columnas de Recovery recortadas, botones táctiles de 27 px (ahora 40 px en móvil).

## Limitaciones
- No hay pruebas automáticas de componentes en vitest (el entorno es `node`); la interacción se verifica con el script de navegador.
- El quetzal es una silueta procedural de partículas (no un modelo modelado); es una interpretación artística.
- Próximo paso previsto: transiciones animadas entre etapas ligadas a eventos del motor en vivo (hoy la capa lee el estado ya calculado).


---

# Holograma principal 3D del Dashboard (rama `feat/quetzal-hologram-hero`)

## Qué cambió respecto a la nube de partículas
El quetzal anterior era solo una nube de puntos (alas como cortinas, cola sin forma). Ahora la silueta es **geometría 3D real** (`app/experience/quetzal-geometry.ts`, procedural, sin assets externos) y las partículas son un **aura complementaria** muestreada sobre esa misma superficie.

| Parte | Construcción |
|---|---|
| Cuerpo | barrido elíptico con radio variable: pecho volumétrico que se estrecha al cuello; pecho y vientre dorados |
| Cabeza / pico / ojos | elipsoide + pico dorado curvo (barrido cónico) + anillo y brillo del ojo |
| Cresta | 8 plumas finas que ondulan |
| Alas (×2) | ~33 plumas por ala en tres capas: 9 primarias, 8 secundarias y 3 filas de coberteras, pivotadas en el hombro (aleteo lento) |
| Cola | **5 plumas largas** con trayectorias, anchos, orientación y matiz distintos (≈ 5.4 u frente a ~2.9 u de cuerpo) + abanico de 6 plumas cortas |
| Entorno | rama, plataforma con anillos azul/dorado, anillos de datos (eco del círculo «Q» del logotipo) |

**Materiales y luz:** `MeshStandardMaterial` metálico (azul eléctrico / dorado) con **entorno PMREM construido en el propio cliente** (paneles azul y oro; sin HDR externos), dos luces direccionales (azul y dorada), luz puntual y rim-light por fresnel inyectado en el shader.
**Movimiento:** respiración del pecho, aleteo lento ±6°, ondulación de plumas por vértice (cola > cresta > alas), balanceo suave y giro automático. Con `prefers-reduced-motion` (o `?motion=reduced`): ave formada y estática, `frameloop` bajo demanda, sin giro automático.

## Honestidad de datos
- **Sin evidencia cargada** el hero es un *emblema*: leyenda «EMBLEMA · el holograma refleja datos reales cuando cargas evidencia», sin teselas ni disolución.
- **Con evidencia**, `lib/sceneStore.ts` entrega el estado real del motor: los registros *perdidos* se traducen en celdas-voxel **disueltas** del quetzal y los *recuperados con daño* en celdas teñidas de oro (proporción **aproximada**: se decide por hash espacial, no por registro concreto). Las partículas de registros perdidos nunca se ensamblan. Las 36 teselas de datos usan el reparto exacto por mayor resto (`tileStates`; si hay pérdidas reales, al menos una tesela las muestra).
- La leyenda dice el recuento real: «71 íntegros · 4 recuperados con daño · 2 perdidos» y la etiqueta SINTÉTICO.

## Integración y carga
- El hero **conserva el logotipo oficial**: sigue en la barra lateral, es el póster mientras carga y el **fallback permanente** sin WebGL / si hay error o pérdida de contexto; con el 3D activo queda además una insignia con el logotipo.
- Carga diferida real: la escena (chunk ≈ 944 KB / **250 KB gzip**) solo se descarga cuando el hero está visible al ≥ 35 %. Verificado en móvil 375 px: antes de desplazarse, 0 canvas y 7 chunks JS; al llegar al hero, 2 chunks nuevos.
- Giro con el ratón (OrbitControls solo rotación, sin zoom/paneo); en móvil no se captura el gesto para no bloquear el scroll. «Ver resurrección» abre la experiencia completa (6 etapas, sin cambios de contrato). Si la página se desplaza fuera de pantalla, el bucle de render se detiene.
- Calidad adaptativa (alta/media/baja): partículas 2600/1500/700 y DPR ≤ 1.75/1.4/1. El motor de recuperación **no se modificó** (solo publica su `SceneModel` en el almacén).

## Pruebas
- Vitest (186 en total; +13): geometría real (partes, proporciones de ave, cola ≥ 1.8× el cuerpo, pico por delante, cresta sobre la cabeza, alas con ≥ 900 triángulos, 5+6 plumas de cola, sin NaN, determinismo, presupuesto ≤ 8 partes y < 25 000 triángulos, construcción < 400 ms, muestreo de 6000 puntos < 150 ms), reparto de teselas, nube desde muestras y `sceneStore`.
- Navegador: `scripts/hero-smoke.js` (logotipo oficial en barra y póster, escena lista, presupuestos, arrastre gira la cámara −65° desde 8°, botón abre la experiencia, el hero refleja los datos reales tras cargar el escenario) y `scripts/experience-smoke.js` (experiencia completa; sin errores JS).

## Mediciones (Chromium embebido, Intel UHD 630, 1024×768, DPR 1.25)
| Medida | Resultado |
|---|---|
| Hero, calidad alta, panel visible | **60 fps** (muestras 55–60), 15–17 draw calls, 20.4–20.6 k triángulos, 2600 puntos |
| Experiencia, etapa Materialización | 16 draw calls, 20.9 k triángulos |
| Memoria JS | ≈ 10 MB |
| Chunk 3D diferido | 943.6 KB · 249.8 KB gzip (antes 928 KB: la geometría añade poco; Drei solo aporta OrbitControls) |
| Chunk de la app | 140.2 KB · 42.8 KB gzip |

**Límites de la medición:** el panel de pruebas se oculta entre llamadas y entonces el navegador reduce `requestAnimationFrame` a ~1 fps; por eso solo se consideran válidas las muestras tomadas con el panel visible. **No se midió en otros equipos, GPUs integradas más antiguas ni celulares reales.** Las mediciones por nivel «media/baja» fueron intermitentes por este motivo; de ellas solo son fiables los contadores deterministas (puntos 1500/700).

## Capturas (`docs/capturas/`)
`01` Dashboard con el hero (3/4) · `02` vista frontal · `03` lado opuesto · `04` experiencia, Materialización con datos reales · `05` movimiento reducido · `06` móvil con el 3D · `07` móvil con el logotipo oficial como póster.

## Limitaciones
- El quetzal es una interpretación procedural estilizada; no es un modelo escultórico ni una réplica del logotipo.
- Las alas se leen bien como alas plegadas, pero la anatomía fina (calamus, barbas) no está modelada.
- Disolución por voxeles aproximada (ver arriba); no hay vínculo registro ↔ región del ave.
- Pendiente: más pruebas de rendimiento en hardware real y un modelo con rigging si se desea animación más compleja.
