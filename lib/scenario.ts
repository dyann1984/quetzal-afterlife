/**
 * lib/scenario.ts — Escenario SINTÉTICO "Comercial Quetzal 1998"
 * Quetzal Afterlife · Resurrection Engine
 *
 * Todo el contenido es inventado para esta demostración y es determinista.
 * Los daños son CONTROLADOS y están documentados en SCENARIO_DAMAGE: sirven para
 * demostrar el motor, no constituyen una recuperación de archivos reales.
 */

export const SCENARIO_LABEL = 'SINTÉTICO — Comercial Quetzal 1998';

export interface SynthFile { name: string; bytes: Uint8Array }

interface Col { name: string; len: number; type?: 'C' | 'N' | 'D'; dec?: number }

export function buildDbf(cols: Col[], rows: Array<{ v: string[]; del?: boolean; flag?: number }>): Uint8Array {
  const recLen = 1 + cols.reduce((n, c) => n + c.len, 0);
  const headerLen = 32 + 32 * cols.length + 1;
  const buf = new Uint8Array(headerLen + recLen * rows.length + 1);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x03; buf[1] = 98; buf[2] = 6; buf[3] = 30;
  dv.setUint32(4, rows.length, true); dv.setUint16(8, headerLen, true); dv.setUint16(10, recLen, true);
  cols.forEach((c, i) => {
    const o = 32 + 32 * i;
    for (let k = 0; k < Math.min(c.name.length, 10); k++) buf[o + k] = c.name.charCodeAt(k);
    buf[o + 11] = (c.type ?? 'C').charCodeAt(0); buf[o + 16] = c.len; buf[o + 17] = c.dec ?? 0;
  });
  buf[headerLen - 1] = 0x0d;
  rows.forEach((r, i) => {
    const o = headerLen + recLen * i;
    buf[o] = r.flag ?? (r.del ? 0x2a : 0x20);
    let p = o + 1;
    cols.forEach((c, j) => {
      buf.fill(0x20, p, p + c.len);
      const t = r.v[j] ?? '';
      const text = c.type === 'N' || c.type === 'D' ? t.padStart(c.len, ' ') : t;
      for (let k = 0; k < Math.min(text.length, c.len); k++) buf[p + k] = text.charCodeAt(k) & 0xff;
      p += c.len;
    });
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}

const clientes = [
  ['C-001', 'Ana Morales', 'Tuxtla', 'ana.morales@ejemplo.test'],
  ['C-002', 'Beto Jimenez', 'Oaxaca', 'beto.j@ejemplo.test'],
  ['C-003', 'Carla Nunez', 'Merida', 'carla.n@ejemplo.test'],
  ['C-004', 'Diego Pineda', 'Tuxtla', 'diego.p@ejemplo.test'],
  ['C-005', 'Elena Ruiz', 'Puebla', 'elena.r@ejemplo.test'],
  ['C-006', 'Fabian Solis', 'Oaxaca', 'fabian.s@ejemplo.test'],
  ['C-007', 'Gloria Vega', 'Merida', 'gloria.v@ejemplo.test'],
  ['C-008', 'Hugo Tapia', 'Puebla', 'hugo.t@ejemplo.test'],
  ['C-009', 'Irma Lopez', 'Tuxtla', 'irma.l@ejemplo.test'],
  ['C-010', 'Jorge Mena', 'Oaxaca', 'jorge.m@ejemplo.test'],
  ['C-011', 'Beto Jimenez', 'Oaxaca', 'beto.j@ejemplo.test'], // duplicado de C-002
  ['C-012', 'Karla Ortiz', 'Merida', 'karla.o@ejemplo.test'],
];
const productos = [
  ['P-001', 'Cafe de altura 1kg', '185.00'], ['P-002', 'Miel de abeja 500g', '96.50'],
  ['P-003', 'Cacao molido 250g', '74.00'], ['P-004', 'Vainilla extracto', '120.00'],
  ['P-005', 'Chocolate en barra', '48.00'], ['P-006', 'Azucar mascabado', '32.00'],
  ['P-007', 'Canela en rama', '28.50'], ['P-008', 'Pimienta gorda', '41.00'],
  ['P-009', 'Maiz azul 2kg', '55.00'], ['P-010', 'Frijol negro 1kg', '38.00'],
];
const ventasCli = ['C-001', 'C-002', 'C-003', 'C-004', 'C-005', 'C-006', 'C-008', 'C-009', 'C-099', 'C-010', 'C-012', 'C-001', 'C-003', 'C-004', 'C-005'];
const ventas = ventasCli.map((c, i) => [`V-${String(i + 1).padStart(4, '0')}`, c, `1998${String(1 + (i % 12)).padStart(2, '0')}15`, '0']);

/** Detalle: 2 líneas por venta (V-0001..V-0015); el total de la venta es la suma. */
const detalle: string[][] = [];
ventas.forEach((v, i) => {
  const a = productos[i % 10], b = productos[(i + 3) % 10];
  detalle.push([v[0], a[0], String(1 + (i % 3)), a[2]], [v[0], b[0], String(1 + ((i + 1) % 2)), b[2]]);
});
detalle[7] = [detalle[7][0], 'P-077', '2', '10.00'];            // producto inexistente
detalle[12] = [detalle[12][0], detalle[12][1]];                  // fila irregular
ventas.forEach((v, i) => {
  v[3] = detalle.slice(i * 2, i * 2 + 2).reduce((s, d) => s + (d.length === 4 ? Number(d[2]) * Number(d[3]) : 0), 0).toFixed(2);
});
const inventario = productos.map((p, i) => [p[0], String(20 + i * 7)]);

export const SCENARIO_DAMAGE = [
  'VENTAS.DBF: truncado; se conservan 12 registros completos y 14 bytes de un 13.º. Se pierden V-0013 (parcial), V-0014 y V-0015.',
  'VENTAS.DBF: V-0009 referencia al cliente C-099, que no existe (inconsistencia del dato original).',
  'CLIENTES.DBF: C-007 marcado como borrado; C-011 duplica a C-002 (mismo nombre y correo).',
  'DETALLE.CSV: una fila con celdas faltantes; una línea referencia el producto P-077, inexistente.',
  'INVENTARIO.DBF: bytes 0xFF en EXISTENCIA del registro 4; byte de borrado inválido en el registro 8.',
  'RESPALDO.DB: cabecera SQLite que declara 3 páginas pero contiene 2.',
] as const;

export const ESCENARIO_ESPERADO = { clientes: 12, productos: 10, ventasDeclaradas: 15, ventasLegibles: 13, ventasIntactas: 12 } as const;

export function buildScenario(): SynthFile[] {
  const enc = (s: string) => new TextEncoder().encode(s);

  const cli = buildDbf([{ name: 'CODIGO', len: 6 }, { name: 'NOMBRE', len: 20 }, { name: 'CIUDAD', len: 12 }, { name: 'EMAIL', len: 26 }],
    clientes.map((c, i) => ({ v: c, del: i === 6 })));
  const pro = buildDbf([{ name: 'CODIGO', len: 6 }, { name: 'DESCRIP', len: 20 }, { name: 'PRECIO', len: 8, type: 'N', dec: 2 }], productos.map(p => ({ v: p })));
  const venFull = buildDbf([{ name: 'FOLIO', len: 6 }, { name: 'CLIENTE', len: 6 }, { name: 'FECHA', len: 8, type: 'D' }, { name: 'TOTAL', len: 10, type: 'N', dec: 2 }], ventas.map(v => ({ v })));
  const ven = venFull.slice(0, 32 + 32 * 4 + 1 + 31 * 12 + 14); // truncamiento controlado
  const inv = buildDbf([{ name: 'CODIGO', len: 6 }, { name: 'EXISTENCIA', len: 6, type: 'N' }], inventario.map(r => ({ v: r })));
  const invOff = 32 + 32 * 2 + 1, invRec = 1 + 6 + 6;
  inv.fill(0xff, invOff + invRec * 3 + 1 + 6, invOff + invRec * 3 + 1 + 12); // EXISTENCIA del registro 4
  inv[invOff + invRec * 7] = 0x41;                                           // byte de borrado inválido (reg. 8)

  const csv = 'folio,codigo,cantidad,precio\n' + detalle.map(r => r.join(',')).join('\n') + '\n';

  const sqlite = new Uint8Array(4096 * 2);
  sqlite.set(enc('SQLite format 3\0'), 0);
  new DataView(sqlite.buffer).setUint16(16, 4096, false);
  new DataView(sqlite.buffer).setUint32(28, 3, false);
  new DataView(sqlite.buffer).setUint32(56, 1, false);

  return [
    { name: 'CLIENTES.DBF', bytes: cli }, { name: 'PRODUCTOS.DBF', bytes: pro }, { name: 'VENTAS.DBF', bytes: ven },
    { name: 'DETALLE.CSV', bytes: enc(csv) }, { name: 'INVENTARIO.DBF', bytes: inv }, { name: 'RESPALDO.DB', bytes: sqlite },
  ];
}
