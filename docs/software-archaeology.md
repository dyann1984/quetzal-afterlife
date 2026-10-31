# Software Archaeology — diseño (segunda etapa)

**Estado: SOLO DISEÑO. No existe código de análisis de programas.** La matriz de capacidades lo marca como «no implementado».

## Qué es y qué NO es
- Es un conjunto de análisis **estáticos y de solo lectura** sobre binarios heredados para producir *hipótesis* sobre qué hacía un programa, cada una con la evidencia concreta que la sustenta.
- **NO afirma** recuperar el código fuente original, ni su lógica de negocio completa, ni que el programa se comportaba de una forma que no se haya observado en la evidencia. Un desensamblado o un pseudocódigo no es el código fuente.
- **NO ejecuta** el programa en ningún caso. Hoy los ejecutables solo se identifican por firma y se rechazan (`ejecutable_no_ejecutado`).

## Principios de seguridad (innegociables)
1. Procesar sobre una **copia en memoria**; el original nunca se modifica ni se carga como código.
2. Cero ejecución: sin `eval`, sin `WebAssembly.instantiate` de contenido importado, sin emulación en la primera versión.
3. Límites de tamaño, memoria y tiempo, igual que el módulo de archivos; un binario que los exceda se rechaza con motivo.
4. Todo texto extraído (cadenas, nombres de importaciones) se trata como dato no confiable y se escapa al mostrarse o exportarse.
5. Un posible emulador o sandbox dinámico queda **fuera de alcance** hasta tener un modelo de amenazas aprobado.

## Arquitectura propuesta (capas)
```
Ingesta (firmas, SHA-256)  →  Parser de contenedor (solo lectura)  →  Extractores  →  Hipótesis con evidencia  →  Expediente
```
| Capa | Contenido | Primera versión |
|---|---|---|
| Parser de contenedor | PE/COFF (MZ), ELF, Mach-O: cabeceras, secciones, tabla de importaciones/exportaciones, recursos | PE y ELF |
| Extractores | cadenas ASCII/UTF-16 con desplazamiento, entropía por sección (empaquetado/cifrado), tablas de recursos (iconos, diálogos, versiones, manifiestos), metadatos de compilación | cadenas, entropía, importaciones, recursos |
| Hipótesis | «usa funciones de acceso a bases de datos X», «muestra diálogos con estos textos», «lee/escribe archivos con estas extensiones» | reglas explícitas, no IA |
| Salida | informe con cada hipótesis → evidencia (offset, sección, cadena) → confianza → estado `inferido` | JSON y texto |

Las **reconstrucciones funcionales** que se propondrán son de tres tipos y siempre etiquetadas:
- *Observadas*: recursos y datos presentes en el archivo (menús, textos, iconos, esquemas incrustados). Hechos.
- *Inferidas*: comportamiento sugerido por importaciones/cadenas. Hipótesis con evidencia.
- *Propuestas*: esquema de datos o interfaz que un reemplazo moderno podría ofrecer. Sugerencias, no recuperación.

## Dependencias y decisiones pendientes
- Parsers PE/ELF propios (los formatos están documentados; unas cientos de líneas por contenedor) frente a una biblioteca: **decisión pendiente**, con revisión de licencia y de superficie de ataque.
- Desensamblado: fuera de la primera versión; si se incorpora, debe ser una biblioteca auditada y sin ejecución.
- Muestras: se necesitan binarios heredados **reales, legítimos y no maliciosos**; hoy no hay ninguno en el equipo, así que no se afirma nada sobre binarios reales.

## Roadmap de la etapa
1. Parser PE (cabeceras, secciones, importaciones) + pruebas con binarios sintéticos construidos por código.
2. Cadenas y entropía + detección de empaquetado.
3. Recursos Windows (versión, manifiesto, diálogos, iconos).
4. ELF y Mach-O.
5. Motor de hipótesis con evidencia y expediente en la Evidence Vault.
6. (Sujeto a aprobación y modelo de amenazas) análisis dinámico aislado.

## Criterios de aceptación
- Ninguna hipótesis sin una evidencia localizable.
- Ninguna ejecución del binario, verificada por pruebas (el analizador solo recibe `Uint8Array`).
- El informe no contiene la frase «código fuente recuperado»; las pruebas lo verifican.
