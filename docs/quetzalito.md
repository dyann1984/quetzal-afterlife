# Quetzalito — asistente de la plataforma (100 % local, integrado)

Integrado en la rama `feat/integracion-final` junto con el holograma 2.5D y la internacionalización (ES/EN) y los temas (Claro/Oscuro/Sistema) globales. No toca los motores de recuperación ni el logotipo; el holograma principal no se rediseñó.

## Qué es
Un asistente flotante bilingüe (ES/EN) con la imagen de un mini quetzal holográfico (azul eléctrico, cian y detalles dorados) dentro de un micro-escenario oscuro, de modo que se ve igual en tema claro y oscuro. Responde con una **base de conocimiento local revisada**: sin IA externa, sin red, sin costo y sin enviar datos.

### Respuestas guiadas vs. inteligencia artificial generativa
Quetzalito **no es IA generativa**. Cada respuesta lleva la etiqueta «RESPUESTA GUIADA» (o «GUIDED ANSWER»): es un texto escrito y revisado de la base de conocimiento, elegido por coincidencia de palabras clave. La interfaz `lib/quetzalito/ai.ts` para una IA futura sigue **desactivada**; si algún día se activara, esas respuestas se mostrarían con una etiqueta distinta y visible. No se usa ninguna API de pago.

## Comportamiento
- Botón flotante discreto (abajo a la derecha); al pulsarlo abre el chat (en móvil, una hoja inferior). Se puede **minimizar** (barra compacta) y **cerrar**; **recuerda** solo abierto/cerrado y minimizado en localStorage (clave `quetzalito:v1`).
- **Idioma y tema globales**: Quetzalito ya no tiene preferencias propias. Usa el idioma y el tema de la plataforma (`quetzal:ui:v1`). Sus botones ES/EN y de tema cambian **toda la plataforma**, y los selectores de la cabecera cambian a Quetzalito. Los mensajes del chat se etiquetan con su idioma; al cambiarlo se ocultan los del otro idioma.
- **Detecta la sección actual** (las 13) y adapta el saludo, las preguntas sugeridas y la respuesta a «¿qué hago ahora?» según lo cargado (datos, demo, verificación).
- Las respuestas pueden incluir botones «Ir a …» que cambian de sección; en móvil el chat se minimiza para no tapar el contenido.
- **Accesibilidad**: `role="dialog"`, `role="log"` con `aria-live`, etiquetas, foco al campo al abrir y de vuelta al botón al cerrar, Esc cierra, botones con área táctil ≥ 40 px en móvil y anillo de foco visible; con «reducir movimiento» se anulan las animaciones.

## Arquitectura
| Archivo | Papel |
|---|---|
| `lib/quetzalito/kb.ts` | Base de conocimiento (preguntas, respuestas, palabras clave ES/EN, secciones, textos de la interfaz) |
| `lib/quetzalito/engine.ts` | Motor puro: normalización, puntuación por palabras clave con prioridad por sección, «qué hago ahora» contextual, sugerencias |
| `lib/quetzalito/prefs.ts` | Preferencias persistentes (abierto/minimizado) |
| `lib/i18n/` | Idioma y tema globales que Quetzalito comparte con la plataforma |
| `lib/quetzalito/ai.ts` | Interfaz **opcional y desactivada** para una IA futura |
| `app/quetzalito/` | `Quetzalito.tsx` (chat), `Avatar.tsx` (SVG), `quetzalito.css` (temas, móvil, movimiento reducido) |

## Preguntas frecuentes implementadas (41)
| id | Español | English |
|---|---|---|
| `what-is` | ¿Qué es Quetzal Afterlife? | What is Quetzal Afterlife? |
| `how-navigate` | ¿Cómo navego por la plataforma? | How do I navigate the platform? |
| `sections-overview` | ¿Qué hace cada módulo? | What does each module do? |
| `recovery-vs-reconstruction` | ¿Qué diferencia hay entre recuperación y reconstrucción? | What is the difference between recovery and reconstruction? |
| `synthetic` | ¿Qué significa SINTÉTICO? | What does SYNTHETIC mean? |
| `demo-quick` | ¿Cómo pruebo la plataforma rápido? | How can I try the platform quickly? |
| `judges-route` | Ruta sugerida para jueces | Suggested route for judges |
| `upload-file` | ¿Cómo cargo un archivo? | How do I load a file? |
| `formats` | ¿Qué formatos soporta? | Which formats are supported? |
| `file-limits` | ¿Cuáles son los límites de tamaño? | What are the size limits? |
| `troubleshooting` | Me sale un error al cargar un archivo | I get an error when loading a file |
| `privacy` | ¿Mis datos salen de mi navegador? | Does my data leave my browser? |
| `originals-safe` | ¿Se modifica mi archivo original? | Is my original file modified? |
| `save-project` | ¿Cómo guardo mi trabajo? | How do I save my work? |
| `reopen-delete` | ¿Cómo reabro o elimino un proyecto? | How do I reopen or delete a project? |
| `export` | ¿Cómo exporto resultados? | How do I export results? |
| `verification-how` | ¿Cómo verifico un resultado? | How do I verify a result? |
| `lab-fields` | ¿Qué muestra el Laboratorio y qué es la «confianza»? | What does the Lab show and what is “confidence”? |
| `deleted-records` | ¿Qué son registros borrados y desconocidos? | What are deleted and unknown records? |
| `uncertainty` | ¿Qué significan «original», «recuperado», «desconocido» e «inferido»? | What do “original”, “recovered”, “unknown” and “inferred” mean? |
| `limitations` | ¿Qué NO hace la plataforma? | What does the platform NOT do? |
| `hologram` | ¿Qué es el holograma y cómo lo uso? | What is the hologram and how do I use it? |
| `hologram-stages` | ¿Cuáles son las seis etapas de la experiencia? | What are the six stages of the experience? |
| `hologram-colors` | ¿Qué significan los colores y las celdas del holograma? | What do the hologram colours and cells mean? |
| `language-theme` | ¿Cómo cambio el idioma y el tema? | How do I change the language and theme? |
| `keyboard-a11y` | ¿Puedo usar el teclado? ¿Y animaciones reducidas? | Can I use the keyboard? What about reduced motion? |
| `about-quetzalito` | ¿Quién eres y usas IA? | Who are you and do you use AI? |
| `discovery-what` | ¿Qué hace Discovery? | What does Discovery do? |
| `recovery-what` | ¿Qué hace Recovery? | What does Recovery do? |
| `schema-what` | ¿Qué hace Schema Intelligence? | What does Schema Intelligence do? |
| `reconstruction-what` | ¿Qué hace Reconstruction? | What does Reconstruction do? |
| `analyst-what` | ¿Qué hace AI Analyst? | What does AI Analyst do? |
| `ai-privacy` | ¿El analista usa una IA externa? | Does the analyst use an external AI? |
| `studio-what` | ¿Qué es Resurrection Studio? | What is Resurrection Studio? |
| `studio-crud` | ¿Puedo modificar datos en el Studio? | Can I modify data in the Studio? |
| `vault-what` | ¿Qué es Evidence Vault? | What is Evidence Vault? |
| `vault-integrity` | ¿Qué significa «Integridad verificada»? | What does “Integridad verificada” mean? |
| `filerec-what` | ¿Qué hace File Recovery? | What does File Recovery do? |
| `carving` | ¿Qué es el carving y por qué no es lo mismo que recuperar? | What is carving and why is it not the same as recovery? |
| `matrix` | ¿Qué es la matriz de capacidades? | What is the capability matrix? |
| `software-archaeology` | ¿Qué es Software Archaeology? | What is Software Archaeology? |

## Sugerencias por sección (ids de las FAQ anteriores)
Además de estas, siempre se ofrecen `recovery-vs-reconstruction`, `language-theme` y `limitations`.

| Sección | Preguntas sugeridas |
|---|---|
| Dashboard | `what-is`, `demo-quick`, `hologram`, `sections-overview` |
| Nueva recuperación | `upload-file`, `formats`, `file-limits`, `originals-safe` |
| Laboratorio | `lab-fields`, `deleted-records`, `export`, `synthetic` |
| Verificación | `verification-how`, `export`, `synthetic`, `uncertainty` |
| Archivo | `save-project`, `reopen-delete`, `export`, `privacy` |
| Discovery | `discovery-what`, `upload-file`, `synthetic`, `originals-safe` |
| Recovery | `recovery-what`, `uncertainty`, `recovery-vs-reconstruction`, `limitations` |
| Schema Intelligence | `schema-what`, `uncertainty`, `recovery-vs-reconstruction` |
| Reconstruction | `reconstruction-what`, `recovery-vs-reconstruction`, `uncertainty` |
| AI Analyst | `analyst-what`, `ai-privacy`, `uncertainty` |
| Resurrection Studio | `studio-what`, `studio-crud`, `export` |
| Evidence Vault | `vault-what`, `vault-integrity`, `export` |
| File Recovery | `filerec-what`, `formats`, `carving`, `matrix` |

## Cómo escalarlo a una versión con IA (futura, opcional)
1. **Hoy**: `resolveAnswer()` usa solo la base local. `lib/quetzalito/ai.ts` define `AssistantProvider` (`enabled()`, `ask()`) y `registerAssistantProvider()`; sin proveedor registrado, nada cambia.
2. **Cuándo se consulta**: solo si la base local no sabe responder (`kind === 'fallback'`) y el proveedor está habilitado; si falla o devuelve `null`, se usa la respuesta local.
3. **Qué se enviaría**: la pregunta y metadatos mínimos (sección, si hay datos, si es demo), **nunca** el contenido de los archivos. Requiere consentimiento explícito del usuario, mostrado en la interfaz antes de activar.
4. **Dónde vive la clave**: en un endpoint propio del servidor (por ejemplo `/api/quetzalito`), nunca en el navegador; con límite de tasa y registro, fijado a un modelo y a un presupuesto.
5. **Cómo mejorarlo**: usar la base de conocimiento como contexto recuperado, pedir respuestas con cita de la entrada y rechazar lo no respaldado, y añadir pruebas de regresión con preguntas reales.
6. **Interruptor**: variable de entorno en el servidor (desactivada por defecto) + preferencia del usuario; el chat mostraría «IA generativa» de forma visible, distinta de «respuesta guiada».

## Pruebas
- `lib/quetzalito/quetzalito.test.ts`: contenido completo en ES/EN para las 13 secciones y las 41 FAQ, enlaces internos válidos, honestidad (límites declarados), consultas ES/EN encaminadas a la FAQ correcta, adaptación por sección y por estado de sesión, IA desactivada/fallida/innecesaria, preferencias.
- `app/quetzalito/quetzalito.static.test.ts`: accesibilidad, persistencia, CSS de temas/movimiento reducido/móvil, sin red y sin importar motores ni holograma.
- Navegador (build de producción local): abrir/cerrar/minimizar, persistencia, Esc y retorno del foco, ES/EN, claro/oscuro, navegación desde el chat, móvil 375 px.

## Límites
- Las respuestas son las escritas en la base; una pregunta fuera de ella recibe sugerencias, no una invención.
- La comprensión es por palabras clave (sin modelo de lenguaje): preguntas muy indirectas pueden no encontrar la FAQ.
- Los mensajes ya escritos en el chat no se retraducen al cambiar de idioma; se ocultan y reaparecen al volver.
