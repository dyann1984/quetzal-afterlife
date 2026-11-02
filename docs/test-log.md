# Registro de verificación

---

## 2026-10-30 — Fase 1 (commit 35a708a)

Entorno: Windows, Node v22.23.2, npm 10.9.8. Repositorio local aislado.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Aislamiento y logo | PASS | Directorio inicial vacío; imagen adjunta copiada sin rediseño. |
| Instalación y lockfile | PASS | npm install completó; versiones directas fijadas según resolución y lockfile. |
| lint | PASS con advertencias | Exit 0; dos advertencias de Next sobre uso de img. |
| typecheck | PASS | tsc --noEmit, exit 0. |
| Pruebas unitarias | PASS | Vitest: 7 de 7 después de corregir la detección de delimitador. |
| build | PASS | next build, exit 0, ruta estática /. |
| Navegador e importación | PASS parcial | CSV: 2 filas y 3 columnas observadas. No se comprobó recorrido completo. |
| Despliegue | PENDIENTE | No se ha desplegado. |

---

## 2026-10-30 — Fase 2A (commit 0a7299b · rama feat/kiro-dbf-archaeology)

Motor de arqueología DBF puro con decodificación manual CP437/CP850/CP852.

| Comprobación | Resultado | Evidencia real |
| --- | --- | --- |
| Pruebas CSV (regresión) | PASS | vitest: 7/7 |
| Pruebas DBF (nuevas) | PASS | vitest: 42/42 (primera ejecución 43/49; corregido trim) |
| Total pruebas | PASS | **49/49** |
| typecheck | PASS | tsc --noEmit, 0 errores |
| lint | PASS | eslint: 0 errores, 2 advertencias `<img>` pre-existentes |
| build | PASS | next build Turbopack, exit 0 |
| Navegador DBF | PENDIENTE | Requiere npm run dev en terminal del usuario |

Limitación documentada: ibm437/ibm850/ibm852 no soportados en TextDecoder Node v22.
Compatibilidad demostrada: dBASE III (0x03) y dBASE IV (0x04) únicamente.

---

## 2026-10-30 — Fase 2B (commit en curso · rama feat/kiro-dbf-archaeology)

Módulo de reconstrucción de inventario. Función pura sobre datos ya parseados.

### Comprobación de TextDecoder (Node.js v22) — resultado previo reutilizado
ibm437/ibm850/ibm852: FAIL. windows-125x: OK. Resuelto con tablas manuales.

### Verificaciones Fase 2B

| Comprobación | Resultado | Evidencia real |
| --- | --- | --- |
| Pruebas CSV (regresión) | PASS | vitest: 7/7 |
| Pruebas DBF (regresión) | PASS | vitest: 42/42 |
| Pruebas inventory (nuevas) | PASS | vitest: **21/21** — primera ejecución todo verde |
| Total pruebas | PASS | **70/70** |
| typecheck | PASS | tsc --noEmit, 0 errores |
| lint | PASS | eslint: 0 errores, 2 advertencias `<img>` pre-existentes |
| build | PASS | next build Turbopack, 1993ms, exit 0 |
| Navegador Laboratorio | PENDIENTE | Requiere npm run dev en terminal del usuario |

### Archivos creados/modificados en Fase 2B

| Archivo | Acción |
| --- | --- |
| `lib/inventory.ts` | Creado — función pura reconstructInventory |
| `lib/inventory.test.ts` | Creado — 21 pruebas unitarias |
| `app/page.tsx` | Modificado — sección Laboratorio con reconstrucción de inventario |
| `app/globals.css` | Modificado (append) — estilos de inventario |
| `docs/test-log.md` | Modificado — este archivo |
| `.kiro/specs/inventory-reconstruction/requirements.md` | Actualizado — spec completa |
| `.kiro/specs/inventory-reconstruction/design.md` | Creado — diseño técnico |

### Bloqueo documentado

- **Verificación en navegador**: `npm run dev` es un proceso de larga duración que no puede ejecutarse desde el agente. El usuario debe ejecutarlo manualmente (`npm run dev` en terminal, luego abrir http://localhost:3000) para:
  1. Verificar importación CSV con `fixtures/ejemplo.csv`
  2. Verificar importación DBF con cualquier archivo `.dbf`
  3. Verificar sección Laboratorio con reconstrucción de inventario

- **Fixtures FoxPro/VFP**: no se dispone de archivos `.dbf` reales de FoxPro/VFP para verificar compatibilidad. Los dialectos 0x05/0xF5/0x30 están en la lista blanca pero sin verificación de fixtures reales.


## Fase 4 — Estabilización (2026-10-31, rama feat/fase-4-estabilizacion)

Ejecutado: 119/119 pruebas (7 archivos), tsc 0 errores, ESLint 0 errores / 2 warnings (`<img>` del logo), build OK.
Navegador (build de producción, puerto 4173): importación DBF sintética, botón demo, exportación CSV/JSON,
guardar/reabrir/eliminar, recuperación de almacén corrupto (respaldo), sin desbordamiento horizontal a 375, 768 y desktop.
No verificado: archivos DBF reales de sistemas heredados (no hay ninguno en el equipo), navegadores distintos al integrado,
descarga física de archivos (se inspeccionó el contenido del Blob, no el diálogo de descarga del sistema).


## Motor 2.0 (2026-10-31, rama feat/quetzal-resurrection-engine-v2)

Ver docs/motor-2.0.md. Resultados al cierre: ver el reporte de la sesión; 163+ pruebas, tsc, ESLint y build ejecutados.
Fixtures y daños 100 % sintéticos: no demuestran recuperación de archivos reales.


## Recuperación universal — fase 1 (rama feat/universal-recovery)

Ejecutado: 242/242 pruebas (18 archivos; +55 sobre las 187 anteriores), tsc 0 errores, ESLint 0 errores / 3 warnings (`<img>` del logotipo), build OK.
Nuevas: núcleo/inflate (10), analizadores + seguridad + carving (32), archivos reales (5), matriz de capacidades (8).
Navegador (build de producción): sección File Recovery con 12 informes sintéticos + carving; logotipo real del proyecto (íntegro y truncado, reparado y verificado); «PNG» que es un ejecutable → marcado peligroso, no analizado; archivo de 9 MiB rechazado antes de leerlo; archivo vacío rechazado; móvil 375 px sin desbordamiento; regresión de las 12 secciones previas, holograma del Dashboard y experiencia de 6 etapas sin errores JS.
No verificado: PDF, DOCX, XLSX, ZIP y DBF reales (no hay ninguno en el equipo; solo sintéticos); JPEG real solo estructural; sin decodificación de píxeles; sin sistemas de archivos; sin audio/video/ejecutables más allá de la firma.


---

## 2026-11-02 — Competition Winner Edition (rama `feat/competition-winner-edition`)

Entorno: Windows 11, Node v22.23.2, npm 10.9.8.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Línea base antes de cambiar nada | PASS | 23 archivos, 309/309 pruebas; tsc limpio; build OK; lint 0 errores y 3 avisos |
| Pruebas finales | PASS | 25 archivos, **329/329** (309 originales + 18 de `lab.test.ts` + 2 de `explain.test.ts`); una aserción original cambió de 13 a 14 secciones |
| typecheck | PASS | `tsc --noEmit` sin salida |
| lint | PASS | 0 errores, 0 avisos (los 3 `<img>` estáticos se justifican con `eslint-disable-next-line`: son el logo oficial y se conserva su render) |
| build de producción | PASS | `next build` OK; rutas `/` y `/_not-found` estáticas |
| E2E en navegador (build de producción, :4173) | PASS | 14 secciones del menú renderizan contenido, sin desbordes horizontales, sin errores de página; «Ejecutar los 6 ejemplos» → 6/6 con todas sus comprobaciones ✓ |
| Móvil 375 px | PASS | sin desbordes en Dashboard y Lab; captura en `docs/capturas-lab/` |
| ES/EN y tema claro | PASS (muestreo) | Lab en EN + tema claro verificado; aviso: algunos textos de la explicación seguían en español antes de añadir las traducciones (corregido) |
| Demo guiada | PASS | 8 pasos recorridos; pasos 4–7 usan el motor real |
| Lighthouse / axe | NO EJECUTADO | no hay herramienta instalada en este entorno; revisión manual: roles `tablist`, `progressbar`, `alert`, foco visible, `prefers-reduced-motion` |
| SHA-256 | PASS | ejemplos 1 y 3: SHA-256 del reparado = SHA-256 del original (prueba automática y en navegador) |

### Recuperación tras apagón y analizadores GIF/BMP/WAV (2026-11-02)

Estado recuperado desde Git (árbol limpio, 7 commits de la edición): 329/329, tsc, lint y build en verde. Añadido `lib/filerec/media.ts` (GIF, BMP, WAV estructurales, con reparación declarada) y `media.test.ts`.

| Comprobación | Resultado |
|---|---|
| Pruebas | PASS, 26 archivos, **340/340** (+11 nuevas; el test de «formato sin analizador» ahora usa TIFF) |
| typecheck / lint / build | PASS / 0 avisos / OK |
| Datos reales | NO: todo GIF/BMP/WAV de prueba es sintético; sin decodificación LZW ni de audio |
| UI en navegador de los nuevos formatos | PASS: ver la sección siguiente |

---

## 2026-11-02 — Verificación en navegador, accesibilidad y rendimiento (build de producción, :4173)

Entorno: Chrome (panel integrado del escritorio de Claude), GPU Intel UHD 630; Lighthouse 12.8.2 y axe-core 4.10.2 instalados fuera del proyecto.

**Cambios hechos tras detectar fallos reales**
| Hallazgo | Corrección |
|---|---|
| El texto del BMP decía «muchos visores lo rechazan»; Chrome sí lo abre | Reescrito: «algunos visores…» |
| El paso 7 de la demo y Quetzalito decían «seis/cinco ejemplos» | Actualizados a nueve/ocho |
| axe: contraste insuficiente en 5 textos del tema oscuro (4.25–4.4:1; 3.13:1) | Variables `--c-687784`, `--c-52616f`, `--c-5f6e7c`, `--c-6a7885`, `--c-768492` aclaradas |
| axe: ≈600 nodos con contraste insuficiente en el tema claro (cian, dorado, grises) | Valores del tema claro oscurecidos hasta ≥ 4.7:1 (cálculo con script) |
| axe: salto de encabezado h2→h4 en el Lab | `h4` → `h3` en el panel de información |
| Lighthouse: `favicon.ico` 404 (error de consola) | `app/icon.png` (64 px, del logo) |
| Lighthouse: nombre accesible «Español/English» no contiene el texto visible «ES/EN» | `aria-label` «ES · Español» / «EN · English» |
| Logo de 2.3 MB servido tal cual | Copia de 640 px (`public/quetzal-logo-640.png`, 676 KB) para el menú y la demo; el original no se tocó |

**Resultados**
| Comprobación | Resultado | Evidencia |
|---|---|---|
| Lab: 9 ejemplos con «Ejecutar los 9 ejemplos» | PASS | 9/9, todas las verificaciones ✓; confianza ALTA ×2, MEDIA ×3, BAJA ×3 (GIF/BMP/WAV, sin checksum), NULA ×1 |
| Decodificación independiente del navegador | PASS | GIF original: 4 cuadros; recuperado: 2 de 2 decodificados (`ImageDecoder`); BMP recuperado 128×96; WAV original 1.500 s, recuperado 0.825 s (`decodeAudioData`); el PNG dañado no abre y el reparado sí |
| Descargas | PASS | SHA-256 del Blob que genera «Descargar archivo recuperado» = SHA-256 del informe en png-crc, gif, bmp, wav y zip |
| E2E reproducible `scripts/e2e-lab-console.js` | PASS 23/23 | incluye hash de descarga y decodificación |
| TRY QUETZAL NOW y demo guiada de 8 pasos | PASS | abre el Lab; los 8 pasos recorridos; antes/después y verificación reales |
| axe-core | PASS 0 violaciones | 14 secciones, 9 ejemplos del Lab con resultados, 8 pasos de la demo, experiencia de resurrección y Quetzalito; claro/oscuro × ES/EN |
| Responsive | PASS | 375 px (9 ejemplos), 768 px (14 secciones) y 1280 px sin desbordes horizontales; capturas en `docs/capturas-lab/` |
| Lighthouse móvil / escritorio | accesibilidad 100/100, buenas prácticas 100/100, SEO 100/100; rendimiento 67 / 54 | TBT ≈ 1 s por WebGL por software de Chrome headless: con WebGL desactivado, escritorio = 87 y TBT 30 ms; con GPU real el navegador no registró tareas largas |
| Pruebas, typecheck, lint, build | PASS | 26 archivos, 345/345; tsc limpio; eslint 0 errores y 0 avisos; build OK |

**No verificado:** Safari/Firefox; reproducción de audio por altavoces (se verificó la decodificación, no el sonido); rendimiento en un móvil real de gama baja; archivos GIF/BMP/WAV reales (todos sintéticos).