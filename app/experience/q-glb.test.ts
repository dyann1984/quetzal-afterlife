import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import {toParts,GLB_HEAD} from './q-glb';
import {sampleSurface,bounds,triangleCount} from './q-geometry';

const buf=readFileSync('public/models/quetzal.glb');
const ab=buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
const load=()=>new GLTFLoader().parseAsync(ab,'').then(g=>toParts(g.scene));

describe('modelo GLB del quetzal (Blender)',()=>{
 it('contiene las 7 partes con los atributos del sistema de datos',async()=>{
  const parts=await load();
  expect(parts.map(p=>p.id).sort()).toEqual(['anillo','cabeza','cola','cuerpo','globo','plumas_alas','plumas_cresta']);
  for(const p of parts)for(const a of ['position','normal','aU','aT','aPhase','aTone','aLayer'])expect(p.geometry.getAttribute(a),`${p.id}.${a}`).toBeTruthy();
 });
 it('silueta en Q: anillo a la derecha, plumas a la izquierda, cola larga abajo-derecha',async()=>{
  const parts=await load(),bb=(id:string)=>{const g=parts.find(p=>p.id===id)!.geometry;g.computeBoundingBox();return g.boundingBox!;};
  const all=bounds(parts),ring=bb('anillo'),wings=bb('plumas_alas'),tail=bb('cola'),crest=bb('plumas_cresta');
  expect(all.max.x-all.min.x).toBeGreaterThan(8);expect(all.max.y-all.min.y).toBeGreaterThan(7);
  expect(ring.max.x).toBeGreaterThan(2.5);expect(wings.min.x).toBeLessThan(-3.5);
  expect(tail.max.x).toBeGreaterThan(3.8);expect(tail.min.y).toBeLessThan(-3);
  expect(crest.max.y).toBeGreaterThan(3.5);
  // la cabeza queda dentro del recuadro de la cresta y el centro declarado está sobre ella
  const head=bb('cabeza');expect(head.containsPoint(new THREE.Vector3(GLB_HEAD[0],GLB_HEAD[1],0))).toBe(true);
 });
 it('el ojo está marcado (aTone=3) y hay oro solo en pico/punta de cola',async()=>{
  const parts=await load(),head=parts.find(p=>p.id==='cabeza')!.geometry.getAttribute('aTone');
  let eye=0,gold=0;for(let i=0;i<head.count;i++){if(head.getX(i)>2.5)eye++;else if(head.getX(i)>0.5)gold++;}
  expect(eye).toBeGreaterThan(20);expect(gold).toBeGreaterThan(20);
  const tail=parts.find(p=>p.id==='cola')!.geometry.getAttribute('aTone');let g=0;for(let i=0;i<tail.count;i++)if(tail.getX(i)>0.5)g++;
  expect(g/tail.count).toBeLessThan(0.2);
 });
 it('presupuesto: <120k triángulos y el aura se muestrea sobre el modelo',async()=>{
  const parts=await load();expect(triangleCount(parts)).toBeLessThan(120000);
  const s=sampleSurface(parts,500);expect(s.points.length).toBe(1500);
  let inside=0;const box=bounds(parts).expandByScalar(0.05);for(let i=0;i<500;i++)if(box.containsPoint(new THREE.Vector3(s.points[i*3],s.points[i*3+1],s.points[i*3+2])))inside++;
  expect(inside).toBe(500);
 });
});
