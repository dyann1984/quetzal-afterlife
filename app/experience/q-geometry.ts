/**
 * Emblema holográfico: un quetzal cuya silueta forma una «Q» circular de plumas curvas.
 * Geometría procedural pura (three, sin React ni WebGL): curvas Bézier cúbicas 3D, plumas con espesor visual
 * (dos capas con nervadura elevada) y solidos barridos para cabeza, pico y cuello.
 *
 * Composición (unidades de escena; x derecha, y arriba, z hacia la cámara). Referencia: emblema QUETZAL AFTERLIFE.
 *   - Cabeza estilizada a la derecha, mirando a la derecha, con pico curvo.
 *   - Cresta y alas: plumas largas que nacen en la cabeza/cuello y barren hacia la IZQUIERDA formando la mitad superior del círculo.
 *   - Plumas laterales y del vientre descienden y cierran la mitad inferior izquierda.
 *   - Pecho: plumas curvas descendentes.
 *   - Cola: 3 plumas largas que cruzan la base y terminan a la derecha (el trazo de la Q).
 *   - Anillo holográfico a la derecha y detrás; globo de malla tras el pecho.
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {mulberry32} from '../../lib/experience';

export const RING={cx:0.1,cy:0.1,rx:3.45,ry:2.85};
export const HEAD_CENTER:[number,number]=[0.8,1.1];
export const TARGET_VIEW:[number,number,number]=[0.5,-0.55,0];

export type QKind='pluma'|'solido'|'anillo'|'globo';
export interface QPart{id:string;kind:QKind;geometry:THREE.BufferGeometry}
export interface QMeta{
 tips:Array<{x:number;y:number;group:string;length:number;bbox:[number,number]}>;
 ringSamples:Array<[number,number]>;
 head:{center:[number,number];beakTip:[number,number]};
 tailTips:Array<[number,number]>;
 featherCount:number;
}

const V=(x:number,y:number,z=0)=>new THREE.Vector3(x,y,z);
const rad=(d:number)=>d*Math.PI/180;
const onRing=(deg:number,rho:number):[number,number]=>[RING.cx+Math.cos(rad(deg))*RING.rx*rho,RING.cy+Math.sin(rad(deg))*RING.ry*rho];
const leaf=(w:number)=>(t:number)=>w*Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(t,0.72))),0.8);

interface Attrs{pos:number[];aU:number[];aT:number[];aPhase:number[];aTone:number[];aLayer:number[];idx:number[]}
const blank=():Attrs=>({pos:[],aU:[],aT:[],aPhase:[],aTone:[],aLayer:[],idx:[]});
function toGeometry(a:Attrs){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(a.pos,3));
 g.setAttribute('aU',new THREE.Float32BufferAttribute(a.aU,1));
 g.setAttribute('aT',new THREE.Float32BufferAttribute(a.aT,1));
 g.setAttribute('aPhase',new THREE.Float32BufferAttribute(a.aPhase,1));
 g.setAttribute('aTone',new THREE.Float32BufferAttribute(a.aTone,1));
 g.setAttribute('aLayer',new THREE.Float32BufferAttribute(a.aLayer,1));
 g.setIndex(a.idx);g.computeVertexNormals();return g;
}

interface RibbonOpts{phase:number;tone:number;cup?:number;segs?:number;thick?:number;width:(t:number)=>number}
/** Pluma: superficie con nervadura elevada (5 columnas) y una segunda capa desplazada para dar espesor. */
function ribbon(curve:THREE.Curve<THREE.Vector3>,o:RibbonOpts){
 const segs=o.segs??26,cols=5,cup=o.cup??0.32,thick=o.thick??0.06,a=blank(),hint=V(0,0,1);
 for(let layer=0;layer<2;layer++){
  const base=a.pos.length/3;
  for(let i=0;i<=segs;i++){
   const t=i/segs,p=curve.getPointAt(t),T=curve.getTangentAt(t);
   let side=T.clone().cross(hint);if(side.lengthSq()<1e-8)side=V(1,0,0);side.normalize();
   const w=o.width(t);
   for(let j=0;j<cols;j++){
    const u=j/(cols-1),ridge=1-Math.abs(2*u-1);
    const v=p.clone().addScaledVector(side,(u-0.5)*w).addScaledVector(hint,cup*w*ridge*(layer?0.55:1)-layer*thick);
    a.pos.push(v.x,v.y,v.z);a.aU.push(u);a.aT.push(t);a.aPhase.push(o.phase);a.aTone.push(o.tone);a.aLayer.push(layer);
   }
  }
  for(let i=0;i<segs;i++)for(let j=0;j<cols-1;j++){
   const p0=base+i*cols+j,p1=p0+1,p2=p0+cols,p3=p2+1;a.idx.push(p0,p2,p1,p1,p2,p3);
  }
 }
 return toGeometry(a);
}

/** Barrido elíptico de radio variable (cuello, cabeza, pico, ojo). */
function sweep(points:Array<[number,number,number]>,radii:number[],o:{segs?:number;radial?:number;squash?:number;tone?:number;phase?:number}){
 const segs=o.segs??22,radial=o.radial??16,squash=o.squash??0.85,a=blank();
 const curve=new THREE.CatmullRomCurve3(points.map(p=>V(p[0],p[1],p[2])),false,'centripetal');
 const fr=curve.computeFrenetFrames(segs,false);
 const rAt=(t:number)=>{const f=t*(radii.length-1),i=Math.min(radii.length-2,Math.floor(f));return radii[i]+(radii[i+1]-radii[i])*(f-i);};
 for(let i=0;i<=segs;i++){
  const t=i/segs,c=curve.getPointAt(t),r=rAt(t),N=fr.normals[i],B=fr.binormals[i];
  for(let j=0;j<radial;j++){
   const ang=(j/radial)*Math.PI*2,p=c.clone().addScaledVector(N,Math.cos(ang)*r).addScaledVector(B,Math.sin(ang)*r*squash);
   a.pos.push(p.x,p.y,p.z);a.aU.push(0.5);a.aT.push(t);a.aPhase.push(o.phase??0);a.aTone.push(o.tone??0);a.aLayer.push(0);
  }
 }
 for(let i=0;i<segs;i++)for(let j=0;j<radial;j++){
  const p0=i*radial+j,p1=i*radial+(j+1)%radial,p2=(i+1)*radial+j,p3=(i+1)*radial+(j+1)%radial;a.idx.push(p0,p2,p1,p1,p2,p3);
 }
 return toGeometry(a);
}
function sphere(r:number,c:[number,number,number],tone:number){
 const g=new THREE.SphereGeometry(r,14,10),n=g.getAttribute('position').count;g.deleteAttribute('uv');
 g.translate(...c);
 g.setAttribute('aU',new THREE.Float32BufferAttribute(new Array(n).fill(0.5),1));g.setAttribute('aT',new THREE.Float32BufferAttribute(new Array(n).fill(0),1));
 g.setAttribute('aPhase',new THREE.Float32BufferAttribute(new Array(n).fill(0),1));g.setAttribute('aTone',new THREE.Float32BufferAttribute(new Array(n).fill(tone),1));
 g.setAttribute('aLayer',new THREE.Float32BufferAttribute(new Array(n).fill(0),1));return g;
}

// ─── Plumas del emblema: medias lunas CONCÉNTRICAS que siguen el círculo (remolino), no un abanico ─────────
interface Whirl{group:string;a0:number;r0:number;a1:number;rho:number;w:number;z0:number;z1:number;tone:number;cup?:number}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const smooth=(x:number)=>{const t=Math.min(1,Math.max(0,x));return t*t*(3-2*t);};
/** Espiral: nace cerca del cuerpo (radio r0, ángulo a0) y se abre hasta el radio rho barriendo en sentido antihorario hasta a1. */
function whirlCurve(s:Whirl){
 const pts:THREE.Vector3[]=[];
 for(let i=0;i<=9;i++){
  const u=i/9,ang=rad(s.a0+(s.a1-s.a0)*Math.pow(u,0.9)),rr=s.r0+(s.rho-s.r0)*smooth(u/0.55);
  pts.push(V(RING.cx+Math.cos(ang)*RING.rx*rr,RING.cy+Math.sin(ang)*RING.ry*rr,lerp(s.z0,s.z1,u)*2.4+0.35*Math.sin(Math.PI*u)));
 }
 return new THREE.CatmullRomCurve3(pts,false,'centripetal');
}
function whirlSpecs():Whirl[]{
 const out:Whirl[]=[];
 // Mitad superior: crestas y alas que nacen en la cabeza y barren a la izquierda (las exteriores, más largas)
 for(let k=0;k<8;k++){const f=k/7;out.push({group:'cresta-alas',a0:72+(k%2)*5,r0:0.37,a1:lerp(204,130,f),rho:lerp(1.0,0.56,f),w:lerp(0.66,0.44,f),z0:lerp(-0.05,0.5,f),z1:lerp(-0.3,0.35,f),tone:k===0?0.95:k===7?0:0});}
 // Cresta: plumas largas y arqueadas que suben desde la cabeza hacia arriba y se curvan a la izquierda
 for(let k=0;k<5;k++){const f=k/4;out.push({group:'cresta',a0:66+k*3,r0:0.4,a1:lerp(122,80,f),rho:lerp(1.02,0.8,f),w:lerp(0.36,0.3,f),z0:0.5,z1:0.3-f*0.2,tone:k%2===0?0.9:0.3});}
 // Alas medias: del cuello hacia la izquierda y abajo
 for(let k=0;k<6;k++){const f=k/5;out.push({group:'alas-medias',a0:lerp(92,126,f),r0:0.33,a1:lerp(252,208,f),rho:lerp(0.94,0.62,f),w:lerp(0.62,0.44,f),z0:lerp(-0.2,0.3,f),z1:lerp(-0.4,0.15,f),tone:k===0?0.7:0});}
 // Barrido inferior: cierran la parte baja de la Q hasta el arranque de la cola
 for(let k=0;k<5;k++){const f=k/4;out.push({group:'barrido-inferior',a0:lerp(188,216,f),r0:0.3,a1:lerp(302,262,f),rho:lerp(0.98,0.74,f),w:lerp(0.52,0.4,f),z0:lerp(-0.1,0.2,f),z1:lerp(-0.25,0.1,f),tone:k===0?0.8:0});}
 // Pecho: plumas curvas descendentes que cubren el cuello
 for(let k=0;k<12;k++){const f=k/11;out.push({group:'pecho',a0:lerp(40,105,f),r0:0.2,a1:lerp(246,190,f),rho:lerp(0.6,0.3,f),w:lerp(0.36,0.28,f),z0:0.6+f*0.1,z1:0.45,tone:k%5===0?0.7:0,cup:0.4});}
 return out;
}
function ringBand(){
 const pts:THREE.Vector3[]=[],samples:Array<[number,number]>=[];
 for(let i=0;i<=72;i++){const deg=lerp(128,-62,i/72),p=onRing(deg,0.78);p[0]+=0.62;p[1]+=0.0;pts.push(V(p[0],p[1],-1.0));samples.push([p[0],p[1]]);}
 const curve=new THREE.CatmullRomCurve3(pts,false,'centripetal');
 const band=(wd:number,tone:number,off:number,phase:number)=>{
  const c=off===0?curve:new THREE.CatmullRomCurve3(pts.map(p=>{const dx=p.x-(RING.cx+0.62),dy=p.y-RING.cy,l=Math.hypot(dx,dy)||1;return V(p.x+dx/l*off,p.y+dy/l*off,p.z);}),false,'centripetal');
  return ribbon(c,{phase,tone,cup:0,thick:0.01,segs:90,width:()=>wd});
 };
 return {geometry:mergeGeometries([band(0.46,0,0,0),band(0.05,0,-0.32,1),band(0.05,0.7,0.34,2)])!,samples};
}

export function buildQ():{parts:QPart[];meta:QMeta}{
 const meta:QMeta={tips:[],ringSamples:[],head:{center:HEAD_CENTER,beakTip:[1.56,0.66]},tailTips:[],featherCount:0};
 const feathers:THREE.BufferGeometry[]=[];
 whirlSpecs().forEach((s,i)=>{
  const curve=whirlCurve(s),tip=curve.getPoint(1),len=curve.getLength();
  feathers.push(ribbon(curve,{phase:i*0.77,tone:s.tone,cup:s.cup,width:leaf(s.w)}));
  const bb=new THREE.Box3().setFromPoints(curve.getPoints(24)),sz=bb.getSize(V(0,0));
  meta.tips.push({x:tip.x,y:tip.y,group:s.group,length:len,bbox:[sz.x,sz.y]});
 }); // Cabeza emplumada: plumas cortas y curvas alrededor del orbe de cristal (contorno luminoso, sin sólidos opacos)
 for(let k=0;k<7;k++){
  const phi0=105+k*24,r=0.5+0.2*((k*7)%3)/2,pts:THREE.Vector3[]=[];
  for(let i=0;i<=6;i++){const u=i/6,ang=rad(phi0+95*u),rr=r*(1+0.18*Math.sin(Math.PI*u));pts.push(V(HEAD_CENTER[0]+0.18+Math.cos(ang)*rr*1.05,HEAD_CENTER[1]+0.02+Math.sin(ang)*rr*0.95,0.46+0.05*Math.sin(u*3)));}
  const c=new THREE.CatmullRomCurve3(pts,false,'centripetal');
  feathers.push(ribbon(c,{phase:40+k*0.9,tone:k%5===0?0.9:0,cup:0.35,segs:16,width:leaf(0.2+0.04*(k%3))}));
  const bb=new THREE.Box3().setFromPoints(c.getPoints(10)),sz=bb.getSize(V(0,0)),tp=c.getPoint(1);
  meta.tips.push({x:tp.x,y:tp.y,group:'cabeza-plumas',length:c.getLength(),bbox:[sz.x,sz.y]});
 } // Cola: 3 plumas largas que cruzan la base y terminan a la derecha (trazo de la Q)
 const tails:THREE.BufferGeometry[]=[];
 const T:Array<{p:[number,number,number][];w:number;tone:number}>=[
  {p:[[-0.15,-1.6,0.3],[0.7,-3.55,0.1],[2.9,-3.5,-0.05],[4.45,-2.5,0.1]],w:0.5,tone:0.9},
  {p:[[0.05,-1.4,0.15],[1.0,-3.15,0.0],[2.7,-3.05,-0.15],[4.05,-2.2,-0.05]],w:0.4,tone:0.5},
  {p:[[-0.35,-1.7,0.0],[0.3,-3.9,-0.2],[2.6,-3.9,-0.3],[4.2,-2.9,-0.15]],w:0.34,tone:0.2},
 ];
 T.forEach((t,i)=>{
  const c=new THREE.CubicBezierCurve3(V(...t.p[0]),V(...t.p[1]),V(...t.p[2]),V(...t.p[3]));
  tails.push(ribbon(c,{phase:20+i*1.3,tone:t.tone,cup:0.3,segs:44,width:leaf(t.w)}));
  const e=c.getPoint(1);meta.tailTips.push([e.x,e.y]);meta.tips.push({x:e.x,y:e.y,group:'cola',length:c.getLength(),bbox:[Math.abs(t.p[3][0]-t.p[0][0]),Math.abs(t.p[3][1]-t.p[0][1])]});
 });
 meta.featherCount=feathers.length+tails.length;

 const ell=(rx:number,ry:number,rz:number,c:[number,number,number],tone:number)=>{const g=sphere(1,[0,0,0],tone);g.scale(rx,ry,rz);g.translate(...c);return g;};
 const head=mergeGeometries([
  ell(0.7,0.64,0.55,[0.78,1.12,0],0),                                                   // cabeza redondeada
  sweep([[1.1,1.14,0],[1.34,1.1,0],[1.48,0.9,0],[meta.head.beakTip[0],meta.head.beakTip[1],0]],[0.22,0.17,0.09,0.012],{squash:0.95,segs:16,radial:12,tone:1}), // pico curvo
  sphere(0.085,[0.98,1.26,0.4],3),sphere(0.085,[0.98,1.26,-0.4],3),                     // ojos luminosos
 ])!; const ring=ringBand();meta.ringSamples=ring.samples;
 const globe=new THREE.WireframeGeometry(new THREE.SphereGeometry(1.02,22,14));/* centrado en el origen: la escena lo coloca y lo gira sobre su propio eje */

 const parts:QPart[]=[
  {id:'plumas',kind:'pluma',geometry:mergeGeometries(feathers)!},
  {id:'cola',kind:'pluma',geometry:mergeGeometries(tails)!},
  {id:'cabeza',kind:'solido',geometry:head},
  {id:'anillo',kind:'anillo',geometry:ring.geometry},
  {id:'globo',kind:'globo',geometry:globe},
 ];
 feathers.forEach(g=>g.dispose());tails.forEach(g=>g.dispose());
 return {parts,meta};
}

export const triangleCount=(parts:QPart[])=>parts.reduce((n,p)=>n+(p.geometry.index?p.geometry.index.count/3:0),0);
export function bounds(parts:QPart[]){const b=new THREE.Box3();for(const p of parts){p.geometry.computeBoundingBox();b.union(p.geometry.boundingBox!);}return b;}

/** Muestrea puntos sobre las superficies (ponderado por área) para el aura de partículas. */
export function sampleSurface(parts:QPart[],count:number,seed=1998){
 const rnd=mulberry32(seed),tris:{a:THREE.Vector3;b:THREE.Vector3;c:THREE.Vector3;gold:number}[]=[],cum:number[]=[];let acc=0;
 for(const p of parts){
  if(p.kind==='globo'||!p.geometry.index)continue;
  const pos=p.geometry.getAttribute('position'),tone=p.geometry.getAttribute('aTone'),layer=p.geometry.getAttribute('aLayer'),idx=p.geometry.index;
  for(let i=0;i<idx.count;i+=3){
   const i0=idx.getX(i),i1=idx.getX(i+1),i2=idx.getX(i+2);if(layer.getX(i0)>0.5)continue;
   const a=V(pos.getX(i0),pos.getY(i0),pos.getZ(i0)),b=V(pos.getX(i1),pos.getY(i1),pos.getZ(i1)),c=V(pos.getX(i2),pos.getY(i2),pos.getZ(i2));
   const area=b.clone().sub(a).cross(c.clone().sub(a)).length()/2;if(area<=1e-9)continue;
   acc+=area;cum.push(acc);tris.push({a,b,c,gold:tone.getX(i0)>0.5&&tone.getX(i0)<2.5?1:0});
  }
 }
 const points=new Float32Array(count*3),gold=new Uint8Array(count);
 for(let k=0;k<count;k++){
  const r=rnd()*acc;let lo=0,hi=cum.length-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<r)lo=m+1;else hi=m;}
  const t=tris[lo];let u=rnd(),v=rnd();if(u+v>1){u=1-u;v=1-v;}
  const p=t.a.clone().addScaledVector(t.b.clone().sub(t.a),u).addScaledVector(t.c.clone().sub(t.a),v);
  points[k*3]=p.x;points[k*3+1]=p.y;points[k*3+2]=p.z;gold[k]=t.gold||(rnd()<0.06?1:0);
 }
 return {points,gold};
}










