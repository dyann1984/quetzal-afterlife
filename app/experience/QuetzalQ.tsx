'use client';
/**
 * Emblema Q holográfico: plumas curvas con espesor, cabeza de quetzal, anillo, globo de malla, teselas y plataforma.
 * Material holográfico propio (transparencia aditiva, borde luminoso, líneas digitales dentro de cada pluma).
 * Honestidad de datos: la fracción de registros perdidos/recuperados del motor se traduce en celdas-voxel disueltas
 * o teñidas de oro. Sin evidencia cargada no hay disolución (emblema). La materialización avanza desde la cabeza.
 */
import {useEffect,useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {buildQ,sampleSurface,HEAD_CENTER,type QPart} from './q-geometry';
import {cloudFromSamples,tileStates,type Quality,type TileState} from '../../lib/experience';

export const REVEAL_FROM=0,REVEAL_TO=9.6,REVEAL_DONE=99,REVEAL_SECONDS=3.8;
export const AURA_COUNT:Record<Quality,number>={alta:2600,media:1500,baja:700};
declare global{interface Window{__quetzalHold?:boolean}}

export interface Fractions{intact:number;recovered:number;lost:number}
type U={uTime:{value:number};uReveal:{value:number};uLost:{value:number};uRec:{value:number};uCell:{value:number};uOpacity:{value:number}};
export interface Shared{u:U}
export function makeShared():Shared{return {u:{uTime:{value:0},uReveal:{value:REVEAL_DONE},uLost:{value:0},uRec:{value:0},uCell:{value:0.2},uOpacity:{value:1}}};}
export function setFractions(s:Shared,f:Fractions){s.u.uLost.value=f.lost;s.u.uRec.value=f.recovered;}
export function tickShared(s:Shared,time:number,reveal:number){s.u.uTime.value=time;s.u.uReveal.value=reveal;}
export function revealAt(elapsed:number,reduced:boolean){
 if(reduced||elapsed>=REVEAL_SECONDS)return REVEAL_DONE;
 const t=elapsed/REVEAL_SECONDS,e=1-Math.pow(1-t,3);
 return REVEAL_FROM+(REVEAL_TO-REVEAL_FROM)*e;
}

// ─── Material holográfico ────────────────────────────────────────────────────
const VERT=`
attribute float aU,aT,aPhase,aTone,aLayer;
uniform float uTime;
varying float vU,vT,vTone,vLayer;varying vec3 vP,vN,vV;
void main(){
  vU=aU;vT=aT;vTone=aTone;vLayer=aLayer;vP=position;
  vec3 p=position;
  #if MODE==0
    float ang=sin(uTime*0.55+aPhase)*0.02*aT;
    vec2 c=vec2(0.1,0.1);vec2 d=p.xy-c;float cs=cos(ang),sn=sin(ang);
    p.xy=c+vec2(d.x*cs-d.y*sn,d.x*sn+d.y*cs);
    p.z+=sin(uTime*0.9+aPhase*1.7+aT*4.0)*0.08*aT;
  #elif MODE==1
    p*=1.0+sin(uTime*1.3)*0.006;
  #endif
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
const FRAG=`
uniform float uTime,uReveal,uLost,uRec,uCell,uOpacity;
varying float vU,vT,vTone,vLayer;varying vec3 vP,vN,vV;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){
  float dist=length(vP.xy-vec2(${HEAD_CENTER[0].toFixed(2)},${HEAD_CENTER[1].toFixed(2)}));
  if(dist>uReveal)discard;                                  // la materialización avanza desde la cabeza
  float hh=h3(floor(vP/uCell));
  if(hh<uLost)discard;                                      // registros perdidos: celdas disueltas
  float rc=step(uLost,hh)*step(hh,uLost+uRec);              // recuperados con daño: tinte dorado
  vec3 deep=vec3(0.02,0.2,0.85),cyan=vec3(0.12,0.82,1.0),gold=vec3(0.88,0.72,0.38);
  float fres=pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.0);
  vec3 col;float a;
  #if MODE==0
    float e=abs(vU-0.5)*2.0;
    float edge=smoothstep(0.6,1.0,e);
    float rib=1.0-smoothstep(0.0,0.06,e);
    float barbs=smoothstep(0.78,1.0,sin(vT*34.0+e*9.0)*0.5+0.5)*(1.0-e*0.4);
    float scan=step(0.95,fract(vT*34.0+vU*2.0));
    col=mix(deep,cyan,clamp(vT*0.55+edge*0.45+fres*0.4,0.0,1.0));
    col+=vec3(0.25,0.85,1.0)*(edge*0.55+rib*0.5+barbs*0.18+scan*0.2+fres*0.35);
    col=mix(col,gold,vTone*smoothstep(0.5,1.0,vT)*0.8);
    a=(0.24+0.4*edge+0.28*rib+0.1*barbs+0.06*scan+0.2*fres)*mix(1.0,0.5,vLayer);
    a*=smoothstep(0.0,0.05,vT);
  #elif MODE==1
    float scan=0.5+0.5*sin(vP.y*70.0+uTime*1.5);
    col=mix(vec3(0.03,0.3,0.95),vec3(0.3,0.92,1.0),fres)+vec3(0.1,0.5,0.9)*scan*0.1;
    a=0.2+0.75*pow(fres,1.3);                                   // orbe de cristal: brilla en el contorno, interior casi transparente
    float grid=step(0.92,fract(vP.x*16.0+vP.y*7.0));col+=vec3(0.15,0.6,1.0)*grid*0.3;a+=grid*0.08;
    if(vTone>0.5&&vTone<2.5){col=mix(col,gold,0.9);a=0.92;}
    if(vTone>2.5){col=vec3(0.25,0.95,1.0);a=1.0;}
  #else
    float e=abs(vU-0.5)*2.0;
    float edge=smoothstep(0.7,1.0,e);
    float lines=smoothstep(0.93,1.0,sin(vU*30.0))*0.4;
    float tick=step(0.94,fract(vT*160.0))*(1.0-e)*0.7;
    col=mix(vec3(0.05,0.45,0.95),cyan,edge)+vec3(0.1,0.5,0.8)*tick;
    col=mix(col,gold,vTone);
    a=0.1+0.4*edge+0.18*lines+0.25*tick;
  #endif
  col=mix(col,gold,rc*0.55);
  float ring=1.0-smoothstep(0.0,0.4,uReveal-dist);          // borde de la onda de materialización
  col+=vec3(0.3,0.85,1.0)*ring*step(uReveal,20.0)*1.4;
  a=a*uOpacity*0.9+ring*step(uReveal,20.0)*0.2;
  gl_FragColor=vec4(col,a);
}`;

function holoMaterial(mode:0|1|2,shared:Shared){
 return new THREE.ShaderMaterial({defines:{MODE:mode},vertexShader:VERT,fragmentShader:FRAG,uniforms:shared.u as unknown as {[k:string]:THREE.IUniform},
  transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});
}

// ─── Partículas ──────────────────────────────────────────────────────────────
const PVERT=`
uniform float uProgress,uTime,uSize,uPixelRatio,uOpacity;
attribute vec3 aStart;attribute float aDelay,aKind,aState;
varying vec3 vColor;varying float vAlpha;
void main(){
  float p=clamp((uProgress-aDelay*0.65)/0.35,0.0,1.0);p=p*p*(3.0-2.0*p);
  float lost=step(1.5,aState),rec=step(0.5,aState)-lost;
  float pm=mix(p,0.0,lost);
  vec3 pos=mix(aStart,position,pm);
  float w=sin(uTime*1.1+position.y*2.3+position.x*1.7);
  pos+=vec3(w*0.04,cos(uTime*0.9+position.x*2.0)*0.035,w*0.03)*(1.0-lost*0.5);
  pos+=vec3(sin(uTime*0.35+aDelay*9.0),cos(uTime*0.3+aDelay*7.0),0.0)*0.22*lost*(0.6+0.4*p);
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  gl_Position=projectionMatrix*mv;
  float tw=0.6+0.4*sin(uTime*2.0+aDelay*50.0);
  gl_PointSize=uSize*uPixelRatio*(1.0+0.9*step(2.5,aKind)+1.4*step(0.985,aDelay))*tw*(1.0/-mv.z)*(1.0-0.35*lost);
  vec3 blue=vec3(0.15,0.75,1.0),gold=vec3(0.88,0.72,0.4),red=vec3(0.85,0.3,0.3);
  vec3 c=mix(blue,gold,step(2.5,aKind));
  c=mix(c,gold,rec*(0.55+0.45*sin(uTime*3.0+aDelay*20.0)));
  c=mix(c,red,lost);
  vColor=c;vAlpha=mix(0.85,0.3,lost)*smoothstep(0.0,0.08,p+lost)*uOpacity;
}`;
const PFRAG=`varying vec3 vColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-0.5);gl_FragColor=vec4(vColor,smoothstep(0.5,0.0,d)*vAlpha);}`;
function writeAura(m:THREE.ShaderMaterial|null,v:{progress:number;time:number;pixelRatio:number;opacity:number}){
 if(!m)return;m.uniforms.uProgress.value=v.progress;m.uniforms.uTime.value=v.time;m.uniforms.uPixelRatio.value=v.pixelRatio;m.uniforms.uOpacity.value=v.opacity;
}

let cached:ReturnType<typeof buildQ>|null=null;
export const getQ=()=>cached??(cached=buildQ());

export function Aura({shared,fractions,quality,opacity=1,reducedMotion,forceComplete=false}:{shared:Shared;fractions:Fractions;quality:Quality;opacity?:number;reducedMotion:boolean;forceComplete?:boolean}){
 const dpr=useThree(s=>s.viewport.dpr);
 const cloud=useMemo(()=>{const s=sampleSurface(getQ().parts,AURA_COUNT[quality]);return cloudFromSamples(s.points,s.gold,fractions);},[quality,fractions]);
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
 const uniforms=useMemo(()=>({uProgress:{value:0},uTime:{value:0},uSize:{value:32},uPixelRatio:{value:1},uOpacity:{value:1}}),[]);
 const ref=useRef<THREE.ShaderMaterial>(null);
 useFrame(()=>{
  const r=shared.u.uReveal.value;
  const progress=r>=REVEAL_DONE||reducedMotion||forceComplete?1:Math.min(1,Math.max(0,(r-REVEAL_FROM)/(REVEAL_TO-REVEAL_FROM)));
  writeAura(ref.current,{progress,time:reducedMotion?0:shared.u.uTime.value,pixelRatio:dpr,opacity});
 });
 return <points geometry={geo} frustumCulled={false}>
  <shaderMaterial ref={ref} vertexShader={PVERT} fragmentShader={PFRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms}/>
 </points>;
}

// ─── Plataforma y teselas ────────────────────────────────────────────────────
const C={blue:new THREE.Color('#2cc7fa'),gold:new THREE.Color('#d3b273'),red:new THREE.Color('#ff7a7a')};

/** Plataforma discreta: metal oscuro con anillos cian/dorado y disco azul profundo (sin luz blanca). */
export function Pedestal({y=-3.95}:{y?:number}){
 return <group position={[0.55,y,0]}>
  <mesh position={[0,-0.14,0]}><cylinderGeometry args={[1.75,2.0,0.28,64]}/><meshBasicMaterial color="#050d1c"/></mesh>
  <mesh position={[0,0.02,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.62,0.035,10,96]}/><meshBasicMaterial color={C.blue} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
  <mesh position={[0,-0.02,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[1.9,0.02,8,96]}/><meshBasicMaterial color={C.gold} transparent opacity={0.75}/></mesh>
  <mesh position={[0,0.03,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.5,64]}/><meshBasicMaterial color="#0a3a8a" transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
 </group>;
}

/** Teselas digitales a la derecha; cada una representa una fracción de los registros declarados (estado real). */
export function DataTiles({counts,paused,reduced}:{counts:Fractions;paused:boolean;reduced:boolean}){
 const states=useMemo<TileState[]>(()=>tileStates(counts,36),[counts]);
 const mesh=useRef<THREE.InstancedMesh>(null);
 const base=useMemo(()=>states.map((s,k)=>{
  const col=k%6,row=Math.floor(k/6),jx=((k*37)%11)/11-0.5,jy=((k*53)%13)/13-0.5;
  return {x:2.1+col*0.42+jx*0.28,y:2.3-row*0.78+jy*0.34,z:-0.9+((k*13)%7)/7*1.1,s:0.15+((k*17)%5)*0.05,state:s};
 }),[states]);
 const t=useRef(0);
 useEffect(()=>{
  const m=mesh.current;if(!m)return;
  const d=new THREE.Object3D(),col=new THREE.Color();
  base.forEach((b,i)=>{d.position.set(b.x,b.y,b.z);d.scale.set(b.s,b.s,b.s);d.updateMatrix();m.setMatrixAt(i,d.matrix);col.copy(b.state==='intacto'?C.blue:b.state==='recuperado'?C.gold:C.red);m.setColorAt(i,col);});
  m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
 },[base]);
 useFrame((_,dt)=>{if(paused||reduced||!mesh.current)return;t.current+=dt;mesh.current.position.y=Math.sin(t.current*0.6)*0.06;});
 if(base.length===0)return null;
 return <instancedMesh ref={mesh} key={base.length} args={[undefined,undefined,base.length]} frustumCulled={false}>
  <boxGeometry args={[1,1,0.05]}/><meshBasicMaterial transparent opacity={0.7} blending={THREE.AdditiveBlending} depthWrite={false}/>
 </instancedMesh>;
}

// ─── Composición ─────────────────────────────────────────────────────────────
export function QuetzalQ({shared,fractions,quality,paused,reduced,runId,hasData,motion=true}:{shared:Shared;fractions:Fractions;quality:Quality;paused:boolean;reduced:boolean;runId:number;hasData:boolean;motion?:boolean}){
 const q=getQ();
 const mats=useMemo(()=>({0:holoMaterial(0,shared),1:holoMaterial(1,shared),2:holoMaterial(2,shared)}),[shared]);
 useEffect(()=>()=>{Object.values(mats).forEach(m=>m.dispose());},[mats]);
 useEffect(()=>{setFractions(shared,fractions);},[shared,fractions]);
 const root=useRef<THREE.Group>(null),globe=useRef<THREE.LineSegments>(null);
 const clock=useRef({t:0,el:0});
 useEffect(()=>{clock.current.el=0;},[runId]);
 useFrame((_,dt)=>{
  if(paused)return;
  const c=clock.current;c.el+=dt;if(!reduced)c.t+=dt;
  tickShared(shared,c.t,revealAt(c.el,reduced));
  if(!motion||reduced||!root.current)return;
  // Giro suave y LIMITADO (±20°) para no perder nunca la composición de la Q
  root.current.rotation.y=window.__quetzalHold?0:Math.sin(c.t*0.33)*0.35;
  root.current.position.y=Math.sin(c.t*0.8)*0.04;
  if(globe.current)globe.current.rotation.y=c.t*0.25;
 });
 const matFor=(k:QPart['kind'])=>k==='pluma'?mats[0]:k==='solido'?mats[1]:mats[2];
 return <>
  <group ref={root}>
   {q.parts.map(p=>p.kind==='globo'
    ?<lineSegments key={p.id} ref={globe} geometry={p.geometry} position={[1.4,-0.25,-0.8]} frustumCulled={false}><lineBasicMaterial color="#2cc7fa" transparent opacity={0.24} blending={THREE.AdditiveBlending} depthWrite={false}/></lineSegments>
    :<mesh key={p.id} geometry={p.geometry} material={matFor(p.kind)} frustumCulled={false} renderOrder={p.kind==='anillo'?1:2}/>)}
   <Aura shared={shared} fractions={fractions} quality={quality} reducedMotion={reduced}/>
   {hasData&&<DataTiles counts={fractions} paused={paused} reduced={reduced}/>}
  </group>
  <Pedestal/>
 </>;
}










