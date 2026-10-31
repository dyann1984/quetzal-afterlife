/**
 * Geometría 3D del quetzal (procedural, sin assets externos).
 * Funciones puras sobre three: no tocan React, WebGL ni el DOM, por lo que se prueban con vitest.
 *
 * Sistema de coordenadas: el ave mira hacia +x, y es arriba, z es la profundidad (ala cercana = +z).
 * Pose: posada en una rama, cabeza erguida con pico curvo, cresta emplumada, pecho volumétrico,
 * alas semiabiertas barridas hacia atrás y 5 plumas largas de la cola (tectrices) con curvas distintas.
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {mulberry32} from '../../lib/experience';

export const PALETTE={
 deep:new THREE.Color('#0b4bd6'),blue:new THREE.Color('#1f8fff'),cyan:new THREE.Color('#6fdcff'),
 gold:new THREE.Color('#dcb35f'),goldDeep:new THREE.Color('#9a7424'),navy:new THREE.Color('#071f3d'),white:new THREE.Color('#eaf8ff'),
};
export type MaterialKind='metal'|'gold'|'dark';
export interface Wave{amp:number;freq:number;k:number;dir:[number,number,number]}
export interface BirdPart{
 id:string;geometry:THREE.BufferGeometry;material:MaterialKind;wave:Wave|null;
 /** Eje de giro para el aleteo (hombro) y signo del lado. */
 pivot?:[number,number,number];side?:1|-1;
}

const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z);
const smooth=(a:number,b:number,x:number)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:THREE.Color,b:THREE.Color,t:number)=>a.clone().lerp(b,Math.min(1,Math.max(0,t)));

/** Atributos comunes (necesarios para fusionar): position, normal, color, aT (0..1 a lo largo), aPhase. */
function finish(pos:number[],col:number[],aT:number[],aPhase:number[],idx:number[]){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
 g.setAttribute('aT',new THREE.Float32BufferAttribute(aT,1));
 g.setAttribute('aPhase',new THREE.Float32BufferAttribute(aPhase,1));
 g.setIndex(idx);g.computeVertexNormals();return g;
}

interface SweepOpts{segs?:number;radial?:number;squash?:number;color:(p:THREE.Vector3,radial:THREE.Vector3,t:number)=>THREE.Color;phase?:number}
/** Barrido de una sección elíptica a lo largo de una curva con radio variable (cuerpo, pico, patas). */
export function sweep(points:THREE.Vector3[],radii:number[],o:SweepOpts){
 const segs=o.segs??36,radial=o.radial??18,squash=o.squash??0.85;
 const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
 const fr=curve.computeFrenetFrames(segs,false);
 const pos:number[]=[],col:number[]=[],aT:number[]=[],aP:number[]=[],idx:number[]=[];
 const rAt=(t:number)=>{const f=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(f));return radii[i]+(radii[i+1]-radii[i])*(f-i);};
 for(let i=0;i<=segs;i++){
  const t=i/segs,c=curve.getPointAt(t),r=rAt(t),N=fr.normals[i],B=fr.binormals[i];
  for(let j=0;j<radial;j++){
   const a=(j/radial)*Math.PI*2;
   const dir=N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B,Math.sin(a)*squash);
   const p=c.clone().addScaledVector(dir,r);
   const rad=p.clone().sub(c).normalize();
   const cc=o.color(p,rad,t);
   pos.push(p.x,p.y,p.z);col.push(cc.r,cc.g,cc.b);aT.push(t);aP.push(o.phase??0);
  }
 }
 for(let i=0;i<segs;i++)for(let j=0;j<radial;j++){
  const a=i*radial+j,b=i*radial+(j+1)%radial,c2=(i+1)*radial+j,d=(i+1)*radial+(j+1)%radial;
  idx.push(a,c2,b,b,c2,d);
 }
 // tapas
 for(const [end,i0] of [[0,0],[1,segs]] as const){
  const c=curve.getPointAt(end),base=pos.length/3,cc=o.color(c,V(end?1:-1,0,0),end);
  pos.push(c.x,c.y,c.z);col.push(cc.r,cc.g,cc.b);aT.push(end);aP.push(o.phase??0);
  for(let j=0;j<radial;j++){const a=i0*radial+j,b=i0*radial+(j+1)%radial;if(end)idx.push(base,a,b);else idx.push(base,b,a);}
 }
 return finish(pos,col,aT,aP,idx);
}

interface RibbonOpts{pts:THREE.Vector3[];width:(t:number)=>number;hint:THREE.Vector3;segs?:number;cup?:number;color:(t:number,edge:number)=>THREE.Color;phase?:number}
/** Pluma: cinta con ancho variable, nervadura central elevada y dos caras. */
export function ribbon(o:RibbonOpts){
 const segs=o.segs??14,cup=o.cup??0.25;
 const curve=new THREE.CatmullRomCurve3(o.pts,false,'centripetal');
 const pos:number[]=[],col:number[]=[],aT:number[]=[],aP:number[]=[],idx:number[]=[];
 const hint=o.hint.clone().normalize();
 for(let i=0;i<=segs;i++){
  const t=i/segs,p=curve.getPointAt(t),T=curve.getTangentAt(t);
  let side=T.clone().cross(hint);if(side.lengthSq()<1e-6)side=V(1,0,0).cross(T);side.normalize();
  const w=Math.max(o.width(t),0.0005);
  const rows=[[p.clone().addScaledVector(side,-w/2),1],[p.clone().addScaledVector(hint,cup*w*0.35),0],[p.clone().addScaledVector(side,w/2),1]] as const;
  for(const [v,edge] of rows){const c=o.color(t,edge);pos.push(v.x,v.y,v.z);col.push(c.r,c.g,c.b);aT.push(t);aP.push(o.phase??0);}
 }
 for(let i=0;i<segs;i++){const a=i*3,b=(i+1)*3;idx.push(a,b,a+1,a+1,b,b+1,a+1,b+1,a+2,a+2,b+1,b+2);}
 return finish(pos,col,aT,aP,idx);
}

/** Convierte una geometría de three (esfera, etc.) al conjunto de atributos común. */
function decorate(g:THREE.BufferGeometry,color:(p:THREE.Vector3)=>THREE.Color,phase=0){
 const n=g.getAttribute('position').count,col:number[]=[],aT:number[]=[],aP:number[]=[];
 const p=new THREE.Vector3();
 for(let i=0;i<n;i++){p.fromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute,i);const c=color(p);col.push(c.r,c.g,c.b);aT.push(0);aP.push(phase);}
 g.deleteAttribute('uv');
 g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
 g.setAttribute('aT',new THREE.Float32BufferAttribute(aT,1));
 g.setAttribute('aPhase',new THREE.Float32BufferAttribute(aP,1));
 return g;
}
function ellipsoid(r:number,s:[number,number,number],c:[number,number,number],color:(p:THREE.Vector3)=>THREE.Color){
 const g=new THREE.SphereGeometry(r,28,20);g.scale(...s);g.translate(...c);return decorate(g,color);
}

// ─── Plumas ──────────────────────────────────────────────────────────────────
const leaf=(W:number)=>(t:number)=>W*Math.pow(Math.sin(Math.PI*Math.pow(Math.min(1,t*0.96+0.04),0.78)),0.8)*(0.35+0.65*Math.min(1,t*3));
const racket=(W:number)=>(t:number)=>{const e=0.9;return t<e?W*(0.55+0.45*Math.sin(Math.PI*Math.min(1,t/0.55)*0.5+0.1)):W*Math.sqrt(Math.max(0,1-Math.pow((t-e)/(1-e),2)));};

function featherPts(origin:THREE.Vector3,dir:THREE.Vector3,len:number,bend:THREE.Vector3){
 return [0,0.33,0.66,1].map(s=>origin.clone().addScaledVector(dir,len*s).addScaledVector(bend,s*s));
}
function featherColor(gold:number,deep:THREE.Color=PALETTE.deep){
 return (t:number,edge:number)=>{
  let c=mix(deep,PALETTE.cyan,Math.pow(t,0.9)*0.55);
  c=mix(c,PALETTE.blue,0.25*(1-edge));
  if(gold>0)c=mix(c,PALETTE.gold,gold*smooth(0.3,0.95,t));
  return mix(c,PALETTE.white,edge*0.05*t);
 };
}

function buildWing(side:1|-1):BirdPart{
 const S=V(0.08,0.2,0.28*side),Wr=S.clone().add(V(-0.35,0.55,0.5*side));
 const geos:THREE.BufferGeometry[]=[];
 const lean=0.22*side,hint=V(0,0,side);
 // Primarias: abanico desde la muñeca, las exteriores con punta dorada
 for(let i=0;i<9;i++){
  const th=THREE.MathUtils.degToRad(186+i*7.2),d=V(Math.cos(th),Math.sin(th),lean).normalize();
  const len=1.95-i*0.06;
  geos.push(ribbon({pts:featherPts(Wr,d,len,V(0,-0.18-0.02*i,0.1*side)),width:leaf(0.36),hint,segs:14,cup:0.3,phase:i*0.7,color:featherColor(i<5?0.95:0.55)}));
 }
 // Secundarias: a lo largo del brazo, hacia atrás y abajo
 for(let i=0;i<8;i++){
  const o=Wr.clone().lerp(S,(i+1)/9),th=THREE.MathUtils.degToRad(214+i*4.2),d=V(Math.cos(th),Math.sin(th),lean*0.8).normalize();
  geos.push(ribbon({pts:featherPts(o,d,1.65-i*0.07,V(0,-0.12,0.06*side)),width:leaf(0.4),hint,segs:12,cup:0.3,phase:2+i*0.6,color:featherColor(i<3?0.6:0.3,PALETTE.deep)}));
 }
 // Coberteras: tres filas cortas y anchas (relleno con volumen)
 [[0.7,0.34,8,0.55],[0.55,0.3,7,0.35],[0.42,0.26,5,0.2]].forEach(([len,w,n,u0],row)=>{
  for(let i=0;i<n;i++){
   const o=S.clone().lerp(Wr,0.15+(i/(n-1))*0.8).add(V(0.02*row,0.07*(row+1)-0.04,0.03*side*row));
   const th=THREE.MathUtils.degToRad(212+(i/(n-1))*24+row*6),d=V(Math.cos(th),Math.sin(th),lean*0.6).normalize();
   geos.push(ribbon({pts:featherPts(o,d,len,V(0,-0.06,0.04*side)),width:leaf(w),hint,segs:8,cup:0.35,phase:4+i*0.5+row,color:featherColor(row===0?0.6:row===1?0.3:0.12,row===2?PALETTE.blue:PALETTE.deep)}));
   void u0;
  }
 });
 const g=mergeGeometries(geos)!;g.translate(-S.x,-S.y,-S.z);
 geos.forEach(x=>x.dispose());
 return {id:side>0?'ala-cercana':'ala-lejana',geometry:g,material:'metal',wave:{amp:0.05,freq:1.7,k:2.2,dir:[0.0,0.45,0.2]},pivot:[S.x,S.y,S.z],side};
}

function buildTail():BirdPart{
 const geos:THREE.BufferGeometry[]=[];
 const tb=V(-0.98,-0.72,0);
 // Cinco plumas largas con trayectorias, anchos y matices distintos
 const strands:Array<{pts:number[][];w:number;hint:[number,number,number];gold:number;deep:THREE.Color}>=[
  {pts:[[-0.98,-0.72,0],[-1.35,-1.9,0.15],[-1.0,-3.2,0.3],[-1.35,-4.5,0.15],[-1.95,-5.7,-0.1]],w:0.27,hint:[0,0,1],gold:0.9,deep:PALETTE.deep},
  {pts:[[-0.98,-0.72,0.08],[-1.6,-1.7,0.4],[-1.9,-2.9,0.7],[-1.5,-4.1,0.8],[-1.2,-5.2,0.6]],w:0.23,hint:[0.6,0,0.8],gold:0.9,deep:PALETTE.blue},
  {pts:[[-0.98,-0.72,-0.08],[-1.5,-1.8,-0.35],[-1.75,-3.1,-0.7],[-2.4,-4.2,-0.8],[-3.1,-5.1,-0.6]],w:0.23,hint:[-0.6,0,0.8],gold:0.6,deep:PALETTE.blue},
  {pts:[[-0.95,-0.7,0.05],[-1.15,-1.5,0.3],[-0.7,-2.6,0.45],[-0.4,-3.6,0.35],[-0.2,-4.4,0.1]],w:0.19,hint:[0.9,0,0.4],gold:0.3,deep:PALETTE.deep},
  {pts:[[-0.95,-0.7,-0.05],[-1.2,-1.5,-0.3],[-1.55,-2.5,-0.5],[-1.2,-3.5,-0.45],[-0.85,-4.2,-0.2]],w:0.19,hint:[-0.9,0,0.4],gold:0.3,deep:PALETTE.deep},
 ];
 strands.forEach((s,i)=>geos.push(ribbon({pts:s.pts.map(p=>V(p[0],p[1],p[2])),width:racket(s.w),hint:V(...s.hint),segs:44,cup:0.3,phase:i*1.3,color:featherColor(s.gold,s.deep)})));
 // Abanico de plumas cortas bajo la base de la cola
 for(let i=0;i<6;i++){
  const th=THREE.MathUtils.degToRad(238+i*11),d=V(Math.cos(th),Math.sin(th),(i-2.5)*0.05).normalize();
  geos.push(ribbon({pts:featherPts(tb,d,2.0-Math.abs(i-2.5)*0.12,V(-0.12,0,0.04*(i-2.5))),width:leaf(0.2),hint:V(0,0,1),segs:12,cup:0.3,phase:7+i*0.5,color:featherColor(0.7,PALETTE.deep)}));
 }
 const g=mergeGeometries(geos)!;geos.forEach(x=>x.dispose());
 return {id:'cola',geometry:g,material:'metal',wave:{amp:0.34,freq:0.9,k:2.6,dir:[0.35,0,1]}};
}

function buildCrest():BirdPart{
 const geos:THREE.BufferGeometry[]=[];
 const o=V(0.3,1.26,0);
 for(let i=0;i<8;i++){
  const th=THREE.MathUtils.degToRad(35+i*14),zz=((i%4)-1.5)*0.07,d=V(Math.cos(th),Math.sin(th),zz).normalize();
  geos.push(ribbon({pts:featherPts(o.clone().add(V(0,0,zz*0.5)),d,0.5+0.07*Math.sin(i*0.8),V(-0.1,-0.05,zz*0.6)),width:leaf(0.15),hint:V(0,0,1),segs:9,cup:0.3,phase:i*0.6,color:featherColor(0.95,PALETTE.blue)}));
 }
 const g=mergeGeometries(geos)!;geos.forEach(x=>x.dispose());
 return {id:'cresta',geometry:g,material:'metal',wave:{amp:0.07,freq:1.6,k:2,dir:[-0.3,0.1,1]}};
}

export function buildQuetzal():BirdPart[]{
 // Cuerpo: pecho volumétrico que se estrecha hacia el cuello; vientre y pecho dorados
 const chest=(p:THREE.Vector3,radial:THREE.Vector3,t:number)=>{
  const front=smooth(0.05,0.95,radial.x)*smooth(0.15,0.4,t)*(1-smooth(0.72,0.9,t));
  const under=smooth(-0.1,-0.85,radial.y)*smooth(0.1,0.3,t)*(1-smooth(0.55,0.75,t));
  let c=mix(PALETTE.deep,PALETTE.blue,smooth(-0.8,0.9,radial.y)*0.7+0.15);
  c=mix(c,PALETTE.cyan,smooth(0.5,1,radial.y)*0.35);
  return mix(c,PALETTE.gold,Math.max(front,under)*0.85);
 };
 const body=sweep([V(-1.05,-0.8,0),V(-0.6,-0.5,0),V(-0.1,-0.1,0),V(0.22,0.38,0),V(0.33,0.78,0),V(0.4,1.0,0)],[0.07,0.36,0.52,0.36,0.27,0.2],{segs:44,radial:24,squash:0.8,color:chest});
 const head=ellipsoid(0.3,[1.1,1,0.9],[0.42,1.02,0],p=>mix(PALETTE.blue,PALETTE.cyan,smooth(0.9,1.3,p.y)*0.6));
 const legs=[1,-1].map(s=>sweep([V(0.0,-0.5,0.16*s),V(0.04,-0.75,0.16*s),V(0.1,-0.98,0.16*s)],[0.055,0.045,0.035],{segs:6,radial:8,squash:1,color:()=>PALETTE.goldDeep}));
 const bodyGeo=mergeGeometries([body,head,...legs])!;[body,head,...legs].forEach(g=>g.dispose());

 // Detalles dorados: pico curvo, aro y brillo de los ojos
 const beak=sweep([V(0.66,1.0,0),V(0.9,0.99,0),V(1.07,0.87,0)],[0.115,0.078,0.012],{segs:14,radial:12,squash:0.9,color:(p,r,t)=>mix(PALETTE.gold,PALETTE.goldDeep,t*0.7)});
 const eyes=[1,-1].flatMap(s=>[
  decorate(new THREE.SphereGeometry(0.05,12,10).translate(0.56,1.1,0.245*s),()=>PALETTE.white),
  decorate(new THREE.TorusGeometry(0.085,0.016,8,20).translate(0,0,0).rotateY(0).translate(0.56,1.1,0.235*s),()=>PALETTE.gold),
 ]);
 const goldGeo=mergeGeometries([beak,...eyes])!;[beak,...eyes].forEach(g=>g.dispose());

 // Rama
 const branch=sweep([V(-1.7,-1.02,0.05),V(0,-0.98,0),V(1.5,-0.9,-0.06)],[0.07,0.06,0.04],{segs:14,radial:10,squash:1,color:(p,r,t)=>mix(PALETTE.navy,PALETTE.goldDeep,0.25+0.2*Math.sin(t*14))});

 return [
  {id:'cuerpo',geometry:bodyGeo,material:'metal',wave:null},
  {id:'pico-ojos',geometry:goldGeo,material:'gold',wave:null},
  {id:'rama',geometry:branch,material:'dark',wave:null},
  buildCrest(),buildWing(1),buildWing(-1),buildTail(),
 ];
}

// ─── Utilidades de medición y muestreo ───────────────────────────────────────
export function bounds(parts:BirdPart[]){
 const b=new THREE.Box3();
 for(const p of parts){
  const g=p.geometry.clone();
  if(p.pivot)g.translate(p.pivot[0],p.pivot[1],p.pivot[2]);
  g.computeBoundingBox();b.union(g.boundingBox!);g.dispose();
 }
 return b;
}
export const triangleCount=(parts:BirdPart[])=>parts.reduce((n,p)=>n+(p.geometry.index?p.geometry.index.count/3:0),0);

/** Muestrea puntos sobre la superficie (ponderado por área) para el aura de partículas. Devuelve posiciones y la parte de origen. */
export function sampleSurface(parts:BirdPart[],count:number,seed=1998){
 const rnd=mulberry32(seed);
 const tris:{a:THREE.Vector3;b:THREE.Vector3;c:THREE.Vector3;part:number;area:number;col:THREE.Color}[]=[];
 let total=0;
 parts.forEach((p,pi)=>{
  const pos=p.geometry.getAttribute('position'),col=p.geometry.getAttribute('color'),idx=p.geometry.index!;
  const off=p.pivot?V(p.pivot[0],p.pivot[1],p.pivot[2]):V(0,0,0);
  for(let i=0;i<idx.count;i+=3){
   const a=V(pos.getX(idx.getX(i)),pos.getY(idx.getX(i)),pos.getZ(idx.getX(i))).add(off);
   const b=V(pos.getX(idx.getX(i+1)),pos.getY(idx.getX(i+1)),pos.getZ(idx.getX(i+1))).add(off);
   const c=V(pos.getX(idx.getX(i+2)),pos.getY(idx.getX(i+2)),pos.getZ(idx.getX(i+2))).add(off);
   const area=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;
   if(area<=1e-9)continue;
   total+=area;tris.push({a,b,c,part:pi,area,col:new THREE.Color(col.getX(idx.getX(i)),col.getY(idx.getX(i)),col.getZ(idx.getX(i)))});
  }
 });
 const cum:number[]=[];let acc=0;for(const t of tris){acc+=t.area;cum.push(acc);}
 const points=new Float32Array(count*3),partOf=new Uint8Array(count),gold=new Uint8Array(count);
 for(let k=0;k<count;k++){
  const r=rnd()*total;let lo=0,hi=cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<r)lo=m+1;else hi=m;}
  const t=tris[lo];let u=rnd(),v=rnd();if(u+v>1){u=1-u;v=1-v;}
  const p=t.a.clone().addScaledVector(t.b.clone().sub(t.a),u).addScaledVector(t.c.clone().sub(t.a),v);
  points[k*3]=p.x;points[k*3+1]=p.y;points[k*3+2]=p.z;partOf[k]=t.part;
  gold[k]=t.col.r>t.col.b?1:0;           // tonos cálidos → partícula dorada
 }
 void total;
 return {points,partOf,gold};
}



