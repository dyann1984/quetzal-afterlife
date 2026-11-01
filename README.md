# QUETZAL AFTERLIFE
### The Digital Resurrection Engine

Plataforma de recuperación digital que se ejecuta **íntegramente en el navegador**. Diagnostica archivos dañados, los repara con mecanismos verificables, **vuelve a analizar cada reparación desde cero** antes de darla por buena y explica el resultado sin inventar nada.

> Lo sobrescrito o ausente no existe. Quetzal no promete recuperación universal: distingue lo recuperado, lo reparado, lo inferido y lo irrecuperable.

## Qué hace

**Resurrección de archivos (protocolo de seis etapas).** Cada etapa avanza solo cuando el motor la termina:

| Etapa | Qué ocurre de verdad |
|---|---|
| 01 Detección | Tipo real por firma binaria (no por extensión) y SHA-256 del original. |
| 02 Diagnóstico | Analizador del formato: hallazgos, rangos de bytes dañados, recuperabilidad. |
| 03 Reconstrucción | Estrategia de reparación determinista, enumerada en una nota. |
| 04 Restauración | Archivo reparado, o paquete ZIP solo con lo verificado. |
| 05 Validación | El artefacto se analiza otra vez desde cero (JSON.parse, buena formación, CRC…). |
| 06 Renacimiento | Veredicto honesto y descarga. El original nunca se modifica. |

| Formato | Diagnóstico | Reparación / recuperación |
|---|---|---|
| JSON | línea, columna y byte del error | quita comentarios y comas finales; si está truncado conserva el prefijo válido y cierra la estructura |
| XML / SVG | buena formación completa, sin entidades externas (XXE) | escapa `&` sueltos; cierra etiquetas al truncar |
| CSV / TSV | delimitador, comillas, filas irregulares por línea | tabla limpia + cuarentena con la línea original |
| SQLite 3 | cabecera, B-trees, ciclos, punteros, registros | exporta filas legibles a CSV y el esquema a SQL |
| Texto | offset exacto de cada byte UTF-8 inválido | revierte doble codificación (mojibake) con ida y vuelta exacta |
| PNG, JPEG, PDF, ZIP/DOCX/XLSX | CRC-32, Adler-32, estructura | extracción verificada, reconstrucción de xref/ZIP |
| Imagen de disco en bruto | carving por firmas | candidatos contiguos analizados uno por uno |

La **Matriz de capacidades** (dentro de la app) muestra qué está implementado, qué es parcial y qué no existe; una prueba automatizada comprueba que cada entrada apunte a código y pruebas reales.

**Motor 2.0 tabular** (Discovery → Evidence Vault): bases DBF/CSV heredadas, recuperación por registro, inferencia de esquema, reconstrucción multitabla y expediente verificable.

**Quetzalito**: asistente bilingüe local. Explica cada resultado con frases construidas a partir del informe real (qué es, qué daño hay, qué se hizo, qué no se recuperó).

**Dashboard**: estadísticas reales del historial de este navegador (solo metadatos). Sin datos, un estado vacío; nunca cifras de relleno.

ES/EN, tema claro/oscuro/sistema, diseño responsivo y respeto a «reducir movimiento».

## Ejecutar

Node.js 22.12+ (serie 22), 24 o 26+.

```sh
npm ci
npm run dev                  # http://localhost:3000
```

Comprobaciones:

```sh
npm run lint && npm run typecheck && npm test && npm run build
npm run build && npx next start -p 4173   # en otra terminal
npm run test:e2e                          # Chrome del sistema; CHROME_PATH para otra ruta
```

Para probar sin archivos propios: **File Recovery → Cargar fixtures SINTÉTICOS** (JSON, XML, CSV, texto, PNG, JPEG, PDF, DOCX/XLSX, ZIP, una base SQLite real con una página sobrescrita y una imagen de disco).

## Privacidad y seguridad

- Los archivos se procesan en memoria en el navegador; no se envían a ningún servidor. No hay variables de entorno ni claves.
- El historial guarda solo metadatos (nombre, formato, tamaño, SHA-256, veredicto) en `localStorage`.
- Límite de tamaño antes de leer (8 MiB), límites anti-bomba de descompresión, nombres normalizados contra *zip-slip*, profundidad máxima en JSON/XML, entidades externas nunca resueltas, ejecutables identificados y nunca ejecutados.
- No recupera discos físicos ni archivos borrados de un sistema de archivos: un navegador no tiene acceso a eso.

## Documentación

[Kiroween 2026](docs/kiroween.md) · [Protocolo de resurrección](docs/protocolo-resurreccion.md) · [Auditoría](docs/auditoria-kiroween.md) · [Recuperación universal y roadmap](docs/recuperacion-universal.md) · [Arquitectura](docs/architecture.md) · [Registro de pruebas](docs/test-log.md) · [Cambios](CHANGELOG.md) · [Guía de demo](docs/demo-jueces.md)

Logo suministrado por la autora; la licencia MIT se aplica al código y no implica cesión de derechos sobre la marca o la imagen.
