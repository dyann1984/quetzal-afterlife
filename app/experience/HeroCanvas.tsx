'use client';
/** Escena WebGL del hero del Dashboard. Chunk pesado: solo se descarga cuando el hero es visible. */
import {useEffect,useMemo} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {QuetzalQ,makeShared,type Fractions} from './QuetzalQ';
import type {Quality} from '../../lib/experience';

export interface PerfSample{fps:number;frames:number}
declare global{interface Window{__quetzalHero?:{fps:number;frames:number;calls:number;triangles:number;points:number;quality:string;samples:number[];azimuth:number};__quetzalSetView?:(azimuthDeg:number,polarDeg:number,distance?:number)=>void}}

/** Cámara en coordenadas esféricas (para capturas desde ángulos concretos y pruebas). */
function setSpherical(camera:{position:{set:(x:number,y:number,z:number)=>void};lookAt:(x:number,y:number,z:number)=>void},target:[number,number,number],az:number,pol:number,dist:number){
 const a=az*Math.PI/180,p=pol*Math.PI/180;
 camera.position.set(target[0]+dist*Math.sin(p)*Math.sin(a),target[1]+dist*Math.cos(p),target[2]+dist*Math.sin(p)*Math.cos(a));
 camera.lookAt(target[0],target[1],target[2]);
}
const TARGET:[number,number,number]=[0.5,-0.55,0];

function ViewHook(){
 const get=useThree(s=>s.get);
 useEffect(()=>{
  window.__quetzalSetView=(az,pol,dist=14.5)=>{window.__quetzalHold=true;const st=get();setSpherical(st.camera,TARGET,az,pol,dist);(st.controls as unknown as {update?:()=>void}|null)?.update?.();st.invalidate();};
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
 return <Canvas dpr={[1,dprMax]} camera={{position:[0.5,-0.4,14.5],fov:36}} frameloop={active?'always':'demand'}
   gl={{antialias:quality!=='baja',powerPreference:'high-performance',alpha:true}}
   onCreated={({gl,camera})=>{gl.setClearColor(0x000000,0);camera.lookAt(TARGET[0],TARGET[1],TARGET[2]);onFirstFrame();}}
   style={{width:'100%',height:'100%',touchAction:interactive?'none':'pan-y'}} aria-hidden="true">
  <QuetzalQ shared={shared} fractions={fractions} quality={quality} paused={!active} reduced={reduced} runId={0} hasData={hasData}/>
  {interactive&&<OrbitControls makeDefault target={TARGET} enableDamping dampingFactor={0.08} enableZoom={false} enablePan={false}
    minAzimuthAngle={-0.9} maxAzimuthAngle={0.9} minPolarAngle={Math.PI*0.44} maxPolarAngle={Math.PI*0.56}/>}
  <ViewHook/><ContextGuard onLost={onLost}/><Probe quality={quality} active={active}/>
 </Canvas>;
}




