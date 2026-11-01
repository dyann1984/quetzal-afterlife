/**
 * Holograma 2.5D por capas: la imagen oficial del quetzal (public/hologram/*, generada por tools/hologram/build-layers.ps1)
 * se muestra como dos placas aditivas con profundidad (mapa de relieve), curvatura y balanceo en shader.
 * NO es un modelo 3D completo: es una composición por capas con paralaje, válida para giros limitados (~±15°).
 *
 * Mapeo de la imagen al mundo: 1 unidad = 80 px de la referencia; el origen coincide con el de q-glb (anillo ≈ (0.2, 0.55)).
 */
import * as THREE from 'three';

export const PLATE_PX={w:810,h:648,unit:80};
export const PLATE_SIZE:[number,number]=[PLATE_PX.w/PLATE_PX.unit,PLATE_PX.h/PLATE_PX.unit];
/** Centro de la placa en coordenadas del mundo (recorte de la referencia: x 95..905, y 20..668). */
export const PLATE_CENTER:[number,number]=[-0.5,0.325];
/** Cabeza del ave en la referencia (px 535,215): de aquí parte la materialización. */
export const PLATE_HEAD:[number,number]=[-0.06,1.94];
export const AMP={ave:1.6,resto:1.2,restoBase:-0.7,bend:0.011};
export const PLATE_URL={ave:'/hologram/ave.jpg',resto:'/hologram/resto.jpg',depth:'/hologram/depth.png',aura:'/hologram/aura.json'};

/** z de un punto de la placa: relieve + curvatura cilíndrica (los bordes se alejan). Debe coincidir con el vertex shader. */
export function plateZ(layer:0|1,depth01:number,xLocal:number){
 const base=layer===0?0:AMP.restoBase,amp=layer===0?AMP.ave:AMP.resto;
 return base+(depth01-0.5)*amp-AMP.bend*xLocal*xLocal;
}

export interface AuraData{points:Float32Array;gold:Uint8Array}
/** Convierte los puntos muestreados sobre la imagen (px del recorte + profundidad 0..255) a coordenadas del mundo. */
export function auraFromJson(j:{w:number;h:number;n1:number;n2:number;p:number[]}):AuraData{
 const n=j.n1+j.n2,points=new Float32Array(n*3),gold=new Uint8Array(n);
 let seed=1998;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<n;i++){
  const px=j.p[i*3],py=j.p[i*3+1],d=j.p[i*3+2]/255,layer:0|1=i<j.n1?0:1;
  const xl=(px-j.w/2)/PLATE_PX.unit,yl=-(py-j.h/2)/PLATE_PX.unit;
  points[i*3]=PLATE_CENTER[0]+xl;points[i*3+1]=PLATE_CENTER[1]+yl;
  points[i*3+2]=plateZ(layer,d,xl)+(rnd()-0.5)*0.35;   // algo de volumen alrededor de la placa
 }
 return {points,gold};
}

export interface PlateTextures{ave:THREE.Texture;resto:THREE.Texture;depth:THREE.Texture}
export interface PlatesData{textures:PlateTextures;aura:AuraData}
export interface PlatesState{status:'idle'|'loading'|'ready'|'failed';data:PlatesData|null}
let state:PlatesState={status:'idle',data:null};
const subs=new Set<()=>void>();
const set=(s:PlatesState)=>{state=s;subs.forEach(f=>f());};
export const getPlatesState=()=>state;
export const subscribePlates=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};

export function loadPlates(){
 if(state.status!=='idle')return;
 set({status:'loading',data:null});
 const loader=new THREE.TextureLoader();
 const raw=(t:THREE.Texture)=>{t.colorSpace=THREE.NoColorSpace;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;return t;};
 Promise.all([loader.loadAsync(PLATE_URL.ave),loader.loadAsync(PLATE_URL.resto),loader.loadAsync(PLATE_URL.depth),fetch(PLATE_URL.aura).then(r=>{if(!r.ok)throw new Error('aura');return r.json();})])
  .then(([ave,resto,depth,aura])=>{
   raw(ave);raw(resto);depth.colorSpace=THREE.NoColorSpace;depth.minFilter=THREE.LinearFilter;depth.generateMipmaps=false;depth.needsUpdate=true;
   set({status:'ready',data:{textures:{ave,resto,depth},aura:auraFromJson(aura)}});
  })
  .catch(()=>set({status:'failed',data:null}));
}
