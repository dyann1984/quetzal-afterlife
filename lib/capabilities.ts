/**
 * lib/capabilities.ts — Matriz de capacidades de QUETZAL AFTERLIFE
 *
 * Es DATO verificable: las pruebas comprueban que cada capacidad declarada como implementada o parcial
 * apunta a un módulo y a un archivo de pruebas que existen, y que ninguna entrada "implementada" omite sus límites.
 * Estados:
 *   implementado-probado — hay código y pruebas automatizadas que lo demuestran (con los límites indicados)
 *   parcial              — funciona para un subconjunto o solo identifica/diagnostica
 *   no-implementado      — no existe; se lista para el roadmap
 */
export type Estado = 'implementado-probado' | 'parcial' | 'no-implementado';
export type Area = 'documentos' | 'fotografias' | 'audio-video' | 'bases-de-datos' | 'programas' | 'imagenes-de-disco' | 'reconstruccion-de-aplicaciones';

export interface Capacidad {
  id: string;
  area: Area;
  formato: string;
  estado: Estado;
  /** Qué hace realmente hoy. */
  soporta: string;
  limitaciones: string;
  riesgos: string;
  dependencias: string;
  /** Módulo que lo implementa (relativo a la raíz del repositorio); null si no existe. */
  modulo: string | null;
  /** Archivo de pruebas que lo respalda; null si no existe. */
  pruebas: string | null;
  /** Archivos reales no sensibles usados en pruebas (si los hay). */
  datosReales: string;
}

const NINGUNA = 'ninguna (solo código propio)';
const RIESGO_PARSER = 'Entradas malformadas u hostiles: mitigado con límites de tamaño/tiempo/salida y pruebas de fuzz determinista.';

export const CAPACIDADES: readonly Capacidad[] = [
  // ── Fotografías ─────────────────────────────────────────────────────────────
  { id: 'png', area: 'fotografias', formato: 'PNG', estado: 'implementado-probado',
    soporta: 'Firma, CRC-32 por chunk, IHDR, decodificación de filas del flujo IDAT, tEXt, reparación del archivo con las filas íntegras (re-verificada).',
    limitaciones: 'Sin PNG entrelazado (Adam7) por filas; no renderiza; las filas ausentes no existen y no se reconstruyen; máx. 16384×16384.', riesgos: RIESGO_PARSER,
    dependencias: NINGUNA, modulo: 'lib/filerec/png.ts', pruebas: 'lib/filerec/real-files.test.ts', datosReales: 'public/quetzal-logo.png (1254×1254, real)' },
  { id: 'jpeg', area: 'fotografias', formato: 'JPEG', estado: 'parcial',
    soporta: 'Marcadores, dimensiones, tablas DQT/DHT, datos de escaneo, comentarios; detección de truncamiento; añade EOI.',
    limitaciones: 'No decodifica píxeles: no se puede afirmar cuánta imagen es legible tras un corte; los bytes de escaneo se marcan NO verificados.', riesgos: RIESGO_PARSER,
    dependencias: NINGUNA + '; un decodificador de entropía permitiría verificar píxeles', modulo: 'lib/filerec/jpeg.ts', pruebas: 'lib/filerec/real-files.test.ts', datosReales: 'JPEG real de Windows (omitido si no existe)' },
  { id: 'gif-bmp', area: 'fotografias', formato: 'GIF, BMP', estado: 'parcial',
    soporta: 'GIF: cabecera, bloques, cuadros completos, terminador; reparación conservando cuadros íntegros. BMP: cabeceras, filas presentes vs. esperadas, tamaño declarado; reparación rellenando filas ausentes con ceros (declarado).',
    limitaciones: 'Sin decodificación LZW ni lectura de píxeles; BMP con RLE solo por cabecera; las filas rellenadas no son datos recuperados; probado solo con archivos sintéticos.', riesgos: RIESGO_PARSER,
    dependencias: NINGUNA, modulo: 'lib/filerec/media.ts', pruebas: 'lib/filerec/media.test.ts', datosReales: 'ninguno' },
  { id: 'imagenes-otras', area: 'fotografias', formato: 'TIFF, WebP', estado: 'parcial',
    soporta: 'Identificación por firma binaria y detección de extensión engañosa.', limitaciones: 'No se verifica integridad ni se extrae contenido.', riesgos: 'Un archivo puede declararse "imagen" y no serlo: solo hay firma.',
    dependencias: 'adaptadores por formato (pendientes)', modulo: 'lib/filerec/identify.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno' },
  { id: 'raw-fotografia', area: 'fotografias', formato: 'RAW de cámara (CR2, NEF, DNG…)', estado: 'no-implementado', soporta: 'Nada.', limitaciones: 'Contenedores TIFF propietarios.', riesgos: 'Formatos sin especificación pública completa.', dependencias: 'especificaciones y muestras reales', modulo: null, pruebas: null, datosReales: 'ninguno' },

  // ── Documentos ──────────────────────────────────────────────────────────────
  { id: 'pdf', area: 'documentos', formato: 'PDF', estado: 'parcial',
    soporta: 'Escaneo de objetos, xref/startxref/%%EOF, flujos Flate con Adler-32, texto de operadores Tj/TJ, páginas (heurística), reconstrucción de xref con verificación.',
    limitaciones: 'Sin ObjStm/xref comprimida, cifrado, fuentes ni imágenes; el texto puede no coincidir con lo visual; páginas son estimación; sin PDF real de prueba (solo sintéticos).', riesgos: RIESGO_PARSER + ' Los PDF pueden contener JavaScript: nunca se ejecuta.',
    dependencias: NINGUNA, modulo: 'lib/filerec/pdf.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno disponible' },
  { id: 'zip-ooxml', area: 'documentos', formato: 'ZIP, DOCX, XLSX (PPTX/ODT: solo entradas)', estado: 'parcial',
    soporta: 'Directorio central + respaldo por cabeceras locales, extracción con CRC-32, límites anti-bomba, nombres seguros, texto de DOCX, hojas/textos de XLSX, ZIP reconstruido con lo verificado.',
    limitaciones: 'Sin ZIP64, cifrado ni métodos distintos de almacenado/Deflate; Office puede rechazar un archivo reconstruido; sin DOCX/XLSX reales de prueba.', riesgos: RIESGO_PARSER + ' Zip-slip y bombas: neutralizados.',
    dependencias: NINGUNA, modulo: 'lib/filerec/zip.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno disponible' },
  { id: 'txt', area: 'documentos', formato: 'TXT', estado: 'implementado-probado',
    soporta: 'BOM, UTF-8/UTF-16, secuencias inválidas, caracteres nulos; texto completo.', limitaciones: 'La codificación sin BOM es una estimación.', riesgos: 'Ninguno relevante: nunca se interpreta el contenido.',
    dependencias: NINGUNA, modulo: 'lib/filerec/text.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno' },
  { id: 'ole2', area: 'documentos', formato: 'DOC/XLS/PPT heredados (OLE2)', estado: 'parcial', soporta: 'Identificación por firma.', limitaciones: 'No se leen los flujos CFB ni el contenido.', riesgos: 'Pueden contener macros: nunca se ejecutan.', dependencias: 'lector CFB (pendiente)', modulo: 'lib/filerec/identify.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno' },

  // ── Audio y video ───────────────────────────────────────────────────────────
  { id: 'wav', area: 'audio-video', formato: 'WAV (RIFF/PCM)', estado: 'parcial',
    soporta: 'Chunks fmt y data, duración declarada vs. presente, detección de truncamiento; reparación que recorta a muestras completas y corrige tamaños RIFF/data.',
    limitaciones: 'No decodifica ni reproduce audio; el PCM no tiene suma de comprobación (las muestras no se marcan verificadas); probado solo con archivos sintéticos.', riesgos: RIESGO_PARSER,
    dependencias: NINGUNA, modulo: 'lib/filerec/media.ts', pruebas: 'lib/filerec/media.test.ts', datosReales: 'ninguno' },
  { id: 'audio-video', area: 'audio-video', formato: 'MP3, FLAC, Ogg, MP4/MOV, MKV/WebM, AVI', estado: 'parcial',
    soporta: 'Identificación por firma.', limitaciones: 'No hay análisis estructural (átomos MP4, chunks RIFF, tramas) ni extracción: no se recupera audio ni video.', riesgos: 'Los contenedores pueden estar truncados sin que se detecte.',
    dependencias: 'adaptadores de contenedor (pendientes)', modulo: 'lib/filerec/identify.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno' },

  // ── Bases de datos ──────────────────────────────────────────────────────────
  { id: 'dbf-csv', area: 'bases-de-datos', formato: 'DBF (dBASE/FoxPro) y CSV', estado: 'implementado-probado',
    soporta: 'Lectura tolerante con registros íntegros/recuperados/perdidos, celdas desconocidas, inferencia de esquema y reconstrucción multitabla.',
    limitaciones: 'DBF sin memo/CDX; validado con fixtures sintéticos, sin DBF real de sistema heredado.', riesgos: RIESGO_PARSER,
    dependencias: NINGUNA, modulo: 'lib/dbf-scan.ts', pruebas: 'lib/engine.test.ts', datosReales: 'ninguno' },
  { id: 'sqlite', area: 'bases-de-datos', formato: 'SQLite 3', estado: 'parcial', soporta: 'Diagnóstico de cabecera (tamaño de página, páginas declaradas, truncamiento).', limitaciones: 'No lee tablas ni páginas B-tree.', riesgos: 'Una base puede parecer sana por cabecera y estar dañada por dentro.', dependencias: 'lector B-tree (pendiente)', modulo: 'lib/discovery.ts', pruebas: 'lib/engine.test.ts', datosReales: 'ninguno' },
  { id: 'otras-bd', area: 'bases-de-datos', formato: 'Access, MySQL/PostgreSQL dumps, Paradox, BTrieve…', estado: 'no-implementado', soporta: 'Nada.', limitaciones: 'Formatos sin adaptador.', riesgos: 'Requieren especificaciones y muestras reales.', dependencias: 'muestras reales y especificaciones', modulo: null, pruebas: null, datosReales: 'ninguno' },

  // ── Programas ───────────────────────────────────────────────────────────────
  { id: 'ejecutables-identificacion', area: 'programas', formato: 'PE/MZ, ELF, Mach-O, scripts', estado: 'parcial',
    soporta: 'Identificación por firma y marcado como peligroso: se rechazan y NUNCA se ejecutan ni se cargan.', limitaciones: 'Sin análisis estático (cabeceras, imports, recursos, cadenas).', riesgos: 'El riesgo es ejecutar: el diseño lo prohíbe.',
    dependencias: 'analizadores PE/ELF/Mach-O de solo lectura (Software Archaeology, pendiente)', modulo: 'lib/filerec/identify.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno' },
  { id: 'software-archaeology', area: 'programas', formato: 'Análisis de programas heredados', estado: 'no-implementado', soporta: 'Solo diseño (docs/software-archaeology.md).', limitaciones: 'No existe código de análisis; no se afirma recuperar código fuente.', riesgos: 'Malware: análisis estático sin ejecución como única vía.', dependencias: 'parsers PE/ELF, desensamblador (decisión pendiente)', modulo: null, pruebas: null, datosReales: 'ninguno' },

  // ── Imágenes de disco ───────────────────────────────────────────────────────
  { id: 'carving', area: 'imagenes-de-disco', formato: 'Carving por firmas (PNG, JPEG, PDF, ZIP/Office) en imagen en bruto', estado: 'parcial',
    soporta: 'Localiza archivos contiguos, delimita su extensión por la estructura del formato, informa sector (512 B)/alineación y los analiza; solo lectura sobre copia en memoria.',
    limitaciones: 'No lee sistemas de archivos (FAT/NTFS/ext), no recupera nombres ni archivos eliminados por metadatos, no reensambla fragmentos; máx. 8 MiB por imagen en el navegador.', riesgos: 'Falsos positivos por firma: un candidato solo se da por recuperable tras analizarlo. Datos sobrescritos no existen.',
    dependencias: NINGUNA + '; para discos grandes: lectura por bloques (File.slice) sin cargar todo', modulo: 'lib/filerec/carve.ts', pruebas: 'lib/filerec/filerec.test.ts', datosReales: 'ninguno (imagen sintética)' },
  { id: 'sistemas-de-archivos', area: 'imagenes-de-disco', formato: 'FAT, NTFS, ext4, HFS+/APFS', estado: 'no-implementado', soporta: 'Nada.', limitaciones: 'Sin análisis de MFT, FAT, inodos ni journaling.', riesgos: 'Imágenes forenses reales requieren cadena de custodia y bloqueo de escritura físico.', dependencias: 'lectores de FS de solo lectura; muestras reales', modulo: null, pruebas: null, datosReales: 'ninguno' },

  // ── Reconstrucción de aplicaciones ─────────────────────────────────────────
  { id: 'reconstruccion-datos', area: 'reconstruccion-de-aplicaciones', formato: 'Modelo de aplicación desde tablas recuperadas', estado: 'implementado-probado',
    soporta: 'Esquema inferido, modelo multitabla con linaje, Studio de consulta/CRUD sobre copia de trabajo y prototipo HTML de solo consulta.',
    limitaciones: 'Solo a partir de datos tabulares; relaciones inferidas y aprobadas por el usuario; no recupera lógica de negocio ni interfaces originales.', riesgos: 'Atribuir al sistema original reglas que solo se infirieron: la interfaz lo advierte.',
    dependencias: NINGUNA, modulo: 'lib/studio.ts', pruebas: 'lib/v2.test.ts', datosReales: 'ninguno (escenario sintético)' },
  { id: 'reconstruccion-comportamiento', area: 'reconstruccion-de-aplicaciones', formato: 'Reconstrucción desde recursos y comportamiento de un programa', estado: 'no-implementado', soporta: 'Nada.', limitaciones: 'Requiere análisis estático/dinámico de binarios.', riesgos: 'Afirmar equivalencia funcional sin evidencia.', dependencias: 'Software Archaeology + entorno aislado', modulo: null, pruebas: null, datosReales: 'ninguno' },
];

export const ESTADO_LABEL: Record<Estado, string> = { 'implementado-probado': 'Implementado y probado', parcial: 'Parcial', 'no-implementado': 'No implementado' };
export const AREA_LABEL: Record<Area, string> = {
  documentos: 'Documentos', fotografias: 'Fotografías', 'audio-video': 'Audio y video', 'bases-de-datos': 'Bases de datos',
  programas: 'Programas heredados', 'imagenes-de-disco': 'Imágenes de disco', 'reconstruccion-de-aplicaciones': 'Reconstrucción de aplicaciones',
};
export function resumen(c: readonly Capacidad[] = CAPACIDADES) {
  const n = (e: Estado) => c.filter(x => x.estado === e).length;
  return { total: c.length, implementadoProbado: n('implementado-probado'), parcial: n('parcial'), noImplementado: n('no-implementado') };
}
