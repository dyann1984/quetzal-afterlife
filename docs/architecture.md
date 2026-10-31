# Arquitectura y alcance MVP

## Fase 1
Next.js/React y TypeScript sirven una interfaz de navegación; Papa Parse analiza CSV como datos en el navegador. No hay API de carga, base de datos, IA ni persistencia. Los archivos nunca se ejecutan. El límite de tamaño se comprueba antes de leerlos y el analizador valida UTF-8 estricto, extensión, estructura, encabezados y límites. Esto no identifica de manera infalible el tipo real de archivo.

## Modelo previsto (no implementado)
Proyecto → evidencias (origen, hash, formato, fecha) → observaciones recuperadas → hipótesis (regla, incertidumbre, evidencia) → verificaciones (casos, resultados, versión) → artefactos preservados. Cada afirmación debe indicar recuperado, inferido, verificado o desconocido y sus referencias. Los proyectos y datos no existen aún como entidades persistidas.

## Amenazas y límites
Archivos maliciosos: no ejecutar, limitar bytes/filas, validar estructura y codificación; para formatos futuros usar aislamiento y límites de recursos. CSV puede contener fórmulas: tratar celdas como texto y neutralizar fórmulas en cualquier exportación futura. Datos sensibles: no registrar contenido ni subirlo; definir autenticación, cifrado y retención antes de almacenamiento compartido. IA futura: clave solo en servidor, entradas minimizadas, resultados no confiables y evidencia explícita. El navegador del usuario sigue siendo responsable de su entorno.

## Criterios de aceptación de fase 1
- Cinco secciones navegables y diseño adaptable.
- CSV válido produce encabezados y filas reales; errores claros para entradas inválidas y límites.
- No se afirma soporte DBF, persistencia, IA o verificación funcional.
- Lint, tipos, pruebas y build registrados con resultados reales.
- .kiro versionable; Kiro no se atribuye trabajo no realizado.

## Siguientes fases
Fixture ficticio y referencia independiente; importación DBF segura; proyectos persistidos; motor de hipótesis con incertidumbre; operaciones de inventario y verificaciones independientes; exportación segura y despliegue.
