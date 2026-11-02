/**
 * Explicación en lenguaje sencillo de un informe técnico. Es un sistema de REGLAS DETERMINISTAS: cada frase sale de un campo
 * del informe (formato, integridad, códigos de hallazgo, reparación). No es un modelo de IA, no consulta ningún servicio y
 * no añade información que el informe no contenga. Ante la misma entrada produce siempre la misma explicación.
 */
import type { FileReport } from './types';
import type { Bi } from './lab';
import { translateMessage } from '../i18n/msgs';

const B = (es: string, en: string): Bi => ({ es, en });
export interface Explanation { kind: Bi; damage: Bi[]; method: Bi; reading: Bi; limits: Bi; next: Bi[]; source: Bi }

const DAMAGE: Record<string, Bi> = {
  crc_invalido: B('Una suma de control (CRC-32) no coincide: o se alteró el dato o se alteró la propia suma.', 'A checksum (CRC-32) does not match: either the data or the checksum itself was altered.'),
  firma_alterada: B('Los primeros bytes que identifican el formato (la «firma») están cambiados.', 'The first bytes that identify the format (the “signature”) were changed.'),
  firma_local_alterada: B('La marca que abre una de las entradas del archivo comprimido está cambiada.', 'The marker that opens one of the compressed archive’s entries was changed.'),
  chunk_truncado: B('El archivo termina antes de lo que declara: está cortado.', 'The file ends earlier than it declares: it is cut off.'),
  sin_iend: B('Falta la marca de cierre del archivo.', 'The end-of-file marker is missing.'),
  idat_interrumpido: B('Los datos de imagen se interrumpen en un punto; lo posterior depende de lo anterior y no es utilizable.', 'The image data is interrupted at some point; what follows depends on what came before and is unusable.'),
  flujo_idat_danado: B('El flujo comprimido de la imagen se corta o se rompe.', 'The image’s compressed stream is cut or broken.'),
  filas_ausentes: B('Faltan filas de la imagen: no existen en el archivo.', 'Rows of the image are missing: they do not exist in the file.'),
  ihdr_invalido: B('Falta la cabecera de la imagen (dimensiones): sin ella no se puede interpretar.', 'The image header (dimensions) is missing: without it the image cannot be interpreted.'),
  ihdr_no_verificable: B('La cabecera de la imagen está dañada y no hay forma de confirmar las dimensiones.', 'The image header is damaged and there is no way to confirm the dimensions.'),
  sin_idat: B('No hay datos de imagen utilizables.', 'There is no usable image data.'),
  secuencias_invalidas: B('Hay bytes que no forman texto válido (a cero, basura o caracteres partidos).', 'There are bytes that do not form valid text (zeroed, garbage or split characters).'),
  bytes_nulos: B('Hay caracteres nulos dentro del texto.', 'There are null characters inside the text.'),
  entrada_crc: B('Una entrada del archivo comprimido tiene contenido que no coincide con su suma de control.', 'An entry of the compressed archive has content that does not match its checksum.'),
  entrada_error: B('Un flujo comprimido está roto a partir de cierto byte.', 'A compressed stream is broken from a certain byte on.'),
  entrada_truncado: B('Una entrada comprimida está cortada.', 'A compressed entry is cut off.'),
  sin_eocd: B('Falta el índice final del archivo comprimido (directorio central).', 'The archive’s final index (central directory) is missing.'),
  entrada_central_invalida: B('El índice del archivo comprimido está dañado.', 'The archive’s index is damaged.'),
  recorrido_por_cabeceras: B('El índice no es utilizable; la lista de entradas se reconstruyó leyendo el archivo de principio a fin.', 'The index is unusable; the entry list was rebuilt by reading the file from start to end.'),
  demasiado_grande: B('El archivo supera el límite de tamaño y no se analizó.', 'The file exceeds the size limit and was not analysed.'),
  ejecutable_no_ejecutado: B('Es un programa: se identifica pero nunca se ejecuta.', 'It is a program: it is identified but never run.'),
  sin_analizador: B('Se reconoce el formato, pero todavía no hay un analizador para él.', 'The format is recognised, but there is no analyser for it yet.'),
};

export function explainReport(r: FileReport): Explanation {
  const damage = [...new Set(r.findings.map(f => f.code))].map(c => DAMAGE[c]).filter((x): x is Bi => !!x);
  const kind = B(`Tipo probable: ${r.label} (confianza de identificación ${r.confidence}). Se decidió por: ${r.signals.join('; ')}.`,
    `Probable type: ${translateMessage(r.label)} (identification confidence ${translateMessage(r.confidence)}). Decided by: ${r.signals.map(translateMessage).join('; ')}.`);
  const rep = r.repaired, verifiedItems = r.items.filter(i => i.verified && i.kind !== 'metadatos').length;
  let method: Bi, reading: Bi, next: Bi[];
  if (r.integrity === 'integro') {
    method = B('No hizo falta reparar nada: todas las comprobaciones pasaron.', 'Nothing needed repairing: every check passed.');
    reading = B('El archivo está íntegro según las comprobaciones disponibles.', 'The file is intact according to the available checks.');
    next = [B('Puedes usarlo con normalidad. Guarda su SHA-256 para detectar cambios futuros.', 'You can use it normally. Keep its SHA-256 to detect future changes.')];
  } else if (r.integrity === 'irrecuperable' || r.integrity === 'no-analizado') {
    method = B('El motor no encontró una estructura de la que partir, así que no intentó reparar.', 'The engine found no structure to start from, so it did not attempt a repair.');
    reading = B(r.integrity === 'no-analizado' ? 'El archivo no se analizó, por lo que no hay veredicto sobre su integridad.' : 'No hay información recuperable que pueda verificarse. Lo sobrescrito o ausente no existe: no se inventa.', r.integrity === 'no-analizado' ? 'The file was not analysed, so there is no verdict on its integrity.' : 'There is no recoverable information that can be verified. What was overwritten or is missing does not exist: it is not invented.');
    next = [B('Busca otra copia: un respaldo, el origen de la descarga o una versión anterior.', 'Look for another copy: a backup, the download source or an earlier version.'), B('Si es un disco, deja de usarlo y trabaja sobre una imagen para no sobrescribir más datos.', 'If it is a disk, stop using it and work on an image so no more data is overwritten.')];
  } else {
    method = rep ? B(`Se generó «${rep.name}» a partir de lo verificable. ${rep.structureVerified ? 'Al re-analizarlo, su estructura pasó las comprobaciones.' : 'Su estructura NO pasó la re-verificación: úsalo con cautela.'}`, `“${rep.name}” was generated from what is verifiable. ${rep.structureVerified ? 'When re-analysed, its structure passed the checks.' : 'Its structure did NOT pass re-verification: use it with caution.'}`)
      : B('No se pudo generar un archivo reparado; solo se extrajo lo verificable.', 'No repaired file could be generated; only what is verifiable was extracted.');
    reading = r.integrity === 'danado'
      ? B(`El contenido está completo (${verifiedItems} elemento(s) verificados) y los daños están en campos de control.`, `The content is complete (${verifiedItems} verified element(s)) and the damage is in control fields.`)
      : B(`Recuperación parcial: ${verifiedItems} elemento(s) verificados; el resto se perdió o no se puede verificar.`, `Partial recovery: ${verifiedItems} verified element(s); the rest was lost or cannot be verified.`);
    next = [B('Descarga el archivo recuperado y el informe JSON.', 'Download the recovered file and the JSON report.'), B('Compara su SHA-256 con el de un original si dispones de él.', 'Compare its SHA-256 with an original’s if you have one.'), B('Conserva el archivo dañado: una herramienta futura podría rescatar más.', 'Keep the damaged file: a future tool might rescue more.')];
  }
  const limits = r.limitations.length ? B(r.limitations.slice(0, 2).join(' '), r.limitations.slice(0, 2).join(' ')) : B('Sin limitaciones adicionales registradas.', 'No additional limitations recorded.');
  return { kind, damage, method, reading, limits, next, source: B('Explicación generada por reglas deterministas a partir del informe técnico; no es un modelo de IA ni consulta ningún servicio.', 'Explanation generated by deterministic rules from the technical report; it is not an AI model and calls no service.') };
}
