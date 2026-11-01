# Kiroween 2026 — material de presentación (borrador)

Categoría recomendada: **Resurrection** — revivir tecnología obsoleta con enfoques modernos.
Requisitos según la página oficial en Devpost (consultada el 2026-11-01); fecha límite: **4 de diciembre de 2026, 14:00 PT**.

## Propuesta de valor

Quetzal Afterlife convierte archivos y bases de datos que «ya no abren» en evidencia utilizable, **en el navegador y sin subir nada**. Diagnostica el daño byte a byte, aplica reparaciones deterministas, **vuelve a analizar cada reparación antes de aceptarla** y explica en lenguaje claro qué se salvó y qué no.

## Problema

Pequeños negocios, despachos y organizaciones conservan datos en formatos heredados (DBF, CSV exportados por sistemas viejos, SQLite de aplicaciones abandonadas, JSON/XML de integraciones rotas). Cuando un archivo se corrompe, las opciones habituales son:
- herramientas de escritorio opacas que dicen «recuperado» sin decir cómo;
- servicios en la nube que exigen subir datos sensibles;
- o perderlo.

## Diferenciación frente a recuperadores tradicionales

| | Recuperador típico | Quetzal Afterlife |
|---|---|---|
| Dónde se procesa | escritorio o nube | navegador, en memoria |
| Qué significa «recuperado» | sin definir | comprobación objetiva por elemento (CRC, JSON.parse, relectura, coherencia de registro) |
| Validación | ninguna | el resultado se analiza otra vez desde cero (etapa 05) |
| Pérdidas | ocultas | rangos de bytes dañados a escala, filas en cuarentena con su línea original |
| IA | rellena huecos | explica; nunca inventa contenido |

## Demostración reproducible (antes / después)

Todo se obtiene con **File Recovery → Cargar fixtures SINTÉTICOS**:

| Fixture | Antes | Después |
|---|---|---|
| `clientes-con-comentarios.json` | JSON.parse falla (comentarios, comas finales) | reparado y validado, sin pérdida |
| `clientes-truncado.json` | cortado a mitad de un registro | prefijo válido + cierres; pérdida marcada en el comparador |
| `clientes-truncado.xml` | etiquetas abiertas | XML bien formado |
| `clientes-irregular.csv` | filas de ancho distinto, comillas sin cerrar | tabla limpia + cuarentena con líneas originales |
| `inventario-mojibake.txt` | «AÃ±o», «cartÃ³n» | «Año», «cartón» con ida y vuelta exacta |
| `tienda-pagina-danada.db` | SQLite real con una hoja sobrescrita | filas legibles en CSV, página dañada localizada |

## Guion de video (≤ 3 min)

1. **0:00–0:20** Dashboard en oscuro: logotipo, holograma del quetzal y panel «Resurrecciones registradas» vacío — «aquí no hay cifras inventadas».
2. **0:20–1:05** File Recovery → arrastrar `clientes-con-comentarios.json`. Las seis etapas avanzan. Veredicto «Reparado y validado». Comparador: comentarios y comas desaparecen. Descargar y abrir el JSON.
3. **1:05–1:40** `clientes-truncado.json`: «Recuperación parcial verificada»; zona roja en el original; Quetzalito explica qué se perdió y por qué no se inventa.
4. **1:40–2:15** `tienda-pagina-danada.db`: mapa de bytes con la página 12 dañada; CSV de clientes íntegro y de ventas parcial.
5. **2:15–2:35** Cambiar a inglés y a tema claro; vista móvil.
6. **2:35–2:55** Dashboard con las estadísticas reales de la sesión. Cierre: «Ingeniería verificable, no magia».

## Cómo se usó Kiro — PENDIENTE (requisito oficial)

Devpost exige la carpeta `/.kiro` en la raíz con **specs, hooks y steering**, y una explicación de cómo se usó Kiro. Hoy el repositorio tiene steering y dos specs preparatorias **sin evidencia de ejecución en Kiro y sin hooks**. Este texto solo puede escribirse después de usar Kiro de verdad. Sugerencias concretas:

- Abrir el repositorio en Kiro y crear una spec (requisitos → diseño → tareas) para el siguiente formato del roadmap (p. ej. JSON Lines o un Web Worker de aislamiento) e implementarla con Kiro.
- Añadir un **hook** de Kiro que ejecute `npm test` y `npm run typecheck` al guardar archivos de `lib/filerec/`.
- Registrar en `.kiro/README.md`: fecha, versión de Kiro, tareas ejecutadas, commits resultantes y pruebas.

No declarar uso de Kiro para el trabajo descrito en `CHANGELOG.md` bajo 2026-11-01: se hizo con Claude.

## Lista de verificación para enviar

- [ ] Repositorio **público** en GitHub (hoy es privado).
- [ ] Rama por defecto con el código final (hoy `feat/fase-4-estabilizacion`, desactualizada).
- [ ] `/.kiro` con specs, hooks y steering reales; no ignorada en `.gitignore`.
- [ ] URL de la app desplegada con este código.
- [ ] Video público en YouTube < 3 min, sin música con derechos.
- [ ] Descripción y explicación del uso de Kiro.
