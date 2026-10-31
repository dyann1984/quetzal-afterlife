import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {buildQ,bounds,triangleCount,sampleSurface,RING} from './q-geometry';

const {parts,meta}=buildQ();
const part=(id:string)=>parts.find(p=>p.id===id)!;

describe('emblema Q: composición medible (proxy de la referencia, no sustituye la revisión visual)',()=>{
 it('partes esperadas y presupuesto de GPU integrada',()=>{
  expect(parts.map(p=>p.id).sort()).toEqual(['anillo','cabeza','cola','globo','plumas']);
  expect(parts.length).toBeLessThanOrEqual(6);
  expect(triangleCount(parts)).toBeLessThan(45000);
  expect(meta.featherCount).toBeGreaterThanOrEqual(28);   // 27 plumas concéntricas + 3 de cola (menos, pero más anchas que el diseño de abanico)
 });
 it('sin NaN y con atributos holográficos en las superficies',()=>{
  for(const p of parts){
   const pos=p.geometry.getAttribute('position');
   for(const v of pos.array as Float32Array)if(!Number.isFinite(v))throw new Error(p.id+' no finito');
   if(p.kind!=='globo')for(const a of ['aU','aT','aPhase','aTone','aLayer','normal'])expect(p.geometry.getAttribute(a),`${p.id}.${a}`).toBeTruthy();
  }
 });
 it('la silueta es COMPACTA y circular (no una figura alta y estrecha)',()=>{
  const size=bounds(parts).getSize(new THREE.Vector3());
  const aspect=size.x/size.y;
  expect(aspect).toBeGreaterThan(1.05);expect(aspect).toBeLessThan(1.6);
  expect(size.x).toBeGreaterThan(7);expect(size.x).toBeLessThan(10);
  expect(size.z).toBeGreaterThan(1.5);expect(size.z).toBeLessThan(3.6);   // volumen por capas: ni plano ni profundo
 });
 it('las plumas de las alas barren a la IZQUIERDA y forman la mitad superior del círculo',()=>{
  const left=meta.tips.filter(t=>t.group!=='cola'&&t.x<-1.2);
  expect(left.length).toBeGreaterThanOrEqual(12);
  const upperLeft=meta.tips.filter(t=>t.group==='cresta-alas'&&t.x<RING.cx&&t.y>1.0);
  expect(upperLeft.length).toBeGreaterThanOrEqual(3);   // las más cortas terminan arriba-izquierda
  // y las largas cruzan todo el ancho hacia la izquierda: arcos horizontales de ≥ 2.8 u, no abanico vertical
  expect(meta.tips.filter(t=>t.group==='cresta-alas'&&t.bbox[0]>2.8).length).toBeGreaterThanOrEqual(4);
  // las puntas del grupo de alas siguen el círculo hacia la izquierda (barrido antihorario)
  for(const t of meta.tips.filter(t=>t.group==='cresta-alas')){
   const ang=(Math.atan2(t.y-RING.cy,t.x-RING.cx)*180/Math.PI+360)%360;
   expect(ang).toBeGreaterThan(115);expect(ang).toBeLessThan(215);
  }
 });
 it('plumas + anillo + cola cubren el círculo: ≥ 11 de 12 sectores de 30° tienen elementos',()=>{
  const bins=new Set<number>();
  const add=(x:number,y:number)=>bins.add(Math.floor(((Math.atan2(y-RING.cy,x-RING.cx)*180/Math.PI+360)%360)/30));
  meta.tips.forEach(t=>add(t.x,t.y));meta.ringSamples.forEach(([x,y])=>add(x-0.62,y));
  expect(bins.size).toBeGreaterThanOrEqual(11);
 });
 it('la cola cruza la base y cierra la Q abajo a la DERECHA (trazo de la Q)',()=>{
  expect(meta.tailTips.length).toBe(3);
  for(const [x,y] of meta.tailTips){expect(x).toBeGreaterThan(3.8);expect(y).toBeLessThan(-2.0);expect(y).toBeGreaterThan(-3.3);}
  const longest=Math.max(...meta.tips.filter(t=>t.group==='cola').map(t=>t.length));
  expect(longest).toBeGreaterThan(5.5);
 });
 it('NO hay cola vertical de cintas ni plumas verticales aisladas',()=>{
  for(const t of meta.tips){
   const [w,h]=t.bbox;
   expect(h>3&&w<1.2,`${t.group} vertical (${w.toFixed(1)}×${h.toFixed(1)})`).toBe(false);
  }
 });
 it('la cabeza mira a la derecha con pico curvo hacia abajo',()=>{
  const [hx,hy]=meta.head.center,[bx,by]=meta.head.beakTip;
  expect(bx).toBeGreaterThan(hx+0.4);expect(by).toBeLessThan(hy);
  const head=part('cabeza').geometry;head.computeBoundingBox();
  expect(head.boundingBox!.max.x).toBeGreaterThan(1.3);
 });
 it('anillo detrás (z<0) y a la derecha; globo tras el pecho',()=>{
  const ring=part('anillo').geometry;ring.computeBoundingBox();
  expect(ring.boundingBox!.max.z).toBeLessThan(0);expect(ring.boundingBox!.max.x).toBeGreaterThan(3.0);
  const g=part('globo').geometry;g.computeBoundingBox();expect(g.boundingBox!.min.x).toBeCloseTo(-g.boundingBox!.max.x,1); // centrado: la escena lo coloca a la derecha, detrás del pecho
 });
 it('es determinista y se construye en < 700 ms',()=>{
  const t0=performance.now();const again=buildQ();const ms=performance.now()-t0;
  expect(ms).toBeLessThan(700);
  const sum=(ps:typeof parts)=>ps.reduce((s,p)=>s+(p.geometry.getAttribute('position').array as Float32Array).reduce((a,b)=>a+b,0),0);
  expect(sum(again.parts)).toBeCloseTo(sum(parts),2);
 });
});

describe('muestreo para partículas',()=>{
 it('puntos sobre la silueta real, deterministas, con acentos dorados y rápido',()=>{
  const t0=performance.now();const a=sampleSurface(parts,2600),b=sampleSurface(parts,2600);const ms=performance.now()-t0;
  expect(Array.from(a.points.slice(0,30))).toEqual(Array.from(b.points.slice(0,30)));
  const bb=bounds(parts);bb.expandByScalar(0.05);
  for(let i=0;i<a.points.length;i+=3)expect(bb.containsPoint(new THREE.Vector3(a.points[i],a.points[i+1],a.points[i+2]))).toBe(true);
  expect(a.gold.some(x=>x===1)&&a.gold.some(x=>x===0)).toBe(true);
  expect(ms).toBeLessThan(400);
 });
});





