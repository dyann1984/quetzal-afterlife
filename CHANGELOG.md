# Cambios

## 2026-11-01 — feat/kiroween-resurrection (hecho con Claude)

### Corregido
- File Recovery perdía todos los resultados al cambiar de sección: el estado ahora vive en un almacén externo.
- El Dashboard no mostraba datos reales y tenía un rótulo obsoleto («FASE 03»); ahora muestra estadísticas del historial o un estado vacío explicativo.
- 404 de `favicon.ico` en cada carga.

### Añadido
- Protocolo de resurrección en seis etapas ligado al motor, con validación por re-análisis completo.
- Analizadores con reparación verificable: JSON, XML, CSV irregular y SQLite 3 (lectura directa del formato).
- Texto: offset exacto de bytes UTF-8 inválidos y reversión de mojibake con ida y vuelta.
- Veredictos honestos y recuperabilidad derivada de rangos medidos.
- Comparador antes/después, mapa de bytes a escala y explicación de Quetzalito basada en el informe.
- Historial local (solo metadatos) y estadísticas reales en el Dashboard.
- Fixtures dañados nuevos, incluida una base SQLite real; pruebas de fuzz y E2E en navegador.
- Documentación: auditoría, protocolo, material para Kiroween.

### Sin cambios
Holograma, Motor 2.0 tabular, i18n/temas y Quetzalito local se conservan; solo se ampliaron.
