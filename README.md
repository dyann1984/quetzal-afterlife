# QUETZAL AFTERLIFE
### The Digital Resurrection Engine

Fase 1 de una plataforma de recuperación digital. La importación CSV funciona localmente en el navegador; no persiste datos ni ejecuta archivos. El resto de módulos son alcance futuro, no funciones terminadas.

## Ejecutar

Requiere Node.js 22.12 o superior de la serie 22, o las series 24 y 26+.

```sh
npm ci
npm run dev
```

Abrir http://localhost:3000. Comprobaciones: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CSV: UTF-8, máximo 2 MB y 10 000 filas, encabezados únicos y filas rectangulares. La vista previa muestra hasta 10 filas. Los datos permanecen en memoria de la página y se pierden al recargar. No cargar datos sensibles en equipos compartidos.

Ver [arquitectura](docs/architecture.md), [decisiones](docs/decisions.md), [registro de pruebas](docs/test-log.md) y [plan Kiro](.kiro/README.md). Logo suministrado por el usuario; la licencia MIT se aplica al código, no implica cesión de derechos sobre la marca o imagen. No hay proveedor IA ni almacenamiento en esta fase.

