import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {buildQuetzal,bounds,triangleCount,sampleSurface,type BirdPart} from './quetzal-geometry';

const parts=buildQuetzal();
const byId=(id:string)=>parts.find(p=>p.id===id)!;
const box=(p:BirdPart)=>{const g=p.geometry.clone();if(p.pivot)g.translate(...p.pivot);g.computeBoundingBox();return g.boundingBox!;};

describe('geometría 3D real del quetzal',()=>{
 it('contiene cabeza/cuerpo, pico, cresta, dos alas, cola y rama',()=>{
  expect(parts.map(p=>p.id).sort()).toEqual(['ala-cercana','ala-lejana','cola','cresta','cuerpo','pico-ojos','rama']);
 });
 it('sin NaN, con normales y atributos comunes en todas las partes',()=>{
  for(const p of parts){
   for(const n of ['position','normal','color','aT','aPhase']){
    const a=p.geometry.getAttribute(n);expect(a,`${p.id}.${n}`).toBeTruthy();
    for(const v of a.array as Float32Array)if(!Number.isFinite(v))throw new Error(`${p.id}.${n} no finito`);
   }
   expect(p.geometry.index!.count%3).toBe(0);
  }
 });
 it('proporciones de ave (no humanoide): cola ≥ 2× el cuerpo, cabeza sobre el pecho, pico hacia delante',()=>{
  const body=box(byId('cuerpo')),tail=box(byId('cola')),beak=box(byId('pico-ojos')),crest=box(byId('cresta'));
  const bodyH=crest.max.y-body.min.y;                // cresta → vientre/patas
  const tailLen=tail.max.y-tail.min.y;
  expect(tailLen/bodyH).toBeGreaterThan(1.8);
  expect(tail.min.y).toBeLessThan(-4.5);
  expect(beak.max.x).toBeGreaterThan(body.max.x);    // el pico sobresale por delante
  expect(crest.min.y).toBeGreaterThan(0.9);          // la cresta está sobre la cabeza
  expect(body.max.y).toBeGreaterThan(1.1);           // cabeza elevada sobre el pecho
 });
 it('las alas son volúmenes emplumados a ambos lados del cuerpo',()=>{
  const a=box(byId('ala-cercana')),b=box(byId('ala-lejana'));
  expect(a.min.z).toBeGreaterThan(-0.05);expect(b.max.z).toBeLessThan(0.05);
  const span=a.max.z-b.min.z;expect(span).toBeGreaterThan(1.8);expect(span).toBeLessThan(4);
  expect(a.max.x-a.min.x).toBeGreaterThan(1.5);                 // se extienden hacia atrás
  expect(byId('ala-cercana').pivot![2]).toBeGreaterThan(0);expect(byId('ala-lejana').pivot![2]).toBeLessThan(0);
  expect(byId('ala-cercana').geometry.index!.count/3).toBeGreaterThan(900); // decenas de plumas, no líneas
 });
 it('la cola tiene 5 plumas largas diferenciadas + abanico corto',()=>{
  const t=byId('cola').geometry,aPhase=t.getAttribute('aPhase');
  expect(new Set(Array.from(aPhase.array as Float32Array).map(v=>v.toFixed(2))).size).toBeGreaterThanOrEqual(11);
 });
 it('presupuesto de GPU integrada: ≤ 8 partes (draw calls), < 25 000 triángulos',()=>{
  expect(parts.length).toBeLessThanOrEqual(8);
  expect(triangleCount(parts)).toBeLessThan(25000);
 });
 it('es determinista y rápido de construir (< 400 ms)',()=>{
  const t0=performance.now();const again=buildQuetzal();const ms=performance.now()-t0;
  expect(ms).toBeLessThan(400);
  const sum=(ps:BirdPart[])=>ps.reduce((s,p)=>s+(p.geometry.getAttribute('position').array as Float32Array).reduce((a,b)=>a+b,0),0);
  expect(sum(again)).toBeCloseTo(sum(parts),3);
 });
 it('bounds: altura total con cola entre 6 y 9 unidades; ancho de alas menor que la altura',()=>{
  const b=bounds(parts),size=b.getSize(new THREE.Vector3());
  expect(size.y).toBeGreaterThan(6);expect(size.y).toBeLessThan(9);
  expect(size.z).toBeLessThan(size.y);
 });
});

describe('muestreo de superficie para partículas',()=>{
 it('genera puntos sobre la silueta real (dentro de los límites) y es determinista',()=>{
  const a=sampleSurface(parts,1500),b=sampleSurface(parts,1500);
  expect(Array.from(a.points.slice(0,30))).toEqual(Array.from(b.points.slice(0,30)));
  const bb=bounds(parts);bb.expandByScalar(0.01);
  for(let i=0;i<a.points.length;i+=3)expect(bb.containsPoint(new THREE.Vector3(a.points[i],a.points[i+1],a.points[i+2]))).toBe(true);
  expect(new Set(a.partOf).size).toBeGreaterThanOrEqual(5);
  expect(a.gold.some(x=>x===1)&&a.gold.some(x=>x===0)).toBe(true);
 });
 it('muestrear 6000 puntos tarda < 150 ms',()=>{
  const t0=performance.now();sampleSurface(parts,6000);expect(performance.now()-t0).toBeLessThan(150);
 });
});
