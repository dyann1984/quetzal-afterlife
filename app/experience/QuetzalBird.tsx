'use client';
/**
 * Quetzal holográfico: silueta de GEOMETRÍA 3D real con materiales metálicos y entorno propio
 * (sin HDR externos), más un aura de partículas como efecto complementario.
 * Honestidad de datos: la fracción de registros perdidos/recuperados del motor se traduce en
 * celdas-voxel disueltas (perdido) o teñidas de oro (recuperado con daño). Sin evidencia, sin disolución.
 */
import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {buildQuetzal,sampleSurface,type BirdPart,type MaterialKind,type Wave} from './quetzal-geometry';
import {cloudFromSamples,tileStates,type Quality,type TileState} from '../../lib/experience';

export const REVEAL_FROM=-6.3,REVEAL_TO=2.4,REVEAL_DONE=99,REVEAL_SECONDS=3.6;
export const AURA_COUNT:Record<Quality,number>={alta:2600,media:1500,baja:700};

export interface Fractions{intact:number;recovered:number;lost:number}
type U={uTime:{value:number};uReveal:{value:number};uLost:{value:number};uRec:{value:number};uCell:{value:number};uRim:{value:number}};
export interface Shared{u:U}

export function makeShared():Shared{
 return {u:{uTime:{value:0},uReveal:{value:REVEAL_DONE},uLost:{value:0},uRec:{value:0},uCell:{value:0.2},uRim:{value:0.75}}};
}
/** Escrituras imperativas sobre uniforms (fuera del render de React). */
export function setFractions(s:Shared,f:Fractions){s.u.uLost.value=f.lost;s.u.uRec.value=f.recovered;}
export function tickShared(s:Shared,time:number,reveal:number){s.u.uTime.value=time;s.u.uReveal.value=reveal;}
export function revealAt(elapsed:number,reduced:boolean){
 if(reduced||elapsed>=REVEAL_SECONDS)return REVEAL_DONE;
 const t=elapsed/REVEAL_SECONDS,e=1-Math.pow(1-t,3);
 return REVEAL_FROM+(REVEAL_TO-REVEAL_FROM)*e;
}

// ─── Materiales ──────────────────────────────────────────────────────────────
function makeMaterial(kind:MaterialKind,wave:Wave|null,shared:Shared){
 const common={vertexColors:true,side:THREE.DoubleSide};
 const m=kind==='metal'
  ?new THREE.MeshStandardMaterial({...common,metalness:0.8,roughness:0.3,envMapIntensity:1.25,emissive:new THREE.Color('#0a3b8f'),emissiveIntensity:0.4})
  :kind==='gold'
  ?new THREE.MeshStandardMaterial({...common,metalness:1,roughness:0.2,envMapIntensity:1.5,emissive:new THREE.Color('#6a470a'),emissiveIntensity:0.4})
  :new THREE.MeshStandardMaterial({...common,metalness:0.6,roughness:0.5,envMapIntensity:0.8,emissive:new THREE.Color('#06142a'),emissiveIntensity:0.5});
 const wu={uAmp:{value:wave?.amp??0},uFreq:{value:wave?.freq??0},uK:{value:wave?.k??0},uDir:{value:new THREE.Vector3(...(wave?.dir??[0,0,0]))}};
 m.onBeforeCompile=sh=>{
  Object.assign(sh.uniforms,shared.u,wu);
  sh.vertexShader=sh.vertexShader
   .replace('#include <common>','#include <common>\nattribute float aT;attribute float aPhase;uniform float uTime,uAmp,uFreq,uK;uniform vec3 uDir;varying vec3 vP;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvP=transformed;float wv=sin(uTime*uFreq+aPhase+aT*uK)*uAmp*aT*aT;transformed+=uDir*wv;');
  sh.fragmentShader=sh.fragmentShader
   .replace('#include <common>','#include <common>\nvarying vec3 vP;uniform float uReveal,uLost,uRec,uCell,uRim,uTime;float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}')
   .replace('#include <color_fragment>','#include <color_fragment>\nif(vP.y>uReveal)discard;float hh=h3(floor(vP/uCell));if(hh<uLost)discard;float rc=step(uLost,hh)*step(hh,uLost+uRec);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.86,0.7,0.36),rc*0.55);')
   .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat fr=pow(1.0-clamp(dot(normalize(vViewPosition),normal),0.0,1.0),2.2);totalEmissiveRadiance+=vec3(0.15,0.65,1.0)*fr*uRim;float ed=(1.0-smoothstep(0.0,0.25,uReveal-vP.y))*step(uReveal,6.0);totalEmissiveRadiance+=vec3(0.3,0.85,1.0)*ed*1.8;');
 };
 m.customProgramCacheKey=()=>`quetzal-${kind}-${wave?'w':'s'}`;
 return m;
}

/** Entorno cinematográfico propio (paneles azul/oro) convertido con PMREM: sin descargas externas. */
function makeEnvironment(gl:THREE.WebGLRenderer){
 const s=new THREE.Scene();s.background=new THREE.Color(0x02060c);
 const panel=(w:number,h:number,pos:[number,number,number],color:string,k:number)=>{
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(k),side:THREE.DoubleSide,toneMapped:false}));
  mesh.position.set(...pos);mesh.lookAt(0,0,0);s.add(mesh);
 };
 panel(10,6,[-6,3,4],'#2f8cff',2.5);panel(8,2,[6,2,-5],'#ffcf70',4);panel(6,6,[0,8,0],'#cfeaff',1.6);panel(12,3,[0,-6,5],'#0a4bd6',1.2);panel(3,9,[7,0,4],'#5fd8ff',1.4);
 const pm=new THREE.PMREMGenerator(gl);const tex=pm.fromScene(s,0.03).texture;pm.dispose();
 s.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.geometry.dispose();(m.material as THREE.Material).dispose();}});
 return tex;
}

/** Entorno + luces. Debe renderizarse como hijo directo del Canvas (adjunta scene.environment). */
export function Studio3D({key2='studio'}:{key2?:string}){
 const gl=useThree(s=>s.gl);
 const env=useMemo(()=>makeEnvironment(gl),[gl]);
 useEffect(()=>()=>{env.dispose();},[env]);
 return <>
  <primitive object={env} attach="environment" key={key2}/>
  <ambientLight intensity={0.35} color="#27508f"/>
  <directionalLight position={[3,4,5]} intensity={2.4} color="#5ab4ff"/>
  <directionalLight position={[-5,2,-3]} intensity={2.6} color="#ffcf7a"/>
  <pointLight position={[0,-4,3]} intensity={18} distance={14} color="#2cc7fa"/>
 </>;
}

// ─── Ave ─────────────────────────────────────────────────────────────────────
let cached:BirdPart[]|null=null;
export const getBirdParts=()=>cached??(cached=buildQuetzal());

export function Bird({shared,fractions,paused,reduced,runId,motion=true}:{shared:Shared;fractions:Fractions;paused:boolean;reduced:boolean;runId:number;motion?:boolean}){
 const parts=getBirdParts();
 const mats=useMemo(()=>parts.map(p=>makeMaterial(p.material,p.wave,shared)),[parts,shared]);
 useEffect(()=>()=>{mats.forEach(m=>m.dispose());},[mats]);
 useEffect(()=>{setFractions(shared,fractions);},[shared,fractions]);
 const root=useRef<THREE.Group>(null),near=useRef<THREE.Group>(null),far=useRef<THREE.Group>(null),chest=useRef<THREE.Group>(null);
 const clock=useRef({t:0,el:0});
 useEffect(()=>{clock.current.el=0;},[runId]);
 useFrame((_,dt)=>{
  if(paused)return;
  const c=clock.current;c.el+=dt;if(!reduced)c.t+=dt;
  tickShared(shared,c.t,revealAt(c.el,reduced));
  if(!motion||reduced)return;
  const t=c.t;
  if(root.current){root.current.rotation.y=Math.sin(t*0.35)*0.16;root.current.position.y=Math.sin(t*0.9)*0.035;}
  if(chest.current){const b=1+Math.sin(t*1.4)*0.012;chest.current.scale.set(b,1+Math.sin(t*1.4+0.4)*0.014,b);}
  const flap=Math.sin(t*0.95)*0.1+Math.sin(t*0.4)*0.04;
  if(near.current)near.current.rotation.x=-flap;
  if(far.current)far.current.rotation.x=flap;
 });
 return <group ref={root}>
  {parts.map((p,i)=>{
   const mesh=<mesh key={p.id} geometry={p.geometry} material={mats[i]} frustumCulled={false}/>;
   if(p.id==='ala-cercana')return <group key={p.id} ref={near} position={p.pivot}>{mesh}</group>;
   if(p.id==='ala-lejana')return <group key={p.id} ref={far} position={p.pivot}>{mesh}</group>;
   if(p.id==='cuerpo')return <group key={p.id} ref={chest} position={[0,0.1,0]}><group position={[0,-0.1,0]}>{mesh}</group></group>;
   return mesh;
  })}
 </group>;
}

// ─── Aura de partículas ──────────────────────────────────────────────────────
const VERT=`
uniform float uProgress,uTime,uSize,uPixelRatio,uOpacity;
attribute vec3 aStart;attribute float aDelay,aKind,aState;
varying vec3 vColor;varying float vAlpha;
void main(){
  float p=clamp((uProgress-aDelay*0.65)/0.35,0.0,1.0);p=p*p*(3.0-2.0*p);
  float lost=step(1.5,aState),rec=step(0.5,aState)-lost;
  float pm=mix(p,0.0,lost);
  vec3 pos=mix(aStart,position,pm);
  float w=sin(uTime*1.1+position.y*2.3+position.x*1.7);
  pos+=vec3(w*0.03,cos(uTime*0.9+position.x*2.0)*0.025+uTime*0.0,w*0.02)*(1.0-lost*0.5);
  pos+=vec3(sin(uTime*0.35+aDelay*9.0),cos(uTime*0.3+aDelay*7.0),0.0)*0.2*lost*(0.6+0.4*p);
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=uSize*uPixelRatio*(1.0+0.7*step(2.5,aKind))*(1.0/-mv.z)*(1.0-0.35*lost);
  vec3 blue=vec3(0.17,0.78,0.98),gold=vec3(0.83,0.70,0.45),red=vec3(0.75,0.28,0.28);
  vec3 c=mix(blue,gold,step(2.5,aKind));
  c=mix(c,gold,rec*(0.55+0.45*sin(uTime*3.0+aDelay*20.0)));
  c=mix(c,red,lost);
  vColor=c;
  vAlpha=mix(0.9,0.3,lost)*smoothstep(0.0,0.08,p+lost)*uOpacity;
}`;
const FRAG=`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-0.5);gl_FragColor=vec4(vColor,smoothstep(0.5,0.0,d)*vAlpha);}`;

function writeAura(m:THREE.ShaderMaterial|null,v:{progress:number;time:number;pixelRatio:number;opacity:number}){
 if(!m)return;
 m.uniforms.uProgress.value=v.progress;m.uniforms.uTime.value=v.time;m.uniforms.uPixelRatio.value=v.pixelRatio;m.uniforms.uOpacity.value=v.opacity;
}

export function Aura({shared,fractions,quality,opacity=1,reducedMotion,forceComplete=false}:{shared:Shared;fractions:Fractions;quality:Quality;opacity?:number;reducedMotion:boolean;forceComplete?:boolean}){
 const dpr=useThree(s=>s.viewport.dpr);
 const cloud=useMemo(()=>{const s=sampleSurface(getBirdParts(),AURA_COUNT[quality]);return cloudFromSamples(s.points,s.gold,fractions);},[quality,fractions]);
 const geo=useMemo(()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(cloud.target,3));
  g.setAttribute('aStart',new THREE.BufferAttribute(cloud.start,3));
  g.setAttribute('aDelay',new THREE.BufferAttribute(cloud.delay,1));
  g.setAttribute('aKind',new THREE.BufferAttribute(Float32Array.from(cloud.kind),1));
  g.setAttribute('aState',new THREE.BufferAttribute(Float32Array.from(cloud.state),1));
  return g;
 },[cloud]);
 useEffect(()=>()=>{geo.dispose();},[geo]);
 const uniforms=useMemo(()=>({uProgress:{value:0},uTime:{value:0},uSize:{value:26},uPixelRatio:{value:1},uOpacity:{value:1}}),[]);
 const ref=useRef<THREE.ShaderMaterial>(null);
 useFrame(()=>{
  const r=shared.u.uReveal.value;
  const progress=r>=REVEAL_DONE||reducedMotion||forceComplete?1:Math.min(1,Math.max(0,(r-REVEAL_FROM)/(REVEAL_TO-REVEAL_FROM)));
  writeAura(ref.current,{progress,time:reducedMotion?0:shared.u.uTime.value,pixelRatio:dpr,opacity});
 });
 return <points geometry={geo} frustumCulled={false}>
  <shaderMaterial ref={ref} vertexShader={VERT} fragmentShader={FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms}/>
 </points>;
}

// ─── Plataforma, anillo de datos y teselas ───────────────────────────────────
const C={blue:new THREE.Color('#2cc7fa'),gold:new THREE.Color('#d3b273'),red:new THREE.Color('#ff7a7a'),navy:new THREE.Color('#071f3d')};

export function Pedestal({y=-6.1}:{y?:number}){
 return <group position={[0,y,0]}>
  <mesh position={[0,-0.12,0]}><cylinderGeometry args={[1.95,2.2,0.3,64]}/><meshStandardMaterial color="#0a1830" metalness={0.9} roughness={0.35} envMapIntensity={0.9}/></mesh>
  <mesh position={[0,0.06,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.8,0.045,10,96]}/><meshBasicMaterial color={C.blue}/></mesh>
  <mesh position={[0,0.0,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[2.12,0.03,8,96]}/><meshStandardMaterial color={C.gold} metalness={1} roughness={0.25} emissive={C.gold} emissiveIntensity={0.35}/></mesh>
  <mesh position={[0,0.05,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.7,64]}/><meshBasicMaterial color={C.blue} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
 </group>;
}

export function DataRing({paused,reduced}:{paused:boolean;reduced:boolean}){
 const g=useRef<THREE.Group>(null);const t=useRef(0);
 useFrame((_,dt)=>{if(paused||reduced||!g.current)return;t.current+=dt;g.current.rotation.z=t.current*0.06;});
 return <group ref={g} position={[0.2,-1.6,-1.6]}>
  <mesh><torusGeometry args={[3.9,0.03,8,180,Math.PI*1.55]}/><meshBasicMaterial color={C.blue} transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
  <mesh rotation={[0,0,0.5]}><torusGeometry args={[4.25,0.015,6,180,Math.PI*1.2]}/><meshBasicMaterial color={C.gold} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
  <mesh rotation={[0,0,-0.4]}><torusGeometry args={[3.55,0.012,6,160,Math.PI*0.9]}/><meshBasicMaterial color={C.blue} transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
 </group>;
}

/** Teselas de datos: cada una representa una fracción de los registros declarados (estado real). */
export function DataTiles({counts,paused,reduced}:{counts:Fractions&{};paused:boolean;reduced:boolean}){
 const states=useMemo<TileState[]>(()=>tileStates(counts,36),[counts]);
 const refs=useMemo(()=>({i:null as THREE.InstancedMesh|null}),[]);
 const mesh=useRef<THREE.InstancedMesh>(null);
 const base=useMemo(()=>states.map((s,k)=>{
  const a=THREE.MathUtils.degToRad(-35+(k/Math.max(states.length-1,1))*105),r=3.5+((k*37)%11)/11*1.4,yy=-1.6+Math.sin(a)*r*0.95,xx=Math.cos(a)*r*0.9+0.6;
  return {x:xx,y:yy,z:-1.2+((k*13)%7)/7*1.2,s:0.16+((k*17)%5)*0.045,state:s};
 }),[states]);
 const t=useRef(0);
 useEffect(()=>{
  const m=mesh.current;if(!m)return;
  const d=new THREE.Object3D(),col=new THREE.Color();
  base.forEach((b,i)=>{d.position.set(b.x,b.y,b.z);d.scale.set(b.s,b.s,b.s);d.updateMatrix();m.setMatrixAt(i,d.matrix);col.copy(b.state==='intacto'?C.blue:b.state==='recuperado'?C.gold:C.red);m.setColorAt(i,col);});
  m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
 },[base]);
 useFrame((_,dt)=>{if(paused||reduced||!mesh.current)return;t.current+=dt;mesh.current.rotation.y=Math.sin(t.current*0.25)*0.12;});
 void refs;
 if(base.length===0)return null;
 return <instancedMesh ref={mesh} key={base.length} args={[undefined,undefined,base.length]} frustumCulled={false}>
  <boxGeometry args={[1,1,0.12]}/><meshBasicMaterial transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false}/>
 </instancedMesh>;
}


