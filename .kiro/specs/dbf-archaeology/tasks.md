# Plan de tareas — Motor de Arqueología DBF

**Spec:** dbf-archaeology  
**Proyecto:** Quetzal Afterlife — The Digital Resurrection Engine  
**Fecha:** 2026-10-30  
**Estado:** PENDIENTE — Las tareas no deben comenzarse hasta que los tres archivos de spec sean revisados y aprobados.

---

## Prerrequisitos

- [ ] Revisar y aprobar `requirements.md`
- [ ] Revisar y aprobar `design.md`
- [ ] Crear la rama `feat/dbf-archaeology` desde el commit `35a708a`
- [ ] Verificar que `vitest run` sigue pasando 7/7 en `master` antes de ramificar

---

## Tarea 1 — Scaffolding y tipos base

**Descripción:** Crear `lib/dbf.ts` con todos los tipos exportados, constantes y la firma de `parseDbf`. El cuerpo de la función lanza `new Error('no implementado')`. Crear `lib/dbf.test.ts` con la estructura de `describe` y los primeros esqueletos de prueba.

**Archivos afectados:**
- `lib/dbf.ts` (nuevo)
- `lib/dbf.test.ts` (nuevo)

**Criterios de finalización:**
- `vitest run` pasa: 7 pruebas CSV + 0 pruebas DBF (aún vacías) = sin regresión.
- `tsc --noEmit` pasa sin errores.
- Ningún import de React, Next.js o DOM en `lib/dbf.ts`.

---

## Tarea 2 — Validaciones previas y parseo de encabezado

**Descripción:** Implementar las validaciones O(1) (extensión, tamaño, versión) y la lectura del encabezado principal (offsets 0–31). Implementar las pruebas correspondientes con fixtures construidos por código.

**Archivos afectados:**
- `lib/dbf.ts`
- `lib/dbf.test.ts`

**Pruebas obligatorias:**
- `rechaza extensión no .dbf` → `DbfError ExtensionInvalida`
- `rechaza archivo vacío` → `DbfError ArchivoVacio`
- `rechaza archivo de 4 MB + 1 byte` → `DbfError ArchivoDemasiadoGrande`
- `rechaza encabezado menor de 32 bytes` → `DbfError EncabezadoTruncado`
- `rechaza byte de versión 0xFF` → `DbfError FormatoNoSoportado` con valor hex `'0xff'`
- `acepta byte de versión 0x03` → no lanza (puede lanzar `no implementado` aún)
- `rechaza encabezado falsificado (headerSize + count*recSize >> fileSize)` → `DbfError EncabezadoFalsificado`

**Criterios de finalización:**
- Todas las pruebas de esta tarea en PASS.
- Sin regresión en las 7 pruebas CSV.

---

## Tarea 3 — Parseo de descriptores de campo

**Descripción:** Implementar la lectura de los bloques de 32 bytes de campo. Validar nombres, tipos, duplicados y caracteres de control. Verificar coherencia `sumFieldLengths + 1 === recordSize`.

**Archivos afectados:**
- `lib/dbf.ts`
- `lib/dbf.test.ts`

**Pruebas obligatorias:**
- `parsea 3 campos de un DBF dBASE III mínimo` → devuelve `fields` con nombres y tipos correctos
- `campo con nombre vacío` → `DbfError CampoInvalido`
- `campo con tipo desconocido (0xAB)` → `DbfWarning TipoDesconocido`, `typeKnown: false`
- `campos duplicados` → `DbfWarning CampoDuplicado`, solo el primero en `fields`
- `caracteres de control en nombre` → `DbfWarning CaracteresControlEliminados`, nombre saneado
- `sumFieldLengths + 1 !== recordSize` → `DbfError TamanioRegistroInconsistente`
- `más de 255 campos declarados` → `DbfError ExcesoDeCampos`

**Criterios de finalización:**
- Todas las pruebas de esta tarea en PASS.
- Sin regresión.

---

## Tarea 4 — Lectura de registros

**Descripción:** Implementar el bucle de lectura de registros desde `headerSize`. Manejar el byte de borrado, extraer valores por posición, detectar archivos truncados en mitad de un registro, y recortar a `MAX_DBF_RECORDS`.

**Archivos afectados:**
- `lib/dbf.ts`
- `lib/dbf.test.ts`

**Pruebas obligatorias:**
- `DBF con 2 registros activos` → `records.length === 2`, ambos `deleted: false`
- `DBF con 1 registro activo y 1 borrado` → `records[1].deleted === true`
- `DBF con 10 001 registros` → `records.length === 10 000`, `DbfWarning RegistrosTruncados`
- `DBF truncado en mitad del segundo registro` → `DbfError RegistroTruncado` con `context: '1'` (0-indexed)
- `registro con bytes de relleno (0x20)` → valores recortados correctamente
- `meta.deletedCount` refleja el recuento correcto

**Criterios de finalización:**
- Todas las pruebas de esta tarea en PASS.
- Sin regresión.

---

## Tarea 5 — Codificación y decodificación de texto

**Descripción:** Implementar la tabla de mapeo `ENCODING_MAP` (byte 29 → etiqueta WHATWG), la función `decodeField` con `TextDecoder`, y los casos de codificación desconocida o no soportada.

**Archivos afectados:**
- `lib/dbf.ts`
- `lib/dbf.test.ts`

**Pruebas obligatorias:**
- `byte 0x01 (cp437)` → `meta.encodingLabel === 'ibm437'` (nombre WHATWG de cp437)
- `byte 0x02 (cp850)` → `meta.encodingLabel === 'ibm850'`
- `byte 0x00 (desconocida)` → `DbfWarning CodificacionDesconocida`, registros procesados igualmente
- `byte de codificación no mapeado (0xAA)` → `DbfWarning CodificacionDesconocida`
- `campo con bytes nulos interiores` → truncado en el primer `\0`, no error
- `campo CP850 con carácter Ñ` → decodificado correctamente si `TextDecoder` soporta `ibm850`

**Nota para prueba basada en propiedades:** Para cualquier secuencia de bytes sin `\0`, `decodeField(bytes, 'utf-8')` no lanza excepción.

**Criterios de finalización:**
- Todas las pruebas de esta tarea en PASS.
- Sin regresión.

---

## Tarea 6 — Pruebas de integridad, casos límite y propiedades

**Descripción:** Añadir pruebas exhaustivas de integración y basadas en propiedades usando las funciones helper `buildDbf`. No se usa ninguna librería de fuzzing; las propiedades se verifican con bucles explícitos sobre entradas parametrizadas.

**Archivos afectados:**
- `lib/dbf.test.ts`

**Pruebas de integración:**
- `fixture dBASE III completo: 3 campos, 5 registros` → resultado íntegro verificado campo a campo
- `fixture dBASE IV` → byte de versión `0x04`, campos y registros correctos
- `fixture Visual FoxPro` → byte de versión `0x30`, campos y registros correctos
- `fixture con registro corrupto` → `records[N].corrupt === true`, `warnings` incluye `RegistroCorrupto`, resto OK

**Pruebas de casos límite:**
- `archivo de exactamente 32 bytes` (encabezado mínimo, sin campos ni registros) → resultado vacío o error coherente
- `archivo de exactamente 4 MB` → procesado sin error de tamaño
- `registro único con todos los tipos C, N, D, L` → todos los valores parseados
- `campo con `length: 0`` → advertencia o error coherente (no crash)

**Pruebas basadas en propiedades (parametrizadas):**
- Para `N in [0, 1, 10, 100, 1000, 10000]` registros: `records.length === Math.min(N, MAX_DBF_RECORDS)`
- Para cualquier `versionByte` en VERSION_MAP: `parseDbf` no lanza `FormatoNoSoportado`
- Para cualquier `versionByte` fuera de VERSION_MAP: `parseDbf` lanza `FormatoNoSoportado`
- Para cualquier campo con nombre ASCII printable de 1–10 caracteres: el nombre en el resultado es idéntico al original

**Criterios de finalización:**
- Todas las pruebas en PASS.
- `vitest run` reporta ≥ 25 pruebas pasando (7 CSV + ≥ 18 DBF).
- Sin regresión.

---

## Tarea 7 — Integración en la UI

**Descripción:** Extender `app/page.tsx` para aceptar archivos `.dbf`, llamar a `parseDbf` y mostrar `DbfMetaBadge`, `DbfFieldList`, `DbfRecordTable` y `DbfWarningList`. Añadir los modificadores CSS necesarios en `globals.css` sin alterar los colores existentes.

**Archivos afectados:**
- `app/page.tsx`
- `app/globals.css`

**Criterios de finalización:**
- El selector de archivo acepta `.dbf` además de `.csv`.
- Un DBF válido muestra: versión, codificación, número de registros, campos con tipos.
- Las filas borradas se renderizan con estilo visual diferenciado (fondo `#1a1008`).
- Las filas corruptas se renderizan con borde rojo y offset.
- Las advertencias son visibles pero colapsables.
- Un error DBF muestra el mensaje en el bloque `role="alert"` existente.
- `eslint .` y `tsc --noEmit` pasan sin errores.
- `next build` completa sin errores.
- Las 7 pruebas CSV siguen pasando (`vitest run`).

---

## Tarea 8 — Documentación y actualización de logs

**Descripción:** Actualizar los archivos de documentación para reflejar la nueva capacidad DBF.

**Archivos afectados:**
- `docs/decisions.md` — añadir entrada: razón para no usar librerías npm de DBF, decisión sobre TextDecoder
- `docs/architecture.md` — mover DBF de "Siguientes fases" a la descripción de fase 2
- `docs/test-log.md` — registrar resultados reales de `vitest run` con recuento de pruebas DBF

**Criterios de finalización:**
- Los tres archivos docs actualizados con evidencia real (resultados de pruebas, no afirmaciones).
- Ningún resultado marcado como PASS sin haberse ejecutado.

---

## Orden de ejecución recomendado

```
Tarea 1 → Tarea 2 → Tarea 3 → Tarea 4 → Tarea 5 → Tarea 6 → Tarea 7 → Tarea 8
```

Las tareas 2–5 son secuenciales (cada una depende de la anterior).  
La tarea 6 puede empezarse parcialmente en paralelo con la 5.  
La tarea 7 requiere que las tareas 2–5 estén completas.  
La tarea 8 es la última.

---

## Rama de trabajo

```bash
# Desde el directorio principal (no modificar master hasta merge final)
git checkout -b feat/dbf-archaeology 35a708a

# Opción alternativa con worktree aislado:
git worktree add ../quetzal-dbf feat/dbf-archaeology
```

El merge a `master` solo se realiza cuando:
1. `vitest run` pasa con 0 fallos (CSV + DBF).
2. `tsc --noEmit` pasa.
3. `eslint .` pasa (o solo advertencias conocidas documentadas).
4. `next build` pasa.
5. La UI muestra evidencia DBF real en el navegador.
6. `docs/test-log.md` refleja los resultados reales.
