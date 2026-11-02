# QUETZAL AFTERLIFE
### The Digital Resurrection Engine

Plataforma de recuperación digital que se ejecuta íntegramente en el navegador: importa evidencia CSV o DBF, reconstruye inventarios con trazabilidad por registro, los contrasta contra una referencia independiente, exporta los resultados (CSV/JSON) y guarda proyectos localmente.

## Funciones

- **Nueva recuperación:** importación de CSV (máx. 2 MB) y DBF (máx. 4 MB), ambos con 10 000 registros como límite.
- **Laboratorio:** reconstrucción de inventario. Cada dato indica fila de origen y clasificación (`recuperado`, `recuperado_borrado`, `desconocido`); la detección de campos es heurística y se avisa cuando no es de confianza alta.
- **Verificación:** contraste contra una segunda fuente (coincidencias, discrepancias, ausentes).
- **Archivo:** guardar, reabrir y eliminar proyectos en el almacenamiento local del navegador.
- **Demo:** botón **▶ DEMO** con datos sintéticos claramente marcados. Guía en [docs/demo-jueces.md](docs/demo-jueces.md).

## Ejecutar

Requiere Node.js 22.12 o superior de la serie 22, o las series 24 y 26+.

```sh
npm ci
npm run dev      # http://localhost:3000
```

Comprobaciones: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Privacidad

Los archivos se procesan en el navegador y no se envían a ningún servidor. Los proyectos guardados viven en `localStorage` de ese navegador y se pierden si se borra. No cargar datos sensibles en equipos compartidos. No requiere variables de entorno.

## Limitaciones

El lector DBF se ha probado con archivos sintéticos; no hay verificación con archivos reales de sistemas heredados.

Ver [arquitectura](docs/architecture.md), [decisiones](docs/decisions.md), [registro de pruebas](docs/test-log.md) y [plan Kiro](.kiro/README.md). Logo suministrado por el usuario; la licencia MIT se aplica al código, no implica cesión de derechos sobre la marca o imagen.
