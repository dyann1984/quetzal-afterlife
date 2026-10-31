# Diseño técnico — Motor de Arqueología DBF

**Spec:** dbf-archaeology  
**Proyecto:** Quetzal Afterlife — The Digital Resurrection Engine  
**Fecha:** 2026-10-30  
**Estado:** BORRADOR — Solo especificación. No hay implementación todavía.

---

## 1. Visión general

El motor DBF es un módulo puro de TypeScript que opera íntegramente en el navegador del usuario.
Toma un `Uint8Array` (el archivo DBF crudo) y devuelve un `DbfResult` tipado o lanza un `DbfError`.
No hay I/O de red, no hay acceso al DOM, no hay efectos secundarios.

```
Uint8Array  ──►  parseDbf()  ──►  DbfResult
                     │
                     └─ lanza DbfError (errores fatales)
```

La interfaz de usuario consume `DbfResult` y lo presenta en la sección "Nueva recuperación",
diferenciando visualmente los campos activos, borrados y corruptos.

---

## 2. Árbol de archivos nuevo

```
lib/
  dbf.ts          ← módulo principal del motor (toda la lógica de parseo)
  dbf.test.ts     ← pruebas unitarias Vitest
fixtures/
  ejemplo.csv     ← (existente, intocable)
  dbase3.dbf      ← fixture sintético dBASE III mínimo (generado por pruebas)
  dbase4.dbf      ← fixture sintético dBASE IV (generado por pruebas)
  vfp.dbf         ← fixture Visual FoxPro (generado por pruebas)
  corrupt.dbf     ← fixture con encabezado válido pero registro truncado
  badversion.dbf  ← fixture con byte de versión 0xFF (no soportado)
docs/
  decisions.md    ← (existente; añadir entrada DBF)
  architecture.md ← (existente; actualizar sección "Siguientes fases")
  test-log.md     ← (existente; actualizar al completar las pruebas)
```

Los fixtures se construyen programáticamente en las pruebas con funciones auxiliares (`buildDbf`),
no se incluyen archivos binarios en el repositorio. Esto garantiza reproducibilidad sin archivos de
datos reales de terceros.

---

## 3. Tipos públicos

```typescript
// lib/dbf.ts

export const MAX_DBF_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_DBF_RECORDS = 10_000;

/** Códigos de error fatales */
export type DbfErrorCode =
  | 'ExtensionInvalida'
  | 'ArchivoVacio'
  | 'ArchivoDemasiadoGrande'
  | 'FormatoNoSoportado'
  | 'EncabezadoTruncado'
  | 'TamanioRegistroInconsistente'
  | 'NumCamposInconsistente'
  | 'ExcesoDeCampos'
  | 'CampoInvalido'
  | 'EncabezadoFalsificado'
  | 'RegistroTruncado';

export class DbfError extends Error {
  constructor(
    public readonly code: DbfErrorCode,
    message: string,
  ) { super(message); this.name = 'DbfError'; }
}

/** Códigos de advertencia (no fatales) */
export type DbfWarningCode =
  | 'VersionNoEstandar'
  | 'CodificacionDesconocida'
  | 'CodificacionNoSoportada'
  | 'TipoDesconocido'
  | 'CampoDuplicado'
  | 'CaracteresControlEliminados'
  | 'RegistrosBorrados'
  | 'RegistrosTruncados'
  | 'RegistroCorrupto';

export interface DbfWarning {
  code: DbfWarningCode;
  message: string;
  context?: string; // campo, offset o número de registro afectado
}

/** Descriptor de campo parseado */
export interface DbfField {
  name: string;         // max 10 caracteres, saneado
  type: string;         // 'C'|'N'|'D'|'L'|'M'|'F'|'G'|'P' u otro
  length: number;       // longitud en bytes
  decimalCount: number;
  typeKnown: boolean;   // false si el tipo no está en la lista blanca
}

/** Un registro parseado */
export interface DbfRecord {
  deleted: boolean;
  corrupt: boolean;
  corruptOffset?: number;
  values: Record<string, string>; // nombre_campo → valor texto
}

/** Metadatos del archivo */
export interface DbfMeta {
  versionByte: number;      // valor hex del byte 0
  versionLabel: string;     // descripción legible
  encodingByte: number;     // valor del byte 29
  encodingLabel: string;    // etiqueta WHATWG o 'desconocida'
  lastModified: string;     // YYYY-MM-DD derivado de bytes 1-3 (YY/MM/DD dBASE)
  recordCount: number;      // declarado en el encabezado
  recordCountActual: number;// realmente leídos (puede ser < si se truncó)
  deletedCount: number;
  fieldCount: number;
  recordSize: number;
  headerSize: number;
  warningCount: number;
}

/** Resultado de un parseo exitoso */
export interface DbfResult {
  meta: DbfMeta;
  fields: DbfField[];
  records: DbfRecord[];   // máx. MAX_DBF_RECORDS
  warnings: DbfWarning[];
}

/** Función de entrada pública */
export function parseDbf(bytes: Uint8Array, filename: string): DbfResult;
```

---

## 4. Algoritmo de parseo

### 4.1 Validaciones previas (O(1))

```
1. Extensión: endsWith('.dbf') case-insensitive → DbfError ExtensionInvalida
2. bytes.length === 0 → DbfError ArchivoVacio
3. bytes.length > MAX_DBF_BYTES → DbfError ArchivoDemasiadoGrande
4. bytes.length < 32 → DbfError EncabezadoTruncado
5. versionByte = bytes[0]; si no está en VERSION_MAP → DbfError FormatoNoSoportado
```

### 4.2 Lectura del encabezado principal (offsets 0–31)

```
bytes[0]       → versionByte
bytes[1..3]    → lastModified (YY, MM, DD)
bytes[4..7]    → recordCount (little-endian uint32)
bytes[8..9]    → headerSize (little-endian uint16)
bytes[10..11]  → recordSize (little-endian uint16)
bytes[29]      → encodingByte
```

Validaciones:
- `headerSize < 32` → `EncabezadoTruncado`
- `bytes.length < headerSize` → `EncabezadoTruncado`
- `(headerSize - 32 - 1) % 32 !== 0` → `NumCamposInconsistente` (advertencia, no fatal)
- `numFields > 255` → `DbfError ExcesoDeCampos`
- Protección de memoria: si `headerSize + recordCount * recordSize > bytes.length + 1_048_576` → `DbfError EncabezadoFalsificado`

### 4.3 Parseo de descriptores de campo (offset 32, bloques de 32 bytes)

```
Repetir (headerSize - 32 - 1) / 32 veces:
  nameBytes = bytes[offset..offset+11]
  rawName   = ASCII hasta primer \0 o posición 10
  name      = sanitize(rawName)   ← eliminar caracteres < 0x20
  type      = String.fromCharCode(bytes[offset+11])
  length    = bytes[offset+16]
  decimal   = bytes[offset+17]
  offset   += 32
```

Checks:
- `name === ''` → `DbfError CampoInvalido`
- `type` no en lista blanca → `DbfWarning TipoDesconocido`
- nombre duplicado → `DbfWarning CampoDuplicado`, segundo campo skipped
- caracteres de control eliminados → `DbfWarning CaracteresControlEliminados`

Verificación al terminar:
- `sumFieldLengths + 1 !== recordSize` → `DbfError TamanioRegistroInconsistente`

### 4.4 Lectura de registros (offset = headerSize)

```
para i en 0..min(recordCount, MAX_DBF_RECORDS):
  si offset + recordSize > bytes.length:
    lanzar DbfError RegistroTruncado (registro i)
  deletionFlag = bytes[offset]
  deleted = (deletionFlag === 0x2A)
  fieldOffset = offset + 1
  para cada field en fields:
    raw = bytes[fieldOffset..fieldOffset+field.length]
    value = decode(raw, encodingLabel)
    si trim: value = value.trim()
    fieldOffset += field.length
  records.push({deleted, corrupt: false, values})
  offset += recordSize
```

Si `recordCount > MAX_DBF_RECORDS`:
- Se añade `DbfWarning RegistrosTruncados` con los registros omitidos.

Manejo de corrupción por registro:
- Cualquier excepción durante la decodificación de un registro anota `corrupt: true` con el offset y continúa.

### 4.5 Decodificación de texto

```typescript
function decodeField(bytes: Uint8Array, encoding: string): string {
  // Terminar en \0
  const end = bytes.indexOf(0);
  const slice = end === -1 ? bytes : bytes.subarray(0, end);
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(slice);
  } catch {
    return '[DESCONOCIDO]';
  }
}
```

Las codificaciones DOS (cp437, cp850, etc.) son compatibles con `TextDecoder` en navegadores modernos
(especificación WHATWG Encoding). Si el constructor lanza, se emite `DbfWarning CodificacionNoSoportada`
y se devuelve `'[DESCONOCIDO]'` para los campos afectados.

---

## 5. Integración en la UI

### 5.1 Flujo de datos

```
page.tsx
  └─ <input type="file" accept=".dbf,.csv">
       └─ onChange → detectExtension()
            ├─ .csv → analyzeCsv() [existente, sin cambios]
            └─ .dbf → parseDbf()   [nuevo]
                 ├─ éxito → setDbfResult(result)
                 └─ error → setError(err.message)
```

### 5.2 Componentes nuevos en page.tsx

**`<DbfMetaBadge meta={DbfMeta} />`**  
Tabla compacta con: versión, codificación, fecha de modificación, nº registros, nº campos, nº borrados.

**`<DbfFieldList fields={DbfField[]} />`**  
Lista de campos con tipo, longitud y badget de advertencia si el tipo es desconocido.

**`<DbfRecordTable fields={DbfField[]} records={DbfRecord[]} />`**  
Tabla con máx. 10 filas; filas borradas con fondo semitransparente y etiqueta `[borrado]`;
filas corruptas con borde rojo y etiqueta `[corrupto · offset: N]`.

**`<DbfWarningList warnings={DbfWarning[]} />`**  
Lista colapsable de advertencias; visible solo si `warnings.length > 0`.

### 5.3 Diferenciación de estado de evidencia

Cada celda renderizada incluye un atributo `data-evidence` con uno de:
`recovered` | `deleted` | `corrupt` | `unknown`.

El CSS existente se extiende con cuatro nuevos modificadores sobre las clases `td` y `th` del tema
azul eléctrico / dorado metálico ya definido.

### 5.4 Paleta (sin cambios)

| Token            | Valor     | Uso                          |
|------------------|-----------|------------------------------|
| `--electric-blue`| `#24c4ff` | Encabezados de tabla, iconos |
| `--gold`         | `#d3b273` | Metadatos, kickers           |
| `--deleted-bg`   | `#1a1008` | Fondo de filas borradas      |
| `--corrupt-border`| `#ff4040`| Borde de filas corruptas     |

---

## 6. Mapa de decisiones técnicas

| Decisión                                    | Opción elegida                    | Razón                                                             |
|---------------------------------------------|-----------------------------------|-------------------------------------------------------------------|
| Ubicación del parser                        | `lib/dbf.ts`                      | Consistencia con `lib/csv.ts`; testeable sin DOM                  |
| Fixtures en binario o construidos en código | Construidos por funciones helper  | Sin archivos binarios de terceros; reproducibles                  |
| Codificaciones DOS                          | `TextDecoder` WHATWG              | Soporta cp437/cp850 en Chrome ≥ 63, Firefox ≥ 60                 |
| Registros borrados                          | Incluidos con `deleted: true`     | Arqueología: la evidencia borrada es evidencia                    |
| Memo fields                                 | Referencia opaca, sin leer        | El archivo .fpt/.dbt no está disponible en una sola carga         |
| Límite de registros                         | 10 000 (igual que CSV)            | Consistencia; ajustable en fases posteriores                      |
| Límite de tamaño                            | 4 MB (mayor que CSV)              | Los DBF de inventario histórico suelen ser más grandes que los CSV|
| Sincronía del parser                        | Síncrono                          | Archivos pequeños; evita complejidad async en fase 2              |
| Rama de desarrollo                          | `feat/dbf-archaeology`            | Aislamiento de master; sin conflictos con otras ramas             |

---

## 7. Estrategia de ramas

Para evitar conflictos con posibles ramas de Codex u otros colaboradores:

```bash
# Crear rama aislada desde el commit de referencia
git checkout -b feat/dbf-archaeology 35a708a

# Desarrollo en esa rama; merge a master únicamente
# cuando todos los criterios de aceptación estén verificados.
```

Si se usa git worktree (recomendado para trabajo paralelo):

```bash
git worktree add ../quetzal-dbf feat/dbf-archaeology
```

Esto crea `L:\QUETZAL AFTERLIFE\quetzal-dbf` con la rama `feat/dbf-archaeology`
sin afectar el directorio principal `quetzal-afterlife`.

---

## 8. Dependencias

No se añade ninguna dependencia de producción nueva. El motor usa únicamente:
- APIs nativas del navegador / Node: `Uint8Array`, `TextDecoder`, `DataView`
- Sin librerías externas de parseo DBF (el formato es lo suficientemente simple
  para implementación directa; las librerías existentes en npm no están mantenidas
  o tienen dependencias de Node.js incompatibles con el bundle del navegador)

---

## 9. Invariantes de diseño

1. `parseDbf` es una función pura: mismos bytes + nombre → mismo resultado.
2. Ningún valor recuperado se evalúa como código en ninguna ruta de ejecución.
3. El archivo nunca abandona el contexto del navegador del usuario.
4. Todos los errores llevan un `DbfErrorCode` enumerado; los mensajes de usuario están en español.
5. Las advertencias nunca interrumpen el parseo de registros ya iniciado.
6. El módulo no importa nada de React, Next.js ni del DOM.
