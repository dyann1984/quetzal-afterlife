# Requisitos — Motor de Arqueología DBF

**Spec:** dbf-archaeology  
**Proyecto:** Quetzal Afterlife — The Digital Resurrection Engine  
**Fecha:** 2026-10-30  
**Estado:** BORRADOR — Solo especificación. No hay implementación todavía.

---

## Contexto

El proyecto ya dispone de un importador CSV con siete pruebas unitarias verificadas (commit 35a708a).
El siguiente paso es añadir soporte para archivos DBF (dBASE III/IV/5, FoxPro 2.x/3.x, Visual FoxPro 9),
que representan una fracción significativa de los sistemas de inventario heredados que Quetzal Afterlife
debe recuperar digitalmente.

El principio fundamental del proyecto se mantiene: toda afirmación sobre los datos debe indicar si la
información es **recuperada**, **inferida**, **verificada** o **desconocida**.

---

## Requisitos funcionales

### RF-01 — Lectura segura de archivos DBF

- **RF-01.1** El sistema DEBE aceptar archivos con extensiones `.dbf`, `.DBF`.
- **RF-01.2** El sistema DEBE leer el archivo como bytes crudos (`Uint8Array`) sin ejecutarlo ni interpretarlo como código.
- **RF-01.3** El sistema DEBE rechazar archivos vacíos (0 bytes).
- **RF-01.4** El sistema DEBE rechazar archivos que superen **4 MB** (límite conservador para la fase 2; ajustable en fases posteriores).
- **RF-01.5** La lectura se realiza íntegramente en el navegador del usuario; el archivo no se transmite al servidor.

### RF-02 — Detección y validación de formato

- **RF-02.1** El sistema DEBE leer el byte de versión (offset 0) e identificar los dialectos soportados:
  - `0x03` — dBASE III sin memo
  - `0x04` — dBASE IV sin memo
  - `0x05` — dBASE 5.0 sin memo
  - `0x83` — dBASE III con memo
  - `0x8B` — dBASE IV con memo
  - `0xF5` — FoxPro 2.x con memo
  - `0x30` — Visual FoxPro
- **RF-02.2** Un byte de versión no reconocido DEBE producir un error `FormatoNoSoportado` con el valor hexadecimal exacto.
- **RF-02.3** El sistema DEBE verificar que la longitud del encabezado declarada (`bytes[8..9]`, little-endian uint16) es coherente con el número de campos declarado: `(header_size - 32 - 1) / 32 >= 1`.
- **RF-02.4** El sistema DEBE verificar que el tamaño de registro declarado (`bytes[10..11]`) es coherente: `sum(field_lengths) + 1 == record_size` (el +1 es el byte de borrado).
- **RF-02.5** Un encabezado truncado (archivo más corto que `header_size`) DEBE producir un error `EncabezadoTruncado`.

### RF-03 — Estructura de campos

- **RF-03.1** El sistema DEBE parsear cada descriptor de campo (bloques de 32 bytes desde offset 32):
  - `name`: bytes 0–10, ASCII, terminado en `\0`, máx. 10 caracteres.
  - `type`: byte 11, uno de `C`, `N`, `D`, `L`, `M`, `F`, `G`, `P`.
  - `length`: byte 16.
  - `decimal_count`: byte 17.
- **RF-03.2** Un nombre de campo vacío o que contenga únicamente bytes nulos DEBE producir un error `CampoInvalido`.
- **RF-03.3** Un tipo de campo desconocido DEBE registrarse como advertencia `TipoDesconocido` (no error), con el nombre del campo y el byte decimal del tipo.
- **RF-03.4** El sistema DEBE detectar nombres de campo duplicados e ignorar con advertencia el segundo campo duplicado, sin abortar el proceso.
- **RF-03.5** El número de campos NO DEBE superar **255**; si lo supera, se produce el error `ExcesoDeCampos`.

### RF-04 — Lectura de registros

- **RF-04.1** El sistema DEBE leer los registros desde el offset `header_size`.
- **RF-04.2** El primer byte de cada registro es el marcador de borrado: `0x20` = activo, `0x2A` (`*`) = borrado. Los registros borrados DEBEN incluirse en el resultado con la propiedad `deleted: true`.
- **RF-04.3** Los valores de los campos se extraen por posición; el recorte de espacios es configurable (por defecto: activado).
- **RF-04.4** El sistema DEBE limitarse a leer **10 000 registros** en total (activos + borrados); los restantes se descartan con advertencia `RegistrosTruncados`.
- **RF-04.5** Un registro cuya suma de bytes no coincida con `record_size` declarado (archivo truncado en medio de un registro) DEBE producir un error `RegistroTruncado` con el número de registro afectado.

### RF-05 — Codificación y texto

- **RF-05.1** El sistema DEBE leer el byte de página de código (offset 29) y mapear los códigos conocidos a etiquetas de codificación:
  - `0x00` → desconocida (advertencia `CodificacionDesconocida`)
  - `0x01` → `cp437` (DOS EE. UU.)
  - `0x02` → `cp850` (DOS Multilingüe)
  - `0x64` → `cp852` (DOS Centroeuropeo)
  - `0x96` → `cp1251` (Windows Cirílico)
  - `0xC8` → `cp1250` (Windows Centroeuropeo)
  - `0xC9` → `cp1251` (Windows Cirílico)
  - `0xCA` → `cp1254` (Windows Turco)
  - `0xCB` → `cp1253` (Windows Griego)
- **RF-05.2** Para codificaciones no UTF-8, el sistema DEBE intentar decodificar con la API `TextDecoder` del navegador si el nombre de codificación es compatible con la especificación WHATWG Encoding. Si no lo es, DEBE marcar los campos afectados como `DESCONOCIDO` y emitir una advertencia.
- **RF-05.3** Los bytes nulos en cadenas de texto DEBEN tratarse como terminadores de cadena, no como errores.
- **RF-05.4** El sistema NO DEBE rechazar automáticamente archivos con codificaciones no UTF-8; la codificación identificada se incluye en los metadatos del resultado.

### RF-06 — Manejo de errores y datos corruptos

- **RF-06.1** Todos los errores DEBEN tener un código de error estructurado (`DbfErrorCode`) y un mensaje en español legible para el usuario.
- **RF-06.2** Los errores fatales (malformación del encabezado, archivo demasiado corto, versión no soportada) DEBEN abortar el procesamiento y lanzar una excepción tipada `DbfError`.
- **RF-06.3** Las advertencias (registros borrados, tipo de campo desconocido, codificación no estándar, duplicados) DEBEN acumularse en `DbfResult.warnings` sin interrumpir el procesamiento.
- **RF-06.4** Los registros parcialmente corruptos DEBEN anotarse individualmente con `corrupt: true` y el offset exacto del error; el procesamiento continúa con el siguiente registro.
- **RF-06.5** El sistema NUNCA DEBE ejecutar valores recuperados como código, evaluarlos como fórmulas ni interpretarlos como URLs.

### RF-07 — Seguridad y entradas maliciosas

- **RF-07.1** El sistema DEBE rechazar cualquier archivo cuyo byte de versión no esté en la lista blanca (RF-02.1), aunque el resto del encabezado parezca válido.
- **RF-07.2** Los nombres de campo DEBEN sanearse: se eliminan caracteres de control (< 0x20) antes de almacenarlos; se registra una advertencia si se eliminó alguno.
- **RF-07.3** Los valores de las celdas de tipo `M` (memo) DEBEN tratarse como referencias opacas (número de bloque); el contenido del archivo de memo NO se lee en esta fase.
- **RF-07.4** El sistema DEBE rechazar archivos en los que la suma `header_size + record_count * record_size` supere en más de **1 MB** el tamaño real del archivo (protección contra encabezados falsificados que provoquen asignación masiva de memoria).
- **RF-07.5** El procesamiento DEBE realizarse de forma síncrona y sin acceso a red, DOM ni APIs de sistema de ficheros del servidor.

---

## Requisitos no funcionales

### RNF-01 — Rendimiento
El análisis de un archivo DBF de 4 MB con 10 000 registros y 50 campos DEBE completarse en menos de **2 segundos** en un navegador moderno.

### RNF-02 — Mantenibilidad
La lógica de parseo debe residir en `lib/dbf.ts`; la integración UI en `app/page.tsx`. No se mezclan.

### RNF-03 — Trazabilidad
Cada resultado DEBE incluir metadatos: `version_byte`, `encoding_label`, `record_count`, `field_count`, `deleted_count`, `warning_count`.

### RNF-04 — Compatibilidad de pruebas
El módulo DEBE ser completamente testeable con Vitest sin dependencias del navegador (los tipos `Uint8Array` y `TextDecoder` son globales en Node ≥ 18; los demás accesos al DOM están prohibidos en el módulo).

### RNF-05 — Diseño
La interfaz DEBE conservar el esquema de color azul eléctrico (`#24c4ff`, `#13bfff`) y dorado metálico (`#d3b273`, `#c6aa70`) existente. No se introduce ningún nuevo framework de UI.

---

## Criterios de aceptación globales

| ID   | Criterio                                                                 | Verificable por        |
|------|--------------------------------------------------------------------------|------------------------|
| CA-01 | Un DBF dBASE III válido devuelve campos, registros y metadatos correctos | Prueba unitaria        |
| CA-02 | Un byte de versión desconocido lanza `FormatoNoSoportado`               | Prueba unitaria        |
| CA-03 | Un archivo de 4 MB + 1 byte es rechazado antes del parseo               | Prueba unitaria        |
| CA-04 | Los registros borrados aparecen con `deleted: true`, no omitidos        | Prueba unitaria        |
| CA-05 | Los campos con nombres duplicados producen advertencia, no error        | Prueba unitaria        |
| CA-06 | Los valores nunca se evalúan como código ni fórmulas                   | Revisión de diseño     |
| CA-07 | Las 7 pruebas CSV existentes siguen pasando sin modificación            | CI / `vitest run`      |
| CA-08 | La UI muestra metadatos DBF diferenciando estado de cada campo         | Inspección visual      |
| CA-09 | `vitest run` pasa con 0 fallos antes de mergear                        | CI                     |

---

## Fuera de alcance (esta fase)

- Lectura de archivos de memo (`.fpt`, `.dbt`).
- Índices (`.ndx`, `.mdx`, `.cdx`).
- Cifrado de registros VFP.
- Descarga o exportación del resultado.
- Persistencia del proyecto.
- Despliegue en producción.
