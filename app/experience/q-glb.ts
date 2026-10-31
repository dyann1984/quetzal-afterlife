/**
 * Carga del modelo artístico del quetzal (GLB creado en Blender: tools/blender/build_quetzal.py).
 * Convierte cada parte con nombre a las mismas QPart/atributos que usa el sistema de datos
 * (aU,aT,aPhase,aTone,aLayer): así la disolución por registros perdidos, el tinte dorado, la materialización
 * desde la cabeza y el aura de partículas funcionan igual que con la geometría anterior.
 *
 * Codificación del GLB: UV = (u a lo ancho de la pluma, t a lo largo); u=-1 marca superficie sólida (cuerpo, anillo).
 * COLOR_1 (la capa 'Col' de Blender; COLOR_0 es un blanco de relleno) = (dorado en la punta, fase, t); G>0.95 marca el ojo.
 */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {QPart} from './q-geometry';

export const GLB_URL='/models/quetzal.glb';
/** Centro de la cabeza en coordenadas del modelo (la materialización avanza desde aquí). */
export const GLB_HEAD:[number,number]=[0.08,1.95];

const KIND:Record<string,QPart['kind']>={plumas_cresta:'pluma',plumas_alas:'pluma',cola:'pluma',cuerpo:'solido',cabeza:'solido',anillo:'anillo',globo:'globo'};

/** Convierte la escena cargada en partes con los atributos del sistema holográfico. Lanza si falta una parte. */
export function toParts(root:THREE.Object3D):QPart[]{
 const found=new Map<string,THREE.BufferGeometry[]>();
 root.traverse(o=>{
  const m=o as THREE.Mesh;if(!m.isMesh)return;
  const name=(o.parent&&KIND[o.parent.name]?o.parent.name:o.name).replace(/\.\d+$/,'');if(!KIND[name])return;
  (found.get(name)??found.set(name,[]).get(name)!).push(m.geometry);
 });
 const parts:QPart[]=[];
 for(const id of Object.keys(KIND)){
  const gs=found.get(id);if(!gs?.length)throw new Error(`Falta la parte "${id}" en el GLB`);
  const clean=gs.map(g=>{const c=new THREE.BufferGeometry();c.setIndex(g.index);for(const k of ['position','normal','uv'])if(g.getAttribute(k))c.setAttribute(k,g.getAttribute(k));const cc=g.getAttribute('color_1');if(cc)c.setAttribute('color',cc);return c;});
  const geometry=clean.length>1?mergeGeometries(clean,false):clean[0];
  const n=geometry.getAttribute('position').count,uv=geometry.getAttribute('uv'),col=geometry.getAttribute('color');
  const aU=new Float32Array(n),aT=new Float32Array(n),aPhase=new Float32Array(n),aTone=new Float32Array(n);
  for(let i=0;i<n;i++){
   aU[i]=uv?uv.getX(i):-1;aT[i]=uv?uv.getY(i):0;
   if(col){const r=col.getX(i),g=col.getY(i);aTone[i]=g>0.95?3:r;aPhase[i]=g>0.95?0:g;}
  }
  geometry.setAttribute('aU',new THREE.BufferAttribute(aU,1));geometry.setAttribute('aT',new THREE.BufferAttribute(aT,1));
  geometry.setAttribute('aPhase',new THREE.BufferAttribute(aPhase,1));geometry.setAttribute('aTone',new THREE.BufferAttribute(aTone,1));
  geometry.setAttribute('aLayer',new THREE.BufferAttribute(new Float32Array(n),1));
  if(KIND[id]==='globo'){geometry.computeBoundingBox();const c=geometry.boundingBox!.getCenter(new THREE.Vector3());geometry.translate(-c.x,-c.y,-c.z);geometry.userData.center=[c.x,c.y,c.z];}
  parts.push({id,kind:KIND[id],geometry});
 }
 return parts;
}

// ─── Estado de carga compartido (useSyncExternalStore) ───────────────────────
export interface GlbState{status:'idle'|'loading'|'ready'|'failed';parts:QPart[]|null}
let state:GlbState={status:'idle',parts:null};
const subs=new Set<()=>void>();
const set=(s:GlbState)=>{state=s;subs.forEach(f=>f());};
export const getGlbState=()=>state;
export const subscribeGlb=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};

export function loadGlb(){
 if(state.status!=='idle')return;
 set({status:'loading',parts:null});
 new GLTFLoader().loadAsync(GLB_URL).then(g=>set({status:'ready',parts:toParts(g.scene)})).catch(()=>set({status:'failed',parts:null}));
}
