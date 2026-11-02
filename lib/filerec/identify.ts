/**
 * Identificación por firmas binarias (no por extensión). Solo lee los primeros bytes.
 * Los ejecutables se IDENTIFICAN y se marcan como peligrosos: nunca se ejecutan ni se cargan.
 */
import { ascii, matches, latin1 } from './core';
import type { Category, Identification } from './types';
import { pngSignatureDamaged } from './png';
import { zipSignatureDamaged } from './zip';

interface Sig { id: string; label: string; category: Category; analyzer: string | null; at: number; bytes: ArrayLike<number>; dangerous?: boolean; weak?: boolean; extra?: (b: Uint8Array) => boolean }
const S = (id: string, label: string, category: Category, analyzer: string | null, at: number, bytes: ArrayLike<number> | string, o: Partial<Sig> = {}): Sig =>
  ({ id, label, category, analyzer, at, bytes: typeof bytes === 'string' ? ascii(bytes) : bytes, ...o });

const SIGS: Sig[] = [
  S('png', 'PNG', 'imagen', 'png', 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  S('jpeg', 'JPEG', 'imagen', 'jpeg', 0, [0xff, 0xd8, 0xff]),
  S('gif', 'GIF', 'imagen', 'gif', 0, 'GIF8'),
  S('tiff-le', 'TIFF', 'imagen', null, 0, [0x49, 0x49, 0x2a, 0x00]),
  S('tiff-be', 'TIFF', 'imagen', null, 0, [0x4d, 0x4d, 0x00, 0x2a]),
  S('bmp', 'BMP', 'imagen', 'bmp', 0, 'BM', { weak: true, extra: b => b.length > 10 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0 }),
  S('webp', 'WebP', 'imagen', null, 0, 'RIFF', { extra: b => matches(b, 8, ascii('WEBP')) }),
  S('wav', 'WAV', 'audio', 'wav', 0, 'RIFF', { extra: b => matches(b, 8, ascii('WAVE')) }),
  S('avi', 'AVI', 'video', null, 0, 'RIFF', { extra: b => matches(b, 8, ascii('AVI ')) }),
  S('pdf', 'PDF', 'documento', 'pdf', 0, '%PDF-'),
  S('zip', 'ZIP', 'comprimido', 'zip', 0, [0x50, 0x4b, 0x03, 0x04]),
  S('zip-vacio', 'ZIP (vacío)', 'comprimido', 'zip', 0, [0x50, 0x4b, 0x05, 0x06]),
  S('gzip', 'GZIP', 'comprimido', null, 0, [0x1f, 0x8b, 0x08]),
  S('7z', '7-Zip', 'comprimido', null, 0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  S('rar', 'RAR', 'comprimido', null, 0, 'Rar!\u001a\u0007'),
  S('ole2', 'OLE2 (DOC/XLS/PPT heredados)', 'documento', null, 0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  S('mp3', 'MP3', 'audio', null, 0, 'ID3'),
  S('mp3-frame', 'MP3 (trama)', 'audio', null, 0, [0xff, 0xfb], { weak: true }),
  S('mp4', 'MP4/MOV (ISO BMFF)', 'video', null, 4, 'ftyp'),
  S('mkv', 'Matroska/WebM', 'video', null, 0, [0x1a, 0x45, 0xdf, 0xa3]),
  S('flac', 'FLAC', 'audio', null, 0, 'fLaC'),
  S('ogg', 'Ogg', 'audio', null, 0, 'OggS'),
  S('sqlite', 'SQLite 3', 'base-de-datos', null, 0, 'SQLite format 3\u0000'),
  S('pe', 'Ejecutable Windows (PE/MZ)', 'ejecutable', null, 0, 'MZ', { dangerous: true }),
  S('elf', 'Ejecutable ELF', 'ejecutable', null, 0, [0x7f, 0x45, 0x4c, 0x46], { dangerous: true }),
  S('macho', 'Ejecutable Mach-O', 'ejecutable', null, 0, [0xcf, 0xfa, 0xed, 0xfe], { dangerous: true }),
  S('macho32', 'Ejecutable Mach-O', 'ejecutable', null, 0, [0xce, 0xfa, 0xed, 0xfe], { dangerous: true }),
  S('script', 'Script (#!)', 'ejecutable', null, 0, '#!', { dangerous: true }),
];

const looksText = (b: Uint8Array): boolean => {
  const n = Math.min(b.length, 4096); if (n === 0) return false;
  // Un texto dañado puede tener algunos bytes a cero o de control: se acepta si la mayoría es ASCII imprimible o UTF-8 válido.
  let ctrl = 0, nul = 0, print = 0; for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0) nul++; else if (c < 9 || (c > 13 && c < 32)) ctrl++; else if (c >= 32 && c < 127) print++; }
  if (nul === 0) return ctrl / n < 0.02;
  return (nul + ctrl) / n < 0.1 && print / n > 0.7;
};

export function identify(bytes: Uint8Array, name: string): Identification {
  const ext = (name.toLowerCase().split('.').pop() ?? '');
  let hit: Sig | null = null;
  // %PDF- puede estar hasta 1024 bytes después del inicio (basura previa)
  const pdfAt = bytes.length ? latin1(bytes, 0, Math.min(1024, bytes.length)).indexOf('%PDF-') : -1;
  for (const s of SIGS) {
    if (s.id === 'pdf') continue;
    if (matches(bytes, s.at, s.bytes) && (!s.extra || s.extra(bytes))) { if (!hit || (hit.weak && !s.weak)) hit = s; if (!s.weak) break; }
  }
  if (!hit && pdfAt >= 0) hit = SIGS.find(s => s.id === 'pdf')!;
  // Firma alterada pero con estructura interna reconocible (se identifica con confianza media y se explica por qué)
  if (!hit && pngSignatureDamaged(bytes)) return { id: 'png', label: 'PNG', category: 'imagen', analyzer: 'png', confidence: 'media', signals: ['firma binaria alterada, pero el chunk IHDR (longitud 13) está en su posición de PNG'], dangerous: false };
  if (!hit && zipSignatureDamaged(bytes)) return { id: 'zip', label: 'ZIP', category: 'comprimido', analyzer: 'zip', confidence: 'media', signals: ['firma binaria alterada, pero el directorio central ZIP (PK 01 02) y su cierre están íntegros'], dangerous: false };
  const signals: string[] = [];
  if (hit) {
    signals.push(`firma binaria de ${hit.label}${hit.id === 'pdf' && pdfAt > 0 ? ` a ${pdfAt} bytes del inicio` : ''}`);
    const expected: Record<string, string[]> = { png: ['png'], jpeg: ['jpg', 'jpeg'], pdf: ['pdf'], zip: ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'jar', 'apk'], 'zip-vacio': ['zip'] };
    if (ext && expected[hit.id] && !expected[hit.id].includes(ext)) signals.push(`la extensión ".${ext}" no coincide con el contenido (${hit.label})`);
    if (hit.dangerous) signals.push('programa o script: NUNCA se ejecuta; solo se identifica');
    return { id: hit.id === 'zip-vacio' ? 'zip' : hit.id, label: hit.label, category: hit.category, analyzer: hit.analyzer, confidence: hit.weak ? 'baja' : 'alta', signals, dangerous: !!hit.dangerous };
  }
  if (looksText(bytes)) return { id: 'txt', label: 'Texto', category: 'texto', analyzer: 'text', confidence: 'media', signals: ['sin bytes nulos y con proporción baja de control'], dangerous: false };
  return { id: 'desconocido', label: 'Desconocido', category: 'desconocido', analyzer: null, confidence: 'baja', signals: ['sin firma ni estructura reconocida'], dangerous: false };
}
