# Idiomas (ES/EN) y temas (Claro/Oscuro/Sistema)

## Idioma
- Español es el idioma base y **la clave**: en el código se escribe `tr('Texto en español')`. El diccionario inglés vive en `lib/i18n/en.ts`.
- Funciones (`lib/i18n/index.ts`): `tr`/`t` (texto), `tf` (plantillas con `{0}`), `nf` (números según el idioma), `tm` (mensajes generados por los motores).
- Los **motores no se modificaron**. Sus mensajes (en español) se traducen al mostrarlos, con `tm`, mediante pares exactos y patrones en `lib/i18n/msgs.ts` y `lib/i18n/msgs-filerec.ts`. Lo capturado (nombres, cifras, hashes) se conserva tal cual.
- Se mantienen intactos: datos originales recuperados, hashes, nombres de archivo e identificadores internos.
- Cobertura: `lib/i18n/i18n.test.ts` ejecuta el escenario sintético, los fixtures y la matriz de capacidades y falla si queda un mensaje de motor sin traducir.
- **Cómo añadir una traducción**: agregar el par en `en.ts` (texto de interfaz) o en `msgs*.ts` (mensaje de motor), y ejecutar `npm test`. `tools/i18n/dups.mjs` detecta claves duplicadas.

## Tema
- Preferencia: Sistema (por defecto), Claro u Oscuro. Se guarda en `localStorage` (`quetzal:ui:v1`, junto con el idioma).
- Un script en `<head>` (`BOOT_SCRIPT`) fija `html[lang]`, `data-theme` y `data-theme-pref` antes del primer pintado, para evitar el parpadeo.
- Los colores `#rrggbb` de la hoja de estilos y de los componentes son variables `--c-xxxxxx`; la paleta clara está en `:root[data-theme=light]` (derivada con `tools/i18n/themeify.mjs`).
- **El holograma y la experiencia 3D mantienen un escenario oscuro también en modo claro** (`.hero-holo`, `.exp-overlay` redefinen las variables oscuras).
- Quetzalito toma idioma y tema del almacén global; sus botones y los de la cabecera controlan lo mismo.

## Limitaciones conocidas
- Los **archivos exportados** (CSV, JSON, MD, HTML del dossier, prototipo del Studio, informe del Vault) los generan los motores sin modificar y quedan en español.
- El primer pintado del HTML del servidor es es/sistema; el script de arranque ajusta tema e idioma del documento antes de pintar, y la interfaz se re-renderiza al hidratar.
- Los mensajes antiguos del chat de Quetzalito se ocultan (no se retraducen) al cambiar de idioma.
- Quedan en español los datos de demostración (nombres de tablas, etiquetas «(sintético)», texto de los fixtures).
