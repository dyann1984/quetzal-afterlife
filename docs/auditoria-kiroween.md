# Auditoría — Fase A (2026-11-01)

Rama de trabajo: `feat/kiroween-resurrection`, creada desde `feat/integracion-final` (b0d8e74).
No se ha tocado producción ni la rama por defecto.

## 1. Estado del repositorio

| Elemento | Hallazgo |
|---|---|
| Visibilidad | **Privado.** Kiroween exige repositorio público en GitHub. |
| Rama por defecto | `feat/fase-4-estabilizacion` (no existe `main`). Está **por detrás** de `feat/integracion-final`: no incluye Quetzalito, ES/EN, temas, holograma ni recuperación universal. |
| Ramas | 11. Historia lineal: `fase-4` → experiencia 3D → holograma → recuperación universal → holograma Q v2 / GLB / 2.5D → Quetzalito → i18n/tema → `integracion-final` (la más completa). |
| Etiqueta | `backup/produccion-pre-v2-bc445bf`: copia de seguridad previa al motor 2.0. |
| Primer commit | 2026-10-30 20:22 (-06:00), dentro del periodo de Kiroween 2026 (30-oct → 4-dic). |
| Licencia | MIT (detectada por GitHub). |
| `.kiro/` | Steering y 2 specs (DBF, inventario). **No hay hooks.** El propio `.kiro/README.md` aclara que es preparación y no evidencia de uso de Kiro. |
| Producción | `quetzal-afterlife.vercel.app` no es accesible desde este entorno (red restringida): **no se pudo verificar qué commit está desplegado.** |

## 2. Verificación base (en `integracion-final`, Node 22.23.4, Linux)

| Comprobación | Resultado |
|---|---|
| `npm ci` | PASS |
| `vitest run` | PASS — 307 pruebas, 2 omitidas, 23 archivos |
| `tsc --noEmit` | PASS |
| `eslint .` | PASS — 0 errores, 3 advertencias `<img>` |
| `next build` | PASS — ruta estática `/` |

## 3. Clasificación de módulos

| Módulo | Estado | Notas |
|---|---|---|
| CSV / DBF (importación, laboratorio, verificación, archivo) | Terminado | Probado con fixtures sintéticos; sin DBF real. |
| Motor 2.0 (Discovery → Vault) | Terminado (tabular) | SHA-256, recuperación tolerante, esquema, reconstrucción, expediente. |
| File Recovery: PNG, TXT | Terminado | Verificación por CRC-32 / decodificación. |
| File Recovery: JPEG, PDF, ZIP/DOCX/XLSX | Parcial | Estructura y extracción; JPEG sin decodificar píxeles. |
| SQLite | Parcial | Solo firma/cabecera. |
| JSON, XML, CSV irregular como archivo suelto | **Falta** | Un JSON/XML roto solo se trata como texto plano. |
| Texto con codificación dañada | Parcial | Detecta UTF-8 inválido; no repara mojibake ni localiza el byte. |
| Protocolo de seis etapas | **Desconectado** | La experiencia 3D usa etapas del motor tabular (Materialización…Vault), no un flujo por archivo con validación real. |
| Comparador antes/después | **Falta** | |
| Quetzalito | Terminado (local) | Base de conocimiento fija; **no** lee el diagnóstico de un archivo concreto. IA externa desactivada. |
| Dashboard | **Parcial / vacío** | Tarjetas estáticas y rótulo obsoleto «FASE 03». Sin estadísticas reales. |
| Historial de operaciones | **Falta** | |

## 4. Por qué hay pantallas que «aparecen vacías»

1. **File Recovery pierde los resultados al cambiar de sección.** El componente se monta solo cuando la sección está activa y su estado vive dentro; al navegar se desmonta y los informes desaparecen.
2. **El Dashboard no tiene datos** que mostrar: no existía una fuente de estadísticas reales.
3. **Las secciones del motor 2.0 están vacías hasta cargar evidencia** (comportamiento correcto, pero el estado vacío no siempre explica qué hacer).
4. No hay APIs, base de datos ni variables de entorno: todo es local; no hay diferencias de configuración entre desarrollo y producción que expliquen vacíos.

## 5. Requisitos de Kiroween 2026 (Devpost) frente al estado actual

| Requisito | Estado |
|---|---|
| Repositorio público en GitHub con código e instrucciones | Pendiente (privado) |
| Licencia de código abierto visible | Cumple (MIT) |
| `/.kiro` en la raíz con specs, hooks y steering | Parcial: falta hooks y evidencia real de uso |
| URL de la aplicación funcionando | Existe; verificar el commit desplegado |
| Descripción del proyecto | Pendiente (borrador en `docs/kiroween.md`) |
| Video público < 3 min | Pendiente |
| Explicación de cómo se usó Kiro | Pendiente; solo puede escribirse con uso real |
| Categoría | Recomendada: **Resurrection** |

Fuente: página oficial en Devpost (consultada 2026-11-01).
