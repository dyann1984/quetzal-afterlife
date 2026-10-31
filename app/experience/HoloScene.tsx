'use client';
/**
 * Escena WebGL (React Three Fiber). Solo VISUALIZA el SceneModel; no importa el motor.
 * Se carga de forma diferida (dynamic import) para no penalizar la carga inicial.
 */
import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import * as THREE from 'three';
import type {Quality,SceneModel,Stage,Vec3} from '../../lib/experience';
import {AURA_COUNT,Aura,QuetzalQ,makeShared} from './QuetzalQ';

const BLUE=new THREE.Color('#2cc7fa'),GOLD=new THREE.Color('#d3b273'),RED=new THREE.Color('#ff7a7a'),DIM=new THREE.Color('#3b566a');

export interface PerfSample{fps:number;frames:number;drawCalls:number;triangles:number;points:number;geometries:number;textures:number;particles:number;dpr:number}
declare global{interface Window{__quetzalPerf?:PerfSample&{quality:string;stage:string;samples:number[]}}}

export interface HoloProps{
 scene:SceneModel;stage:Stage;quality:Quality;paused:boolean;autoRotate:boolean;explore:boolean;reducedMotion:boolean;runId:number;
 onContextLost:()=>void;onFps:(fps:number)=>void;
}

/** Rótulo como sprite con textura propia (canvas 2D local): sin portales al DOM ni fuentes externas. */
function Label({txt,sub,warn}:{txt:string;sub?:string;warn?:boolean}){
 const tex=useMemo(()=>{
  const c=document.createElement('canvas');c.width=640;c.height=160;
  const g=c.getContext('2d')!;g.textAlign='center';g.textBaseline='middle';g.shadowColor='#000';g.shadowBlur=8;
  g.font='bold 54px Arial, sans-serif';g.fillStyle=warn?'#ff9a9a':'#e9edf1';g.fillText(txt,320,sub?56:80,620);
  if(sub){g.font='32px Arial, sans-serif';g.fillStyle='#8aa0b0';g.fillText(sub,320,116,620);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
 },[txt,sub,warn]);
 useEffect(()=>()=>{tex.dispose();},[tex]);
 return <sprite scale={[3.2,0.8,1]} renderOrder={10}><spriteMaterial map={tex} transparent depthTest={false} depthWrite={false}/></sprite>;
}
const label=(txt:string,sub?:string,warn?:boolean)=><Label txt={txt} sub={sub} warn={warn}/>;

function Files({scene,x=0,wire=false}:{scene:SceneModel;x?:number;wire?:boolean}){
 return <group position={[x,0,0]}>{scene.files.map(f=>{
  const geo=f.format==='dbf'?<boxGeometry args={[0.7,0.9,0.7]}/>:f.format==='csv'?<cylinderGeometry args={[0.4,0.4,0.9,6]}/>:<octahedronGeometry args={[0.55]}/>;
  return <group key={f.id} position={f.pos}>
   <mesh>{geo}<meshBasicMaterial color={f.damaged?GOLD:BLUE} wireframe transparent opacity={wire?0.55:0.9}/></mesh>
   {f.damaged&&<mesh position={[0,0,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[0.72,0.025,8,32]}/><meshBasicMaterial color={RED}/></mesh>}
   <mesh scale={0.5}>{geo}<meshBasicMaterial color={f.damaged?GOLD:BLUE} transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
   <group position={[0,-0.9,0]}>{label(f.label,`${f.format.toUpperCase()} · ${f.shortHash}…${f.damaged?` · ${f.findings} daño(s)`:''}`,f.damaged)}</group>
  </group>;})}</group>;
}

function Columns({scene}:{scene:SceneModel}){
 const kinds=useMemo(()=>{
  const m={intacto:[] as THREE.Matrix4[],recuperado:[] as THREE.Matrix4[],perdido:[] as THREE.Matrix4[]};
  for(const c of scene.columns)c.cubes.forEach((k,i)=>{m[k].push(new THREE.Matrix4().makeTranslation(c.pos[0],-1.9+i*0.12,c.pos[2]));});
  return m;
 },[scene.columns]);
 return <group>
  <Inst list={kinds.intacto} color={BLUE} opacity={0.9}/><Inst list={kinds.recuperado} color={GOLD} opacity={0.95}/><Inst list={kinds.perdido} color={RED} opacity={0.5} wire/>
  {scene.columns.map(c=><group key={c.table} position={[c.pos[0],-2.4,c.pos[2]]}>{label(c.table,`${c.intact} · ${c.recovered} · ${c.lost}${c.perCube>1?` (1 cubo = ${c.perCube})`:''}`,c.lost>0)}</group>)}
 </group>;
}
function Inst({list,color,opacity,wire=false}:{list:THREE.Matrix4[];color:THREE.Color;opacity:number;wire?:boolean}){
 const ref=useRef<THREE.InstancedMesh>(null);
 useLayoutEffect(()=>{const m=ref.current;if(!m)return;list.forEach((mx,i)=>m.setMatrixAt(i,mx));m.instanceMatrix.needsUpdate=true;},[list]);
 if(list.length===0)return null;
 return <instancedMesh ref={ref} args={[undefined,undefined,list.length]} key={list.length}><boxGeometry args={[0.5,0.1,0.5]}/><meshBasicMaterial color={color} transparent opacity={opacity} wireframe={wire} depthWrite={false} blending={THREE.AdditiveBlending}/></instancedMesh>;
}

function Lines({pairs,color,opacity}:{pairs:Array<[Vec3,Vec3]>;color:THREE.Color;opacity:number}){
 const geo=useMemo(()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pairs.flatMap(([a,b])=>[...a,...b]),3));return g;},[pairs]);
 useEffect(()=>()=>{geo.dispose();},[geo]);
 if(pairs.length===0)return null;
 return <lineSegments geometry={geo}><lineBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false}/></lineSegments>;
}

function Network({scene,x=0,s=1}:{scene:SceneModel;x?:number;s?:number}){
 const pos=useMemo(()=>new Map(scene.graph.nodes.map(n=>[n.id,n.pos])),[scene.graph.nodes]);
 const pairsOf=(ok:boolean):Array<[Vec3,Vec3]>=>scene.graph.edges.filter(e=>e.approved===ok).flatMap(e=>{const a=pos.get(e.from),b=pos.get(e.to);return a&&b?[[a,b] as [Vec3,Vec3]]:[];});
 const approved=useMemo(()=>pairsOf(true),[scene.graph]);const pending=useMemo(()=>pairsOf(false),[scene.graph]);// eslint-disable-line react-hooks/exhaustive-deps
 return <group position={[x,0,0]} scale={s}>
  <Lines pairs={approved} color={BLUE} opacity={0.95}/><Lines pairs={pending} color={DIM} opacity={0.5}/>
  {scene.graph.edges.map(e=>{const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)return null;
   return <group key={e.id}>
    <mesh position={[a[0]+(b[0]-a[0])*0.82,a[1]+(b[1]-a[1])*0.82,a[2]+(b[2]-a[2])*0.82]}><sphereGeometry args={[0.06,8,8]}/><meshBasicMaterial color={e.approved?BLUE:DIM}/></mesh>
    {e.orphans>0&&<mesh position={[(a[0]+b[0])/2,(a[1]+b[1])/2+0.15,(a[2]+b[2])/2]}><octahedronGeometry args={[0.07+0.03*Math.min(e.orphans,4)]}/><meshBasicMaterial color={RED}/></mesh>}
   </group>;})}
  {scene.graph.nodes.map(n=><group key={n.id} position={n.pos}>
   <mesh><sphereGeometry args={[0.18+0.05*Math.sqrt(n.rows),20,20]}/><meshBasicMaterial color={BLUE} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
   <mesh><sphereGeometry args={[0.18+0.05*Math.sqrt(n.rows),12,10]}/><meshBasicMaterial color={GOLD} wireframe/></mesh>
   <group position={[0,0.75,0]}>{label(n.id,`${n.rows} registros`)}</group>
  </group>)}
 </group>;
}

function Studio({scene}:{scene:SceneModel}){
 const filePos=useMemo(()=>new Map(scene.files.map(f=>[f.label,f.pos])),[scene.files]);
 const links=useMemo(()=>scene.graph.nodes.flatMap(n=>{const fp=filePos.get(n.source);if(!fp)return [];return [[[n.pos[0]*0.6-3.4,n.pos[1],n.pos[2]*0.6],[fp[0]*0.6+3.4,fp[1],fp[2]*0.6]] as [Vec3,Vec3]];}),[scene.graph.nodes,filePos]);
 return <group>
  <group position={[-3.4,0,0]} scale={0.6}><Network scene={scene}/></group>
  <group position={[3.4,0,0]} scale={0.6}><Files scene={scene} wire/></group>
  <Lines pairs={links} color={GOLD} opacity={0.35}/>
  <group position={[-3.4,2.1,0]}>{label('SISTEMA RECONSTRUIDO','relaciones inferidas y aprobadas')}</group>
  <group position={[3.4,2.1,0]}>{label('EVIDENCIA ORIGINAL','archivos sin modificar · SHA-256')}</group>
 </group>;
}

function Vault({scene}:{scene:SceneModel}){
 const f=scene.fractions;const arcs=[{k:'i',a:f.intact,c:BLUE},{k:'r',a:f.recovered,c:GOLD},{k:'l',a:f.lost,c:RED}];
 let acc=0;
 return <group>
  {arcs.map(a=>{const start=acc;acc+=a.a*Math.PI*2;return a.a>0?<mesh key={a.k} rotation={[0,0,Math.PI/2-start-a.a*Math.PI*2]}><torusGeometry args={[1.7,0.09,12,96,a.a*Math.PI*2]}/><meshBasicMaterial color={a.c}/></mesh>:null;})}
  <mesh><torusGeometry args={[1.7,0.012,6,96]}/><meshBasicMaterial color={DIM}/></mesh>
  {scene.files.map((fl,i)=>{const ang=i/Math.max(scene.files.length,1)*Math.PI*2;return <mesh key={fl.id} position={[Math.cos(ang)*2.4,Math.sin(ang)*2.4,0]} rotation={[0.5,0.5,0]}><boxGeometry args={[0.22,0.22,0.22]}/><meshBasicMaterial color={fl.damaged?GOLD:BLUE} wireframe/></mesh>;})}
  <group>{label(`${scene.stats.intact+scene.stats.recovered}/${scene.stats.declared}`,'registros leídos de los declarados')}</group>
  <group position={[0,-0.55,0]}>{label(`${scene.stats.lost} perdidos · ${scene.stats.unknownCells} celdas desconocidas`,`${scene.stats.integrityOk} ok · ${scene.stats.integrityWarn} avisos · ${scene.stats.integrityFail} fallas`,scene.stats.lost>0)}</group>
 </group>;
}

/** Detecta una pérdida REAL de contexto WebGL. El escuchador se retira al desmontar, porque
 *  R3F fuerza la pérdida de contexto al destruir el Canvas (p. ej. al cambiar a la vista 2D). */
function ContextGuard({onLost}:{onLost:()=>void}){
 const gl=useThree(s=>s.gl);
 useEffect(()=>{
  const el=gl.domElement;
  const h=(e:Event)=>{e.preventDefault();onLost();};
  el.addEventListener('webglcontextlost',h);
  return()=>el.removeEventListener('webglcontextlost',h);
 },[gl,onLost]);
 return null;
}

function PerfProbe({quality,stage,onFps}:{quality:Quality;stage:Stage;onFps:(f:number)=>void}){
 const {gl}=useThree();const acc=useRef({t:0,n:0,total:0,samples:[] as number[]});
 useFrame((_,dt)=>{
  const a=acc.current;a.t+=dt;a.n++;a.total++;
  if(a.t>=0.5){
   const fps=a.n/a.t;a.samples.push(Math.round(fps));if(a.samples.length>60)a.samples.shift();
   const i=gl.info;
   window.__quetzalPerf={fps:Math.round(fps*10)/10,frames:a.total,drawCalls:i.render.calls,triangles:i.render.triangles,points:i.render.points,geometries:i.memory.geometries,textures:i.memory.textures,particles:AURA_COUNT[quality],dpr:gl.getPixelRatio(),quality,stage,samples:[...a.samples]};
   onFps(fps);a.t=0;a.n=0;
  }
 });
 return null;
}

function Rig({stage,paused,autoRotate,explore,reducedMotion}:{stage:Stage;paused:boolean;autoRotate:boolean;explore:boolean;reducedMotion:boolean}){
 const t=useRef(0);
 useFrame(({camera},dt)=>{
  if(paused||reducedMotion||explore)return;
  t.current+=dt;const k=Math.min(1,dt*1.5);
  camera.position.y+=((stage==='materializar'?0.4:stage==='recovery'?0.9:0.5)+Math.sin(t.current*0.4)*0.25-camera.position.y)*k;
  // Más cerca en las etapas de datos; el quetzal completo necesita más distancia.
  const dist=Math.hypot(camera.position.x,camera.position.z),want=stage==='materializar'?11:7.5;
  if(dist>0.01){const f=1+((want-dist)*k)/dist;camera.position.x*=f;camera.position.z*=f;}
 });
 return <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate&&!paused&&!reducedMotion&&stage!=='materializar'} autoRotateSpeed={0.9} enablePan={explore} enableZoom={explore} minDistance={4} maxDistance={16}
  minAzimuthAngle={stage==='materializar'?-1.1:-Infinity} maxAzimuthAngle={stage==='materializar'?1.1:Infinity}
  minPolarAngle={stage==='materializar'?Math.PI*0.42:0} maxPolarAngle={stage==='materializar'?Math.PI*0.58:Math.PI*0.62}/>;
}

export default function HoloScene(p:HoloProps){
 const {scene,stage,quality}=p;
 const dprMax=quality==='alta'?2:quality==='media'?1.5:1;
 const shared=useMemo(()=>makeShared(),[]);
 const fractions=scene.fractions;
 const hasData=scene.stats.declared>0;
 return <Canvas dpr={[1,dprMax]} camera={{position:[0,0.4,11],fov:48}} frameloop={p.paused?'demand':'always'}
   gl={{antialias:quality!=='baja',powerPreference:'high-performance',alpha:true}}
   onCreated={({gl})=>{gl.setClearColor(0x000000,0);}}
   style={{width:'100%',height:'100%',touchAction:'none'}} aria-hidden="true">
  <Rig stage={stage} paused={p.paused} autoRotate={p.autoRotate} explore={p.explore} reducedMotion={p.reducedMotion}/>
  {stage==='materializar'
   ?<group position={[-0.62,0.5,0]} scale={1.08}><QuetzalQ shared={shared} fractions={fractions} quality={quality} paused={p.paused} reduced={p.reducedMotion} runId={p.runId} hasData={hasData}/></group>
   :<group position={[-0.3,0.2,-2.4] as Vec3} scale={0.45}><Aura shared={shared} fractions={fractions} quality={quality} opacity={0.28} reducedMotion={p.reducedMotion} forceComplete/></group>}
  {stage==='discovery'&&<Files scene={scene}/>}
  {stage==='recovery'&&<Columns scene={scene}/>}
  {stage==='reconstruction'&&<Network scene={scene}/>}
  {stage==='studio'&&<Studio scene={scene}/>}
  {stage==='vault'&&<Vault scene={scene}/>}
  <ContextGuard onLost={p.onContextLost}/>
  <PerfProbe quality={quality} stage={stage} onFps={p.onFps}/>
 </Canvas>;
}


