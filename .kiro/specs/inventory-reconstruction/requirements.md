# Requisitos — Reconstrucción de Inventario

**Spec:** inventory-reconstruction  
**Proyecto:** Quetzal Afterlife — The Digital Resurrection Engine  
**Fecha:** 2026-10-30  
**Estado:** ACTIVO — Implementación en rama feat/kiro-dbf-archaeology

---

## Contexto

Con los motores CSV y DBF operativos, el siguiente paso es demostrar un ciclo completo de
**arqueología digital verificable**: importar evidencia, identificar operaciones de inventario,
reconstruir el estado probable del inventario, y distinguir explícitamente qué es recuperado,
qué es inferido y qué es desconocido.

Este módulo opera sobre los datos ya parseados (`CsvResult` o `DbfResult`) — no reimplementa
la lectura de archivos.

---

## Requisitos funcionales

### RF-INV-01 — Detección de operaciones de inventario

- **RF-INV-01.1** El sistema DEBE inspeccionar los nombres de campos de un resultado CSV o DBF
  e intentar identificar automáticamente campos de cantidad (qty, cantidad, stock, units, piezas,
  existencias) y campos de identificador (id, codigo, sku, clave, referencia) mediante coincidencia
  de nombres insensible a mayúsculas/minúsculas y acentos.
- **RF-INV-01.2** La detección automática DEBE devolver los campos identificados con nivel de
  confianza: `alto` (nombre exacto en lista), `medio` (coincidencia parcial), `bajo` (inferencia
  por posición o tipo).
- **RF-INV-01.3** Si no se detecta ningún campo de cantidad, el resultado DEBE indicar
  `operacionDetectada: false` sin lanzar error.

### RF-INV-02 — Reconstrucción del estado de inventario

- **RF-INV-02.1** Cuando se detecten campos de id y cantidad, el sistema DEBE calcular el
  inventario por ítem: `{ id, cantidad, fuente: 'recuperado' }`.
- **RF-INV-02.2** Los ítems con cantidades no numéricas o vacías DEBEN marcarse como
  `fuente: 'desconocido'` en lugar de lanzar un error.
- **RF-INV-02.3** Los registros borrados (DBF) incluidos en el análisis DEBEN marcarse
  `fuente: 'recuperado_borrado'` para distinguirlos de los activos.
- **RF-INV-02.4** El resultado DEBE incluir: suma total de unidades de registros activos,
  suma de registros borrados (separada), recuento de ítems con cantidad desconocida.

### RF-INV-03 — Invariantes y trazabilidad

- **RF-INV-03.1** Ningún valor calculado puede exceder la suma directa de los valores de
  fuente; no se imputan ni extrapolan valores.
- **RF-INV-03.2** Cada ítem del resultado DEBE incluir el número de fila/registro de origen.
- **RF-INV-03.3** El módulo DEBE ser una función pura: misma entrada → mismo resultado.
- **RF-INV-03.4** Ningún resultado se presenta como "verificado" a menos que exista una
  referencia independiente que lo confirme (fuera del alcance de esta fase).

### RF-INV-04 — Integración en la UI (sección Laboratorio)

- **RF-INV-04.1** La sección "Laboratorio" DEBE mostrar el resultado de reconstrucción
  cuando hay evidencia cargada en "Nueva recuperación".
- **RF-INV-04.2** La UI DEBE distinguir visualmente los ítems activos, borrados y desconocidos.
- **RF-INV-04.3** Los totales DEBEN mostrarse con etiqueta explícita de confianza:
  "Total recuperado (activos)" / "Total recuperado (borrados)" / "Desconocidos".
- **RF-INV-04.4** Si no se pudo detectar ningún campo de inventario, la UI DEBE mostrar
  un mensaje explicativo con los nombres de campos disponibles.

---

## Criterios de aceptación

| ID | Criterio | Verificable por |
|---|---|---|
| CA-INV-01 | CSV con columnas `id,nombre,cantidad` detecta cantidad=alto | Prueba unitaria |
| CA-INV-02 | DBF con campo STOCK detecta cantidad=alto | Prueba unitaria |
| CA-INV-03 | Cantidades no numéricas → fuente desconocido, no error | Prueba unitaria |
| CA-INV-04 | Registros borrados DBF → fuente recuperado_borrado | Prueba unitaria |
| CA-INV-05 | Totales correctos, sin imputación | Prueba unitaria |
| CA-INV-06 | Sin campos de cantidad → operacionDetectada: false | Prueba unitaria |
| CA-INV-07 | UI muestra reconstrucción en sección Laboratorio | Inspección visual |
| CA-INV-08 | 49 pruebas anteriores siguen en PASS | CI |

---

## Fuera de alcance (esta fase)

- Persistencia de proyectos.
- Verificación contra fuente independiente.
- Exportación del resultado.
- Detección de operaciones complejas (movimientos, ajustes, diferencias).
