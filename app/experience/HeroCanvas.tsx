'use client';
/** Escena WebGL del hero del Dashboard. Chunk pesado: solo se descarga cuando el hero es visible. */
import {useEffect,useMemo} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {QuetzalQ,makeShared,useQuetzalParts,type Fractions} from './QuetzalQ';
import type {Quality} from '../../lib/experience';

export interface PerfSample{fps:number;frames:number}
declare global{interface Window{__quetzalHero?:{fps:number;frames:number;calls:number;triangles:number;points:number;quality:string;samples:number[];azimuth:number};__quetzalSetView?:(azimuthDeg:number,polarDeg:number,distance?:number)=>void}}

/** Cámara en coordenadas esféricas (para capturas desde ángulos concretos y pruebas). */
function setSpherical(camera:{position:{set:(x:number,y:number,z:number)=>void};lookAt:(x:number,y:number,z:number)=>void},target:[number,number,number],az:number,pol:number,dist:number){
 const a=az*Math.PI/180,p=pol*Math.PI/180;
 camera.position.set(target[0]+dist*Math.sin(p)*Math.sin(a),target[1]+dist*Math.cos(p),target[2]+dist*Math.sin(p)*Math.cos(a));
 camera.lookAt(target[0],target[1],target[2]);
}
const TARGET:[number,number,number]=[0.5,-0.2,0];

/** Ajusta la distancia de cámara al ancho del contenedor: la composición (≈11,8 unidades de ancho) nunca se recorta, ni en móvil. */
function fitDistance(camera:{position:{x:number;y:number;z:number;set:(x:number,y:number,z:number)=>void};lookAt:(x:number,y:number,z:number)=>void},width:number,height:number){
 const aspect=width/Math.max(height,1),dist=Math.max(15.4,11.8/(2*Math.tan(18*Math.PI/180)*aspect));
 const dx=camera.position.x-TARGET[0],dy=camera.position.y-TARGET[1],dz=camera.position.z-TARGET[2],len=Math.hypot(dx,dy,dz)||1;
 camera.position.set(TARGET[0]+dx/len*dist,TARGET[1]+dy/len*dist,TARGET[2]+dz/len*dist);camera.lookAt(TARGET[0],TARGET[1],TARGET[2]);
}
function FitView(){
 const size=useThree(s=>s.size),get=useThree(s=>s.get);
 useEffect(()=>{fitDistance(get().camera,size.width,size.height);},[size.width,size.height,get]);
 return null;
}

function ViewHook(){
 const get=useThree(s=>s.get);
 useEffect(()=>{
  window.__quetzalSetView=(az,pol,dist)=>{window.__quetzalHold=true;const st=get();const cur=Math.hypot(st.camera.position.x-TARGET[0],st.camera.position.y-TARGET[1],st.camera.position.z-TARGET[2]);setSpherical(st.camera,TARGET,az,pol,dist??cur);(st.controls as unknown as {update?:()=>void}|null)?.update?.();st.invalidate();};
  return()=>{delete window.__quetzalSetView;};
 },[get]);
 return null;
}

function Probe({quality,active}:{quality:Quality;active:boolean}){
 const gl=useThree(s=>s.gl);const get=useThree(s=>s.get);
 useEffect(()=>{
  if(!active)return;
  const samples:number[]=[];let frames=0,last=performance.now(),n=0,raf=0;
  const loop=()=>{
   frames++;n++;const now=performance.now();
   if(now-last>=500){const fps=n/((now-last)/1000);samples.push(Math.round(fps));if(samples.length>40)samples.shift();const i=gl.info;
    window.__quetzalHero={fps:Math.round(fps*10)/10,frames,calls:i.render.calls,triangles:i.render.triangles,points:i.render.points,quality,samples:[...samples],azimuth:Math.round(Math.atan2(get().camera.position.x,get().camera.position.z)*180/Math.PI)};n=0;last=now;}
   raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  return()=>cancelAnimationFrame(raf);
 },[gl,get,quality,active]);
 return null;
}

/** Con las placas 2.5D el giro se limita (paralaje de ~±15°) para no deformar la composición; con modelos 3D, ±51°. */
function Controls(){
 const {source}=useQuetzalParts();const az=source==='plates'?0.27:0.9,pol=source==='plates'?0.04:0.06;
 return <OrbitControls makeDefault target={TARGET} enableDamping dampingFactor={0.08} enableZoom={false} enablePan={false}
  minAzimuthAngle={-az} maxAzimuthAngle={az} minPolarAngle={Math.PI*(0.5-pol)} maxPolarAngle={Math.PI*(0.5+pol)}/>;
}

/** El póster (logo) se mantiene hasta que el modelo 3D está cargado: nunca se muestra un lienzo vacío. */
function ReadyGate({onReady}:{onReady:()=>void}){
 const {source}=useQuetzalParts();
 useEffect(()=>{if(source)onReady();},[source,onReady]);
 return null;
}

/** Pérdida REAL de contexto: el escuchador se retira al desmontar (R3F fuerza la pérdida al destruir el Canvas). */
function ContextGuard({onLost}:{onLost:()=>void}){
 const gl=useThree(s=>s.gl);
 useEffect(()=>{
  const el=gl.domElement,h=(e:Event)=>{e.preventDefault();onLost();};
  el.addEventListener('webglcontextlost',h);return()=>el.removeEventListener('webglcontextlost',h);
 },[gl,onLost]);
 return null;
}

export default function HeroCanvas({fractions,hasData,quality,active,reduced,interactive,onFirstFrame,onLost}:{fractions:Fractions;hasData:boolean;quality:Quality;active:boolean;reduced:boolean;interactive:boolean;onFirstFrame:()=>void;onLost:()=>void}){
 const shared=useMemo(()=>makeShared(),[]);
 const dprMax=quality==='alta'?1.75:quality==='media'?1.4:1;
 return <Canvas dpr={[1,dprMax]} camera={{position:[0.5,-0.2,15.4],fov:36}} frameloop={active?'always':'demand'}
   gl={{antialias:quality!=='baja',powerPreference:'high-performance',alpha:true}}
   onCreated={({gl,camera})=>{gl.setClearColor(0x000000,0);camera.lookAt(TARGET[0],TARGET[1],TARGET[2]);}}
   style={{width:'100%',height:'100%',touchAction:interactive?'none':'pan-y'}} aria-hidden="true">
  <QuetzalQ shared={shared} fractions={fractions} quality={quality} paused={!active} reduced={reduced} runId={0} hasData={hasData}/>
  {interactive&&<Controls/>}
  <ViewHook/><FitView/><ReadyGate onReady={onFirstFrame}/><ContextGuard onLost={onLost}/><Probe quality={quality} active={active}/>
 </Canvas>;
}




