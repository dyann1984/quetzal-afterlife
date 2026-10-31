/**
 * Fixtures SINTÉTICOS del módulo de recuperación de archivos: generados por código, deterministas, sin datos reales.
 * Los JPEG son estructuralmente válidos pero NO decodificables como foto (no hay codificador de imagen).
 * Cada daño está documentado en FIXTURE_DAMAGE; sirven para demostrar el motor, no prueban recuperación de archivos reales.
 */
import { concat, crc32, deflateStored, ascii } from './core';
import { buildZip } from './zip';

export interface Fixture { name: string; bytes: Uint8Array; note: string; expectation: string }
const enc = new TextEncoder();

const chunk = (type: string, data: Uint8Array) => {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i); out.set(data, 8); dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length)); return out;
};
/** PNG RGB 8 bits sin entrelazar, degradado determinista, IDAT repartido en `idatChunks` partes. */
export function makePng(w = 16, h = 16, idatChunks = 4): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) { const o = y * (1 + w * 3); raw[o] = 0; for (let x = 0; x < w; x++) { raw[o + 1 + x * 3] = (x * 255 / w) | 0; raw[o + 2 + x * 3] = (y * 255 / h) | 0; raw[o + 3 + x * 3] = 128; } }
  const z = deflateStored(raw), ih = new Uint8Array(13), dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2;
  const per = Math.ceil(z.length / idatChunks), parts: Uint8Array[] = [];
  for (let o = 0; o < z.length; o += per) parts.push(chunk('IDAT', z.subarray(o, o + per)));
  const txt = chunk('tEXt', concat([ascii('Comment'), Uint8Array.of(0), enc.encode('Fixture sintetico Quetzal')]));
  return concat([Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk('IHDR', ih), txt, ...parts, chunk('IEND', new Uint8Array(0))]);
}

/** JPEG estructural: SOI, JFIF, DQT, SOF0, DHT, SOS, bytes de escaneo sin 0xFF y EOI. No es una foto decodificable. */
export function makeJpeg(scanBytes = 600, seed = 3): Uint8Array {
  const seg = (m: number, body: number[]) => Uint8Array.of(0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body);
  let s = seed; const scan = new Uint8Array(scanBytes).map(() => { s = (s * 1103515245 + 12345) >>> 0; return ((s >>> 16) % 254) + 1 === 0xff ? 0x7f : ((s >>> 16) % 254) + 1; });
  return concat([Uint8Array.of(0xff, 0xd8), seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), seg(0xdb, [0, ...new Array(64).fill(8)]),
    seg(0xc0, [8, 0, 32, 0, 32, 1, 1, 0x11, 0]), seg(0xc4, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), seg(0xda, [1, 1, 0, 0, 63, 0]), scan, Uint8Array.of(0xff, 0xd9)]);
}

/** PDF 1.4 de 2 páginas con flujos Flate (almacenados) y xref válida. Texto: «Hola Quetzal» y «Segunda pagina». */
export function makePdf(): Uint8Array {
  const parts: Uint8Array[] = [], offs: number[] = []; let pos = 0;
  const add = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
  const obj = (n: number, body: string | Uint8Array[]) => { offs[n] = pos; add(`${n} 0 obj\n`); if (typeof body === 'string') add(body); else body.forEach(add); add('\nendobj\n'); };
  const stream = (txt: string) => { const z = deflateStored(enc.encode(txt)); return [enc.encode(`<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, enc.encode('\nendstream')]; };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  obj(4, stream('BT /F1 14 Tf 72 720 Td (Hola Quetzal) Tj 0 -20 Td [(Recuperaci) 20 (on) ] TJ ET'));
  obj(5, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  obj(6, stream('BT /F1 14 Tf 72 720 Td (Segunda pagina \\(sintetica\\)) Tj ET'));
  obj(7, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const xrefAt = pos; let x = 'xref\n0 8\n0000000000 65535 f \n'; for (let n = 1; n <= 7; n++) x += `${String(offs[n]).padStart(10, '0')} 00000 n \n`;
  add(x + `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  return concat(parts);
}

const CT = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>';
export function makeDocx(): Uint8Array {
  const body = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Informe sintetico</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Linea con &amp; simbolo y </w:t></w:r><w:r><w:t>tabulacion</w:t></w:r></w:p></w:body></w:document>';
  return buildZip([{ name: '[Content_Types].xml', bytes: enc.encode(CT) }, { name: '_rels/.rels', bytes: enc.encode('<Relationships/>') }, { name: 'word/document.xml', bytes: enc.encode(body) }, { name: 'docProps/core.xml', bytes: enc.encode('<cp:coreProperties/>') }]);
}
export function makeXlsx(): Uint8Array {
  return buildZip([{ name: '[Content_Types].xml', bytes: enc.encode(CT) }, { name: 'xl/workbook.xml', bytes: enc.encode('<workbook><sheets><sheet name="Inventario" sheetId="1"/><sheet name="Ventas" sheetId="2"/></sheets></workbook>') },
    { name: 'xl/sharedStrings.xml', bytes: enc.encode('<sst><si><t>Producto</t></si><si><t>Cafe &amp; miel</t></si><si><t>Cantidad</t></si></sst>') }, { name: 'xl/worksheets/sheet1.xml', bytes: enc.encode('<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>') }]);
}

const cut = (b: Uint8Array, frac: number) => b.slice(0, Math.floor(b.length * frac));
function corrupt(b: Uint8Array, at: number, n = 4) { const c = b.slice(); for (let i = 0; i < n; i++) c[at + i] ^= 0xa5; return c; }

export const FIXTURE_DAMAGE = [
  'PNG íntegro; PNG con el 3.er chunk IDAT corrupto (CRC) y PNG truncado al 55 %.',
  'JPEG estructuralmente íntegro y JPEG truncado (sin EOI).',
  'PDF íntegro, PDF truncado antes de la xref y PDF con startxref inválido.',
  'DOCX íntegro, DOCX con una entrada alterada (CRC) y XLSX íntegro.',
  'ZIP sin directorio central (cola truncada).',
  'Imagen de disco sintética de 128 KiB: ruido + PNG, JPEG, PDF y DOCX sobre sectores de 512 B, uno de ellos parcialmente sobrescrito.',
] as const;

export function buildDisk(): Uint8Array {
  const disk = new Uint8Array(128 * 1024); let s = 99; for (let i = 0; i < disk.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; disk[i] = (s >>> 24) & 0x7f; if (i % 3 === 0) disk[i] = 0; }
  const put = (sector: number, b: Uint8Array) => disk.set(b, sector * 512);
  put(8, makePng(16, 16, 3)); put(24, makeJpeg(900, 5)); put(40, makePdf()); put(64, makeDocx());
  const png2 = makePng(24, 24, 4); put(100, corrupt(png2, 120, 24));   // PNG sobrescrito en parte
  return disk;
}

export function buildFixtures(): Fixture[] {
  const png = makePng(16, 16, 4), png2 = makePng(24, 24, 4), pdf = makePdf();
  const docx = makeDocx();
  const zipBad = corrupt(docx, 96, 6);
  const pdfCut = pdf.slice(0, new TextDecoder('latin1').decode(pdf).indexOf('xref\n0 8'));
  const pdfBadSx = (() => { const c = pdf.slice(), at = new TextDecoder('latin1').decode(c).lastIndexOf('startxref\n') + 10; for (let i = 0; i < 3; i++) c[at + i] = 0x39; return c; })();
  return [
    { name: 'imagen-integra.png', bytes: png, note: 'PNG sintético 16×16, 4 chunks IDAT', expectation: 'integro' },
    { name: 'imagen-crc-idat.png', bytes: (() => { const b = png2.slice(); let n = 0, p = 8; while (p < b.length) { const len = new DataView(b.buffer).getUint32(p), t = String.fromCharCode(...b.subarray(p + 4, p + 8)); if (t === 'IDAT' && ++n === 3) { b[p + 8 + 2] ^= 0xff; break; } p += 12 + len; } return b; })(), note: 'PNG 24×24 con el 3.er IDAT alterado', expectation: 'parcial' },
    { name: 'imagen-truncada.png', bytes: cut(png2, 0.55), note: 'PNG cortado al 55 %', expectation: 'parcial' },
    { name: 'foto-integra.jpg', bytes: makeJpeg(), note: 'JPEG estructural (no es una foto)', expectation: 'integro' },
    { name: 'foto-truncada.jpg', bytes: cut(makeJpeg(), 0.7), note: 'JPEG sin EOI', expectation: 'parcial' },
    { name: 'documento-integro.pdf', bytes: pdf, note: 'PDF 2 páginas con texto', expectation: 'integro' },
    { name: 'documento-truncado.pdf', bytes: pdfCut, note: 'PDF cortado antes de xref', expectation: 'parcial' },
    { name: 'documento-xref-roto.pdf', bytes: pdfBadSx, note: 'startxref inválido', expectation: 'danado' },
    { name: 'informe-integro.docx', bytes: docx, note: 'DOCX sintético', expectation: 'integro' },
    { name: 'informe-alterado.docx', bytes: zipBad, note: 'una entrada con CRC alterado', expectation: 'parcial' },
    { name: 'inventario.xlsx', bytes: makeXlsx(), note: 'XLSX sintético', expectation: 'integro' },
    { name: 'sin-directorio.zip', bytes: docx.slice(0, docx.length - 90), note: 'ZIP sin EOCD', expectation: 'danado' },
    { name: 'disco-sintetico.img', bytes: buildDisk(), note: 'imagen de 128 KiB para carving', expectation: 'carving' },
  ];
}


