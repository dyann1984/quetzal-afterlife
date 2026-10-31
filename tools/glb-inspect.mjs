// Inspecciona un GLB: nodos, mallas y atributos por primitiva. Uso: node tools/glb-inspect.mjs public/models/quetzal.glb
import fs from 'node:fs';
const b = fs.readFileSync(process.argv[2]);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.slice(20, 20 + jl).toString());
console.log('nodes', j.nodes.map(n => n.name + (n.mesh !== undefined ? '#' + n.mesh : '') + (n.rotation ? ' rot' : '') + (n.matrix ? ' mat' : '')).join(', '));
j.meshes.forEach((m, i) => console.log(i, m.name, m.primitives.map(p => Object.keys(p.attributes).join('/')).join(' | ')));
