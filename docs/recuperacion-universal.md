# Recuperación digital universal — auditoría, arquitectura y roadmap

> Principio rector: **no se declara recuperable información inexistente, sobrescrita o no verificada.** La plataforma no promete recuperación universal ni éxito garantizado.

## 1. Auditoría de los motores existentes (antes de esta fase)
| Motor | Qué hacía realmente |
|---|---|
| Ingestion + Discovery (`lib/ingest.ts`, `discovery.ts`) | Firma de DBF/CSV/SQLite/ejecutables, SHA-256, copia de trabajo, límites. **Nada de PDF/imágenes/Office.** |
| DBF/CSV tolerante (`dbf-scan.ts`, `csv-scan.ts`) | Registros íntegros/recuperados/perdidos con rangos irrecuperables. Validado con **fixtures sintéticos**, sin DBF real. |
| SQLite | Solo diagnóstico de cabecera. |
| Schema/Reconstruction/Studio/Vault | Inferencia relacional, modelo multitabla, CRUD sobre copia, expediente con hash. Solo datos tabulares. |
| Holograma 3D | Visualización; **no** es recuperación. |

Conclusión: la plataforma recuperaba **bases de datos tabulares**. Documentos, fotos, audio/video, programas e imágenes de disco no existían.

## 2. Matriz de capacidades
Es un dato (`lib/capabilities.ts`) mostrado en la sección **File Recovery → Matriz de capacidades**; las pruebas verifican que cada entrada implementada apunte a código y pruebas reales (`lib/capabilities.test.ts`).

| Área | Implementado y probado | Parcial | No implementado |
|---|---|---|---|
| Fotografías | PNG | JPEG (estructura, sin píxeles) · GIF/TIFF/BMP/WebP (solo firma) | RAW de cámara |
| Documentos | TXT | PDF · ZIP/DOCX/XLSX · OLE2 (solo firma) | RTF, ODT/PPTX en profundidad, DOC/XLS heredados |
| Audio y video | — | Identificación por firma | Análisis estructural y extracción |
| Bases de datos | DBF/CSV (sintético) | SQLite (cabecera) | Access, Paradox, dumps, etc. |
| Programas | — | Identificación y rechazo (nunca se ejecutan) | Software Archaeology (solo diseño) |
| Imágenes de disco | — | Carving por firmas de archivos contiguos | FAT/NTFS/ext, archivos eliminados por metadatos, fragmentos |
| Reconstrucción de aplicaciones | Desde datos tabulares (Studio) | — | Desde recursos/comportamiento de binarios |

## 3. Arquitectura modular
```
                          ┌────────────── Orquestador (lib/filerec/index.ts) ──────────────┐
 bytes (copia, solo lectura) → Adaptador de identificación (firmas) → Analizador del formato → Informe
                                         │                                  │                  │
                                  identify.ts                  png/jpeg/pdf/zip/text      SHA-256, hallazgos,
                                                                                         rangos dañados + sectores,
                          Procesadores: carve.ts (carving) · reparación verificada · exportación segura (ZIP)
```
- **Adaptador** (`identify`): decide el formato por contenido y marca lo peligroso. Añadir un formato = añadir una firma.
- **Analizador** (`Analyzer`): `analyze(bytes, {deadline, limits}) → AnalysisResult` (integridad, hallazgos, rangos dañados, elementos recuperados con `verified` + `basis`, reparación opcional, limitaciones). Se registra en `ANALYZERS`.
- **Procesadores**: transformaciones reutilizables (carving, `inflate` con salida parcial, constructor de ZIP seguro).
- **Motor**: orquesta y calcula SHA-256; nunca lanza ante una entrada malformada.
- **Contrato de honestidad**: un elemento solo es `verified: true` si una comprobación objetiva lo respalda (CRC-32, Adler-32, estructura re-analizada). Lo demás se informa como no verificado.

### Seguridad y límites (configurables en `DEFAULT_LIMITS`)
8 MiB por archivo · 1000 entradas · 16 MiB por flujo · 64 MiB totales · relación 200:1 · 8 s por archivo. Nombres normalizados contra *zip-slip*. Nada se ejecuta; las imágenes de disco se leen en memoria sin escribir.

## 4. Primer entregable funcional (implementado)
Identificación por firmas · diagnóstico de integridad · extracción verificable · registro de daños con rangos de bytes y sectores de 512 B · SHA-256 de archivo, elementos y reparaciones · exportación segura (informe JSON, ZIP con lo verificado) · carving de solo lectura · fixtures sintéticos · pruebas con archivos reales no sensibles (PNG del proyecto y JPEG de Windows) · fuzz determinista de truncamientos/corrupciones.

## 5. Roadmap realista (esfuerzo = estimación gruesa de ingeniería, no compromiso)
| Fase | Alcance | Dependencias | Riesgo | Esfuerzo |
|---|---|---|---|---|
| 1 ✔ | Núcleo + PNG/JPEG/PDF/ZIP-OOXML/TXT + carving contiguo | ninguna | medio | hecho |
| 2 | Decodificador JPEG (Huffman/IDCT) para verificar píxeles; GIF/BMP/WebP | solo código | medio | 2–3 sem |
| 3 | PDF: ObjStm/xref comprimida, texto con CMap; DOCX/XLSX más completos; OLE2 (CFB) | PDF/Office reales de prueba | alto | 4–6 sem |
| 4 | Contenedores audio/video: RIFF (WAV/AVI), ISO-BMFF (MP4), Matroska; detección de truncamiento y extracción de metadatos | muestras reales | medio | 3–4 sem |
| 5 | SQLite completo (B-tree, páginas libres, WAL) | muestras reales | alto | 4–6 sem |
| 6 | Sistemas de archivos de solo lectura: FAT/exFAT, luego NTFS/ext4 (MFT/inodos, archivos eliminados) con lectura por bloques de imágenes grandes | imágenes reales, cadena de custodia | alto | 8–12 sem |
| 7 | Software Archaeology (ver `software-archaeology.md`) | binarios reales y modelo de amenazas | alto | 8+ sem |
| 8 | Reconstrucción de aplicaciones desde recursos y comportamiento demostrable | fases 6–7 | muy alto | investigación |

Reglas para cada fase: pruebas unitarias + fuzz, archivos reales no sensibles cuando existan, límites de recursos, documentación de limitaciones y actualización de la matriz.

## 6. Limitaciones y riesgos que persisten
- La mayoría de los formatos de la matriz **no** están implementados; no hay PDF, DOCX, XLSX, ZIP ni DBF reales con los que validar (solo sintéticos).
- Un hallazgo por firma puede ser un falso positivo; por eso carving ≠ recuperación.
- Los archivos fragmentados o sobrescritos no se pueden recuperar con este motor.
- Imágenes forenses reales exigen bloqueo de escritura físico y cadena de custodia fuera del alcance del navegador.
