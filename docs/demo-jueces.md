# Demostración reproducible — Kiroween 2026

Todos los datos de esta demostración son **sintéticos**. No representan ningún sistema ni empresa real,
y la interfaz los marca con la etiqueta **SINTÉTICO**.

## Preparación

```bash
npm ci
npm run build
npx next start -p 4173
```

Abrir http://localhost:4173. Para regenerar los fixtures: `node scripts/make-fixtures.mjs`.

## Ruta A — un clic (≈1 min)

1. Pulsar **▶ DEMO** (arriba a la derecha). Se abre el Laboratorio con el banner SINTÉTICO.
2. Laboratorio: ver los campos detectados con su confianza, los totales (activos / borrados / desconocidos)
   y la columna **Fila** y **Fuente** (trazabilidad por registro).
3. **Verificación**: coincidencia, discrepancias y registros presentes solo en una fuente.
4. **Exportar CSV / JSON**: cada fila conserva archivo de origen, fila, clasificación y marca sintética.
5. **Archivo → Guardar proyecto**, recargar la página, **Reabrir**, y por último **Eliminar**.

## Ruta B — archivos reales de `fixtures/`

| Paso | Acción | Resultado esperado |
|---|---|---|
| 1 | Nueva recuperación → `demo-sintetico-inventario.dbf` | 6 registros leídos, 1 borrado; operación de inventario detectada |
| 2 | Laboratorio | Activos 27, borrados 8, 1 desconocido (`N/A`); aviso «Estimación, no hecho confirmado» sobre `DESCRIP` (confianza media) |
| 3 | Nueva recuperación → `demo-sintetico-principal.csv`; Verificación → `demo-sintetico-referencia.csv` | 66.67 % de coincidencia, 1 discrepancia (A-2: 5 vs 6), 1 solo en fuente (A-4), 1 solo en referencia (A-9) |

## Qué se afirma y qué no

- «recuperado» / «recuperado_borrado»: el valor está en el archivo, en la fila indicada.
- La asignación de campos (id, cantidad, nombre) es **heurística**; si la confianza no es alta se avisa.
- Solo se llama «verificado» a lo que coincide con una referencia independiente cargada por el usuario.
- Nada se imputa ni se extrapola. Todo ocurre en el navegador; no se envía nada a ningún servidor.

## Limitación conocida

El lector DBF se probó con archivos construidos por las pruebas automatizadas y por `scripts/make-fixtures.mjs`.
No se dispuso de ningún archivo `.dbf` real de un sistema heredado; no se afirma compatibilidad con ellos.
