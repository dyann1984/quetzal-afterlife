# Arquitectura y alcance

## Fase 1 (commit 35a708a — base)
Next.js/React y TypeScript sirven una interfaz de navegación; Papa Parse analiza CSV como datos en el navegador. No hay API de carga, base de datos, IA ni persistencia. Los archivos nunca se ejecutan. El límite de tamaño se comprueba antes de leerlos y el analizador valida UTF-8 estricto, extensión, estructura, encabezados y límites. Esto no identifica de manera infalible el tipo real de archivo.

## Fase 2A (rama feat/kiro-dbf-archaeology)
Se añade el motor de arqueología DBF en `lib/dbf.ts`. La lógica de parseo es un módulo puro sin I/O de red ni acceso al DOM. La UI en `app/page.tsx` ahora acepta `.dbf` además de `.csv` y muestra metadatos, estructura de campos, registros (con estado activo/borrado/corrupto) y advertencias.

### Componentes nuevos
- `lib/dbf.ts` — parser puro: validaciones, encabezado, descriptores de campo, registros, codificación.
- `lib/dbf.test.ts` — 42 pruebas unitarias con fixtures construidos por código.
- Estilos DBF añadidos a `app/globals.css` (sin modificar reglas existentes).

### Límites de Fase 2A
- Tamaño máximo: 4 MB por archivo.
- Registros máximos: 10 000 (activos + borrados).
- Archivos de memo (`.fpt`, `.dbt`) no se leen; las referencias de campo tipo M se devuelven como `[memo:N]`.
- Compatibilidad demostrada: dBASE III y IV. Otros dialectos aceptados por byte de versión pero sin verificación de fixtures reales.
- Codificaciones DOS (cp437, cp850, cp852): decodificador manual por tabla (Node.js v22 no las soporta via TextDecoder).

## Modelo de datos previsto (no implementado)
Proyecto → evidencias (origen, hash, formato, fecha) → observaciones recuperadas → hipótesis (regla, incertidumbre, evidencia) → verificaciones (casos, resultados, versión) → artefactos preservados. Cada afirmación debe indicar recuperado, inferido, verificado o desconocido y sus referencias. Los proyectos y datos no existen aún como entidades persistidas.

## Amenazas y límites
Archivos maliciosos: no ejecutar, limitar bytes/filas, validar estructura y codificación; para formatos futuros usar aislamiento y límites de recursos. CSV puede contener fórmulas: tratar celdas como texto y neutralizar fórmulas en cualquier exportación futura. DBF: lista blanca de bytes de versión, protección contra encabezados falsificados, nombres de campo saneados. Datos sensibles: no registrar contenido ni subirlo; definir autenticación, cifrado y retención antes de almacenamiento compartido. IA futura: clave solo en servidor, entradas minimizadas, resultados no confiables y evidencia explícita. El navegador del usuario sigue siendo responsable de su entorno.

## Criterios de aceptación de Fase 2A
- 49 pruebas (7 CSV + 42 DBF) en PASS verificado con `vitest run`.
- TypeScript: 0 errores (`tsc --noEmit`).
- ESLint: 0 errores (solo advertencias `<img>` pre-existentes de Fase 1).
- `next build` completa sin errores.
- La UI muestra metadatos DBF, campos, registros activos y borrados.

## Siguientes fases
Fixture real de DBF para validación de dialecto FoxPro/VFP; soporte de archivos de memo; proyectos persistidos; motor de hipótesis con incertidumbre; operaciones de inventario y verificaciones independientes; exportación segura y despliegue.


---

## Competition Winner Edition — file-recovery architecture (English summary)

```
bytes (memory, read-only)
  └─ identify()                lib/filerec/identify.ts   signature → format; structure fallback for altered signatures
       └─ analyzer[format]     png · jpeg · pdf · zip · text · gif · bmp · wav        (lib/filerec/*.ts)
            └─ AnalysisResult  integrity, findings, damaged ranges (+512 B sectors), items (verified flag), repaired file
                 └─ analyzeFile() adds SHA-256 of input, items and repair; guards: size limit, deadline, dangerous types skipped
Lab:   lib/filerec/lab.ts   deterministic ORIGINAL + DAMAGED generators → runLab() → checks compared with the original
UI:    app/resurrection-lab.tsx (cards, progress, before/after, downloads), app/guided-demo.tsx (8 steps, real engine)
Explain: lib/filerec/explain.ts — deterministic rules over the report (not AI)
i18n:  lib/i18n (ES/EN); every engine message has an English pair, enforced by lib/i18n/i18n.test.ts
```

Design rules: (1) *verified* only with an objective check; (2) repairs never alter data bytes whose checksum already verifies; (3) unverifiable bytes are exported separately and labelled; (4) all work is in-browser and in-memory, with limits (8 MiB/file, 200:1 decompression ratio, 8 s deadline); (5) executables are identified, never run.

Media analyzers (`lib/filerec/media.ts`) verify container structure only. GIF keeps complete frames and re-adds the trailer; BMP compares declared vs. present rows and zero-fills missing ones (flagged); WAV trims to whole samples and fixes RIFF/data sizes. None decodes pixels or audio.