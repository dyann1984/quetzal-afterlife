# Auditoría inicial — Competition Winner Edition

Rama de trabajo: `feat/competition-winner-edition` (desde `feat/integracion-final`, b0d8e74). Producción no tocada.
Fecha: 2026-11-02. Producción: https://quetzal-afterlife.vercel.app

## Evidencia ejecutada en esta auditoría
| Comprobación | Resultado |
|---|---|
| `vitest run` | 23 archivos, **309/309** pruebas pasan |
| `tsc --noEmit` | sin errores |
| `eslint .` | 0 errores, 3 avisos (`<img>` en HeroHologram.tsx y page.tsx) |
| `next build` | compila; rutas `/` y `/_not-found` estáticas |
| Producción: carga de `/` en navegador | carga, hero + menú lateral visibles, **sin errores de consola** |

## Matriz (estado según lo probado hasta ahora)
"NO PROBADO" significa que solo se revisó código/documentación; no se afirma que funcione.

| Área | Estado | Base |
|---|---|---|
| Home / dashboard (producción) | FUNCIONAL (carga) | probado en navegador |
| Navegación lateral, botones, formularios | NO PROBADO | pendiente e2e |
| ES/EN y temas claro/oscuro/sistema | NO PROBADO en vivo (hay pruebas i18n) | `lib/i18n/i18n.test.ts` |
| Recuperación PNG/JPEG/PDF/ZIP/TXT | FUNCIONAL a nivel de librería | pruebas unitarias + archivos reales |
| Reparación PNG (CRC, firmas) | PARCIAL: verificar qué daños repara | `lib/filerec/png.ts` |
| Recuperación tolerante de datos comprimidos (inflate parcial) | PARCIAL | `core.ts`, `zip.ts` |
| Píxeles JPEG | INEXISTENTE (solo estructura) | docs/recuperacion-universal.md |
| GIF/BMP/WebP/OLE2/audio/video/SQLite completo | INEXISTENTE (solo firma o cabecera) | matriz de capacidades |
| RESURRECTION LAB con ejemplos descargables | INEXISTENTE (hay fixtures sintéticos internos, sin sección guiada) | `lib/filerec/fixtures.ts` |
| Antes/después, progreso real, descarga | NO PROBADO en UI de File Recovery | `app/file-recovery.tsx` |
| Holograma 3D (GLB + 2.5D) | PARCIAL: existe, calidad artística sin evaluar; hay un encargo a artista 3D pendiente | `docs/glb-quetzal-bloqueo.md` |
| Quetzalito (asistente) | FUNCIONAL si es base de conocimiento local; no es IA generativa | `docs/quetzalito.md` |
| Demo guiada de 3 min / TRY QUETZAL NOW | INEXISTENTE como experiencia guiada (hay guion textual) | `docs/demo-jueces.md` |
| Móvil / tablet | NO PROBADO en esta auditoría (capturas de 375 px previas) | |
| Lighthouse, accesibilidad | NO PROBADO | |
| README en inglés | NO VERIFICADO | |

## Reglas de Kiroween
No pude verificar las reglas oficiales: `kiroween.devpost.com/rules` devuelve 403 y las fuentes secundarias describen la edición 2025 (plazo 5-dic-2025, ya vencido). **Necesito que me pegues el texto oficial vigente** (o confirmes qué concurso/plazo aplica); no inventaré requisitos. El repo ya incluye `.kiro/` y licencia MIT.

## Plan propuesto (en orden)
1. **Motor**: ampliar daños reparables de PNG, rangos de confianza, y añadir formatos viables (GIF/BMP estructurales, WAV/RIFF, ZIP con entradas dañadas), cada uno con pruebas y límites.
2. **RESURRECTION LAB**: 6 ejemplos generados de forma determinista (original + dañado + SHA-256), ejecución real en el navegador con progreso, antes/después, descarga y reporte.
3. **Demo guiada de 3 min** y botón TRY QUETZAL NOW.
4. **Diagnóstico**: explicador determinista basado en reglas (rotulado como tal, no IA). Un LLM externo requeriría API key y costo: no se usará sin tu autorización.
5. **Visual**: revisar el quetzal con capturas; mejora artística real requiere el modelo del artista 3D.
6. **Pruebas**: e2e en navegador, responsive, Lighthouse, README/arquitectura en inglés.

Nada de esto se desplegará ni se fusionará sin aprobación explícita.
