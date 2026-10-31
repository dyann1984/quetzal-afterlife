# Motor de resurrección 2.0 — requisitos, diseño y criterios de aceptación

Rama: `feat/quetzal-resurrection-engine-v2` (base `bc445bf`). Producción (`quetzal-afterlife.vercel.app`) no se modificó.

## Arquitectura (lib/, funciones puras salvo indicación)

| Módulo | Archivo | Responsabilidad |
|---|---|---|
| Ingestion Gateway | `ingest.ts` | Firma + estructura (no extensión), SHA-256 (WebCrypto), copia de trabajo, límites, rechazo de ejecutables |
| Format Discovery | `discovery.ts`, `dbf-scan.ts`, `csv-scan.ts` | Contrato `FormatAdapter`; adaptadores DBF, CSV, SQLite (solo cabecera); codificación estimada |
| Recovery | `recovery.ts` | Tablas con procedencia por registro/celda, pérdidas, segmentos irrecuperables |
| Schema Intelligence | `schema.ts` | Tipos, PK, relaciones, cardinalidad, huérfanos, duplicados — todo `inferido` con evidencia |
| Reconstruction | `reconstruct.ts` | Modelo multitabla, reglas registradas, validaciones, linaje, versiones, huella |
| AI Analyst | `analyst.ts` | Analista local determinista; interfaz de proveedor remoto con consentimiento; validación de evidencia |
| Studio | `studio.ts` | Modelo de app, copia de trabajo, CRUD con reglas, búsqueda, navegación, prototipo HTML |
| Evidence Vault | `vault.ts` | Expediente JSON con hash propio, informe MD/HTML, incertidumbre, versiones |
| Escenario | `scenario.ts` | Datos 100 % sintéticos con daños controlados |
| UI | `app/engine.tsx` | 7 secciones agrupadas bajo «Motor de resurrección 2.0»; las 5 originales no cambian |

Procedencia: `original` (leído sin anomalías) · `recuperado` (zona dañada) · celda `desconocida` (no estimada) · `inferido` (solo esquema/relaciones, nunca datos).

## Criterios de aceptación por fase y estado

**Fase 5 — Discovery.** Identifica por contenido; SHA-256 conocido verificado; detecta truncamiento DBF/SQLite, descriptores inválidos, filas CSV irregulares, comilla sin cerrar; rechaza ejecutables, vacíos y exceso de tamaño. ✔ (`engine.test.ts`, navegador)

**Fase 6 — Recovery.** Recupera registros legibles de DBF truncado (12 íntegros + 1 parcial de 15 declarados), marca 2 celdas desconocidas, 1 campo corrupto, 1 byte de borrado inválido; reporta segmentos irrecuperables; nunca altera el original (hash). ✔ Solo con fixtures sintéticos.

**Fase 7 — Reconstruction Intelligence.** Infiere PK y 4 relaciones esperadas con huérfanos (C-099, P-077, V-0014/V-0015) y duplicado C-002/C-011; sin falsos positivos de duplicados; reconstrucción reproducible. ✔ (`schema.test.ts`, `reconstruct.test.ts`)

**Fase 8 — AI Analyst.** Propuestas con evidencia; las inventadas se descartan; nada se aplica sin aprobación; proveedor remoto exige consentimiento y por defecto solo recibiría metadatos. ✔ Proveedor de IA real: **no implementado** (sin credenciales ni presupuesto; solo interfaz).

**Fase 9 — Studio.** Entidades, búsqueda, navegación padre/hijo, CRUD con reglas sobre copia de trabajo, prototipo HTML de solo consulta escapado. ✔

**Fase 10 — Vault.** Hashes, historial, incertidumbre, versiones, JSON verificable, informe MD/HTML. ✔

## Seguridad
Nada se ejecuta; el contenido solo se lee como bytes/texto. Exportaciones CSV neutralizan fórmulas; HTML/JSON escapan `<`, `>` y `&`. Límites: 4 MB por archivo (se comprueba antes de leer), 10 000 registros. Sin red ni secretos.

## Limitaciones y pendientes
- Compatibilidad real no demostrada: solo archivos sintéticos. Ningún `.dbf` real de sistema heredado disponible.
- SQLite: únicamente diagnóstico de cabecera; no se leen tablas.
- Proveedor de IA externo no implementado; solo `remoteAnalystPlaceholder`.
- El modelo reconstruido y el expediente viven en memoria de la sesión (no se persisten entre recargas); se exportan a archivos.
- Memo/FPT, índices CDX, otras codificaciones (UTF-16) y límites de tiempo no cubiertos.
- Persistencia avanzada propuesta: IndexedDB para evidencias y modelo + archivos exportados separados; requiere diseño y autorización antes de manejar datos reales.
- Diagrama relacional en móvil: legible pero pequeño.
