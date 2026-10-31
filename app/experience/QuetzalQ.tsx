'use client';
/**
 * Emblema Q holográfico: plumas curvas con espesor, cabeza de quetzal, anillo, globo de malla, teselas y plataforma.
 * Material holográfico propio (transparencia aditiva, borde luminoso, líneas digitales dentro de cada pluma).
 * Honestidad de datos: la fracción de registros perdidos/recuperados del motor se traduce en celdas-voxel disueltas
 * o teñidas de oro. Sin evidencia cargada no hay disolución (emblema). La materialización avanza desde la cabeza.
 */
import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {buildQ,sampleSurface,HEAD_CENTER,type QPart} from './q-geometry';
import {GLB_HEAD,getGlbState,loadGlb,subscribeGlb} from './q-glb';
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
varying float vU,vT,vTone,vLayer,vPh;varying vec3 vP,vN,vV;
void main(){
  vU=aU;vT=aT;vTone=aTone;vLayer=aLayer;vPh=aPhase;vP=position;
  vec3 p=position;
  #if MODE==0
    float ang=sin(uTime*0.55+aPhase)*0.02*aT;
    vec2 c=vec2(0.1,0.1);vec2 d=p.xy-c;float cs=cos(ang),sn=sin(ang);
    p.xy=c+vec2(d.x*cs-d.y*sn,d.x*sn+d.y*cs);
    p.z+=sin(uTime*0.9+aPhase*1.7+aT*4.0)*0.05*aT;
  #elif MODE==1
    p*=1.0+sin(uTime*1.3)*0.006;
  #endif
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
// Plumas y cabeza: superficies OPACAS con iluminación (volumen real, las capas se tapan entre sí).
// El anillo (MODE 2) es el único elemento translúcido/aditivo junto con las partículas.
const FRAG=`
uniform float uTime,uReveal,uLost,uRec,uCell,uOpacity;
varying float vU,vT,vTone,vLayer,vPh;varying vec3 vP,vN,vV;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){
  float dist=length(vP.xy-vec2(${HEAD_CENTER[0].toFixed(2)},${HEAD_CENTER[1].toFixed(2)}));
  if(dist>uReveal)discard;                                  // la materialización avanza desde la cabeza
  float hh=h3(floor(vP/uCell));
  if(hh<uLost)discard;                                      // registros perdidos: celdas disueltas
  float rc=step(uLost,hh)*step(hh,uLost+uRec);              // recuperados con daño: tinte dorado
  vec3 deep=vec3(0.02,0.14,0.60),mid=vec3(0.12,0.56,1.0),tipc=vec3(0.55,0.90,1.0),pale=vec3(0.88,0.98,1.0),gold=vec3(0.9,0.74,0.38);
  vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;
  vec3 v=normalize(vV),L=normalize(vec3(-0.35,0.7,0.62));
  float diff=0.5+0.5*dot(n,L);
  float fres=pow(1.0-clamp(dot(n,v),0.0,1.0),2.2);
  float spec=pow(max(dot(reflect(-L,n),v),0.0),22.0);
  vec3 col;float a=1.0;
  #if MODE==0
    float e=abs(vU-0.5)*2.0;
    float edge=smoothstep(0.74,1.0,e);                      // filo claro
    float rib=1.0-smoothstep(0.0,0.03,e);                   // raquis sutil
    float vein=smoothstep(0.82,1.0,sin(vT*58.0+e*13.0)*0.5+0.5)*(1.0-e*0.6);   // barbas finas y tenues
    float jit=0.74+0.5*fract(vPh*0.618);                   // cada pluma con un tono ligeramente distinto
    vec3 base=mix(deep,mid,smoothstep(0.0,0.45,vT));base=mix(base,tipc,smoothstep(0.45,1.0,vT)*0.8)*jit;
    float sheen=pow(1.0-e,2.0);                            // brillo suave a lo largo del raquis
    col=base*(0.5+0.85*diff)+pale*sheen*0.16*diff;
    col=mix(col,pale,edge*0.62+fres*0.3);
    col+=pale*(rib*0.14+vein*0.13)+vec3(0.5,0.9,1.0)*spec*0.35;
    col*=0.82+0.18*smoothstep(0.0,0.2,vT);                 // sombra de contacto en la base de cada pluma
    col=mix(col,gold,vTone*smoothstep(0.62,1.0,vT)*0.75);
    col*=mix(1.0,0.78,vLayer);
  #elif MODE==1
    vec3 base=mix(vec3(0.02,0.14,0.68),vec3(0.1,0.52,1.0),clamp(n.y*0.5+0.5,0.0,1.0));
    col=base*(0.5+0.85*diff)+pale*fres*0.5+vec3(0.5,0.9,1.0)*spec*0.5+vec3(0.25,0.7,1.0)*smoothstep(0.3,1.0,n.y)*0.22;
    if(vP.y<0.8){col*=0.62;col+=vec3(0.15,0.5,1.0)*smoothstep(0.85,1.0,sin(vP.y*34.0+vP.x*14.0)*0.5+0.5)*0.22*(1.0-fres);}   // cuello: sombra y plumón\n    col+=vec3(0.1,0.4,0.9)*smoothstep(0.93,1.0,sin(vP.y*55.0+uTime*1.2)*0.5+0.5)*0.04;
    if(vTone>0.5&&vTone<2.5){col=vec3(0.95,0.74,0.34)*(0.45+0.75*diff)+vec3(1.0,0.9,0.6)*spec*0.6;}
    if(vTone>2.5){col=vec3(0.6,1.0,1.0);}
  #elif MODE==3
    float e=abs(vU-0.5)*2.0;
    col=vec3(0.22,0.72,1.0);
    a=0.02+0.26*fres+0.2*smoothstep(0.7,1.0,e)*step(vU,0.995);
  #else
    float e=abs(vU-0.5)*2.0;
    float edge=smoothstep(0.7,1.0,e);
    float tick=step(0.96,fract(vT*120.0))*(1.0-e)*0.5;
    col=mix(vec3(0.05,0.42,0.95),vec3(0.2,0.8,1.0),edge)+vec3(0.1,0.5,0.8)*tick;
    col=mix(col,gold,vTone);
    a=0.06+0.34*edge+0.14*tick;
  #endif
  col=mix(col,gold,rc*0.5);
  float ring=1.0-smoothstep(0.0,0.4,uReveal-dist);          // borde de la onda de materialización
  col+=vec3(0.3,0.85,1.0)*ring*step(uReveal,20.0)*1.2;
  gl_FragColor=vec4(col*uOpacity,a);
}`;

function holoMaterial(mode:0|1|2|3,shared:Shared){
 const opaque=mode===0||mode===1;
 return new THREE.ShaderMaterial({defines:{MODE:mode},vertexShader:VERT,fragmentShader:FRAG,uniforms:shared.u as unknown as {[k:string]:THREE.IUniform},
  transparent:!opaque,depthWrite:opaque,side:THREE.DoubleSide,blending:opaque?THREE.NoBlending:THREE.AdditiveBlending});
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

// ─── Modelo artístico (GLB de Blender): cristal azul con filo cian, cuerpo opaco con borde, anillo aditivo ───
const GVERT=`
attribute float aU,aT,aPhase,aTone,aLayer;
uniform float uTime;
varying float vU,vT,vTone,vPh;varying vec3 vP,vN,vV;
void main(){
  vU=aU;vT=aT;vTone=aTone;vPh=aPhase;vP=position;
  vec3 p=position;
  #if MODE==4
    float ang=sin(uTime*0.55+aPhase*7.0)*0.018*aT;
    vec2 c=vec2(0.1,0.3);vec2 d=p.xy-c;float cs=cos(ang),sn=sin(ang);
    p.xy=c+vec2(d.x*cs-d.y*sn,d.x*sn+d.y*cs);
    p.z+=sin(uTime*0.9+aPhase*9.0+aT*4.0)*0.05*aT;
  #endif
  vec4 mv=modelViewMatrix*vec4(p,1.0);
  vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);
  gl_Position=projectionMatrix*mv;
}`;
const GFRAG=`
uniform float uTime,uReveal,uLost,uRec,uCell,uOpacity;
varying float vU,vT,vTone,vPh;varying vec3 vP,vN,vV;
float h3(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){
  float dist=length(vP.xy-vec2(${GLB_HEAD[0].toFixed(2)},${GLB_HEAD[1].toFixed(2)}));
  if(dist>uReveal)discard;                                  // la materialización avanza desde la cabeza
  float hh=h3(floor(vP/uCell));
  if(hh<uLost)discard;                                      // registros perdidos: celdas disueltas
  float rc=step(uLost,hh)*step(hh,uLost+uRec);              // recuperados con daño: tinte dorado
  vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;
  vec3 v=normalize(vV);
  float fres=pow(1.0-clamp(dot(n,v),0.0,1.0),2.0);
  vec3 gold=vec3(0.95,0.76,0.38),cy=vec3(0.35,0.95,1.0),deep=vec3(0.01,0.08,0.6),mid=vec3(0.12,0.62,1.0);
  bool solid=vU<-0.5;
  float e=abs(vU-0.5)*2.0;
  float edge=smoothstep(0.78,1.0,e);
  float rib=1.0-smoothstep(0.0,0.05,e);
  float vein=smoothstep(0.82,0.97,sin(vT*34.0+e*9.0)*0.5+0.5)*(1.0-e);
  vec3 col;float a=1.0;
  #if MODE==4
    vec3 base=mix(deep,mid,smoothstep(0.0,0.7,vT))*(0.85+0.3*fract(vPh*7.13));
    col=base*0.6+cy*edge*0.85+vec3(0.5,0.9,1.0)*(rib*0.22+vein*0.14)+cy*fres*0.22;
    col=mix(col,gold*(0.7+0.5*edge),vTone*0.85);
    a=0.36+0.5*edge+0.14*rib;
  #elif MODE==5
    if(vTone>2.5){col=vec3(0.75,1.0,1.0)*1.5;}
    else if(solid){
      col=mix(vec3(0.004,0.05,0.4),cy*0.9,pow(fres,1.4))+vec3(0.05,0.25,0.9)*(0.15+0.45*max(n.y,0.0));
      col+=vec3(0.1,0.4,0.9)*smoothstep(0.93,1.0,sin(vP.y*50.0)*0.5+0.5)*0.07;
      col=mix(col,gold*(0.5+0.5*max(dot(n,normalize(vec3(-0.3,0.7,0.6))),0.0)+0.3),step(0.5,vTone));
    }else{
      col=mix(deep,mid,smoothstep(0.0,0.7,vT))*0.7+cy*edge*0.8+vec3(0.5,0.9,1.0)*rib*0.2;
    }
  #else
    col=mix(vec3(0.05,0.3,1.0),cy,fres*0.7)*0.85;a=0.5;
  #endif
  col=mix(col,gold,rc*0.45);
  float ring=1.0-smoothstep(0.0,0.4,uReveal-dist);          // borde de la onda de materialización
  col+=vec3(0.3,0.85,1.0)*ring*step(uReveal,20.0)*1.1;
  gl_FragColor=vec4(col*uOpacity,a);
}`;
function glbMaterial(mode:4|5|6,shared:Shared){
 const opaque=mode===5;
 return new THREE.ShaderMaterial({defines:{MODE:mode},vertexShader:GVERT,fragmentShader:GFRAG,uniforms:shared.u as unknown as {[k:string]:THREE.IUniform},
  transparent:!opaque,depthWrite:opaque,side:THREE.DoubleSide,blending:opaque?THREE.NoBlending:THREE.AdditiveBlending});
}

/** Partes del emblema: el GLB cuando está cargado; la geometría procedural solo si el GLB falla. */
let proc:ReturnType<typeof buildQ>|null=null;
const getProc=()=>proc??(proc=buildQ());
export function useQuetzalParts():{source:'glb'|'procedural'|null;parts:QPart[]|null}{
 const s=useSyncExternalStore(subscribeGlb,getGlbState,getGlbState);
 useEffect(()=>{loadGlb();},[]);
 return s.status==='ready'?{source:'glb',parts:s.parts}:s.status==='failed'?{source:'procedural',parts:getProc().parts}:{source:null,parts:null};
}

export function Aura({shared,fractions,quality,opacity=1,reducedMotion,forceComplete=false}:{shared:Shared;fractions:Fractions;quality:Quality;opacity?:number;reducedMotion:boolean;forceComplete?:boolean}){
 const dpr=useThree(s=>s.viewport.dpr);
 const {parts}=useQuetzalParts();
 const cloud=useMemo(()=>{if(!parts)return null;const s=sampleSurface(parts,AURA_COUNT[quality]);return cloudFromSamples(s.points,s.gold,fractions);},[parts,quality,fractions]);
 const geo=useMemo(()=>{
  if(!cloud)return null;
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(cloud.target,3));
  g.setAttribute('aStart',new THREE.BufferAttribute(cloud.start,3));
  g.setAttribute('aDelay',new THREE.BufferAttribute(cloud.delay,1));
  g.setAttribute('aKind',new THREE.BufferAttribute(Float32Array.from(cloud.kind),1));
  g.setAttribute('aState',new THREE.BufferAttribute(Float32Array.from(cloud.state),1));
  return g;
 },[cloud]);
 useEffect(()=>()=>{geo?.dispose();},[geo]);
 const uniforms=useMemo(()=>({uProgress:{value:0},uTime:{value:0},uSize:{value:24},uPixelRatio:{value:1},uOpacity:{value:1}}),[]);
 const ref=useRef<THREE.ShaderMaterial>(null);
 useFrame(()=>{
  const r=shared.u.uReveal.value;
  const progress=r>=REVEAL_DONE||reducedMotion||forceComplete?1:Math.min(1,Math.max(0,(r-REVEAL_FROM)/(REVEAL_TO-REVEAL_FROM)));
  writeAura(ref.current,{progress,time:reducedMotion?0:shared.u.uTime.value,pixelRatio:dpr,opacity});
 });
 if(!geo)return null;
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
export function DataTiles({counts,paused,reduced,decorative=false}:{counts:Fractions;paused:boolean;reduced:boolean;decorative?:boolean}){
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
  <boxGeometry args={[1,1,0.05]}/><meshBasicMaterial transparent opacity={decorative?0.32:0.7} blending={THREE.AdditiveBlending} depthWrite={false}/>
 </instancedMesh>;
}

/** Sin evidencia las teselas son decorativas (tenues, todas del mismo estado); con evidencia reflejan el reparto real. */
const decorative0=(hasData:boolean,f:Fractions):Fractions=>hasData?f:{intact:1,recovered:0,lost:0};

// ─── Composición ─────────────────────────────────────────────────────────────
/** Recentra el modelo del GLB (centro ~(-0.4,0.2)) sobre el encuadre y la plataforma del hero. */
const GLB_OFFSET:[number,number,number]=[0.9,-0.1,0];
export function QuetzalQ({shared,fractions,quality,paused,reduced,runId,hasData,motion=true}:{shared:Shared;fractions:Fractions;quality:Quality;paused:boolean;reduced:boolean;runId:number;hasData:boolean;motion?:boolean}){
 const {source,parts}=useQuetzalParts();
 const mats=useMemo(()=>({0:holoMaterial(0,shared),1:holoMaterial(1,shared),2:holoMaterial(2,shared),3:holoMaterial(3,shared),4:glbMaterial(4,shared),5:glbMaterial(5,shared),6:glbMaterial(6,shared)}),[shared]);
 useEffect(()=>()=>{Object.values(mats).forEach(m=>m.dispose());},[mats]);
 useEffect(()=>{setFractions(shared,fractions);},[shared,fractions]);
 const root=useRef<THREE.Group>(null),globe=useRef<THREE.Object3D>(null);
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
   {source==='glb'&&<group position={GLB_OFFSET}>{parts!.map(p=>{
    if(p.kind==='globo'){const c=p.geometry.userData.center as [number,number,number];
     return <mesh key={p.id} ref={globe} geometry={p.geometry} position={c} frustumCulled={false} renderOrder={2}><meshBasicMaterial color="#2cc7fa" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>;}
    return <mesh key={p.id} geometry={p.geometry} material={p.kind==='pluma'?mats[4]:p.kind==='solido'?mats[5]:mats[6]} frustumCulled={false} renderOrder={p.kind==='solido'?1:p.kind==='anillo'?2:3}/>;})}</group>}
   {source==='procedural'&&parts!.map(p=>p.kind==='globo'
    ?<lineSegments key={p.id} ref={globe as React.Ref<THREE.LineSegments>} geometry={p.geometry} position={[1.4,-0.25,-0.8]} frustumCulled={false}><lineBasicMaterial color="#2cc7fa" transparent opacity={0.24} blending={THREE.AdditiveBlending} depthWrite={false}/></lineSegments>
    :<group key={p.id}><mesh geometry={p.geometry} material={matFor(p.kind)} frustumCulled={false} renderOrder={p.kind==='anillo'?1:2}/>{(p.kind==='pluma'||p.kind==='solido')&&<mesh geometry={p.geometry} material={mats[3]} frustumCulled={false} renderOrder={3} scale={1.012}/>}</group>)}   <Aura shared={shared} fractions={fractions} quality={quality} reducedMotion={reduced}/>
   <DataTiles counts={decorative0(hasData,fractions)} paused={paused} reduced={reduced} decorative={!hasData}/>
  </group>
  <Pedestal/>
 </>;
}
















