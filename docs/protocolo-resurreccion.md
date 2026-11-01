# Protocolo de resurrección — arquitectura

```
 archivo (copia en memoria, solo lectura)
   │
   ▼
 runResurrection()  lib/filerec/protocol.ts ── onStage(run) ──► session.ts (useSyncExternalStore) ──► UI
   │  01 identify()                 lib/filerec/identify.ts   firma binaria + subtipo de texto
   │  02 analyzeFile()              lib/filerec/index.ts      ANALYZERS[formato].analyze()
   │  03 report.repaired | items    (lo produce el analizador)
   │  04 artefacto                  reparado | exportRecovered() → ZIP con lo verificado
   │  05 analyzeFile(artefacto)     re-análisis completo e independiente del diagnóstico
   │  06 outcome + estimateRecoverability()
   ▼
 ResurrectionRun  ─► historial (solo metadatos, localStorage)  ─► Dashboard
                  ─► explainRun()   lib/quetzalito/explain.ts  ─► Quetzalito
```

## Analizadores nuevos

| Módulo | Técnica | Verificador de la reparación |
|---|---|---|
| `json.ts` | escáner con pila y «punto de corte seguro» tras cada valor completo | `JSON.parse` (independiente del escáner) |
| `xml.ts` | tokenizador de buena formación; sin DTD externas | re-escaneo + `DOMParser` en el navegador |
| `csvfile.ts` | RFC 4180, delimitador por consistencia | relectura: todas las filas con el ancho del encabezado |
| `sqlite.ts` | formato de archivo SQLite: B-tree, varints, tipos seriales, páginas de desbordamiento | cabecera de registro = longitud del payload |
| `text.ts` + `textutil.ts` | validador UTF-8 RFC 3629 con offsets | ida y vuelta exacta por línea (mojibake) |

## Veredictos

| Veredicto | Condición |
|---|---|
| Íntegro | el diagnóstico no encuentra daños |
| Reparado y validado | la reparación pasa su comprobación y el re-análisis da «íntegro», y no hubo rangos de bytes perdidos |
| Recuperación parcial verificada | se valida lo conservado, pero hubo bytes descartados; o paquete con elementos verificados |
| Reparación propuesta sin verificar | hay un resultado, pero no supera su comprobación (p. ej. codificación estimada) |
| Diagnóstico sin reparación posible | no hay estrategia verificable |
| Irrecuperable | no queda estructura que conservar |

La **recuperabilidad** sale de dos medidas: el porcentaje de bytes fuera de los rangos dañados (unidos) y cuántos elementos extraídos superan una comprobación objetiva.

## Límites conocidos

- El análisis corre en el hilo principal; no hay Web Worker todavía (los límites de tamaño y profundidad acotan el coste).
- SQLite: sin índices, páginas libres ni WAL; no genera un `.sqlite` reparado.
- JSON/XML: lo posterior a un error de sintaxis no se reconstruye.
- Ningún analizador reconstruye contenido perdido; tampoco la IA.
