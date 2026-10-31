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
