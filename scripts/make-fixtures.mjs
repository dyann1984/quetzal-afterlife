// Genera fixtures SINTÉTICOS para la demostración (determinista, sin red).
// Uso: node scripts/make-fixtures.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('fixtures', { recursive: true });

const fields = [
  { name: 'CODIGO', len: 8 },
  { name: 'DESCRIP', len: 20 },
  { name: 'CANTIDAD', len: 6 },
];
const records = [
  { del: false, v: ['Q-001', 'Quetzal verde', '12'] },
  { del: false, v: ['Q-002', 'Obsidiana negra', '5'] },
  { del: true,  v: ['Q-003', 'Jade esculpido', '8'] },
  { del: false, v: ['Q-004', 'Turquesa maya', 'N/A'] },
  { del: false, v: ['Q-005', 'Ambar chiapaneco', '3'] },
  { del: false, v: ['Q-006', 'Obsidiana dorada', '7'] },
];

const recLen = 1 + fields.reduce((n, f) => n + f.len, 0);
const headerLen = 32 + 32 * fields.length + 1;
const buf = Buffer.alloc(headerLen + recLen * records.length + 1);
buf[0] = 0x03; buf[1] = 126; buf[2] = 10; buf[3] = 31; // fecha fija 2026-10-31
buf.writeUInt32LE(records.length, 4);
buf.writeUInt16LE(headerLen, 8);
buf.writeUInt16LE(recLen, 10);
fields.forEach((f, i) => {
  const o = 32 + 32 * i;
  buf.write(f.name, o, 'ascii');
  buf.write('C', o + 11, 'ascii');
  buf[o + 16] = f.len;
});
buf[headerLen - 1] = 0x0d;
records.forEach((r, i) => {
  const o = headerLen + recLen * i;
  buf[o] = r.del ? 0x2a : 0x20;
  let p = o + 1;
  fields.forEach((f, j) => { buf.fill(0x20, p, p + f.len); buf.write(r.v[j], p, 'latin1'); p += f.len; });
});
buf[buf.length - 1] = 0x1a;
writeFileSync('fixtures/demo-sintetico-inventario.dbf', buf);

writeFileSync('fixtures/demo-sintetico-principal.csv',
  'id,nombre,cantidad\nA-1,Tornillo,10\nA-2,Tuerca,5\nA-3,Arandela,7\nA-4,Perno,3\n');
writeFileSync('fixtures/demo-sintetico-referencia.csv',
  'id,nombre,cantidad\nA-1,Tornillo,10\nA-2,Tuerca,6\nA-3,Arandela,7\nA-9,Clavo,2\n');
console.log('fixtures sintéticos generados');
