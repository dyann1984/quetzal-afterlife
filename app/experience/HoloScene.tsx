'use client';
/**
 * Escena WebGL (React Three Fiber). Solo VISUALIZA el SceneModel; no importa el motor.
 * Se carga de forma diferida (dynamic import) para no penalizar la carga inicial.
 */
import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import {OrbitControls,Html} from '@react-three/drei';
import * as THREE from 'three';
import {buildQuetzalCloud,PARTICLE_TIERS,type Quality,type SceneModel,type Stage,type Vec3} from '../../lib/experience';

const BLUE=new THREE.Color('#2cc7fa'),GOLD=new THREE.Color('#d3b273'),RED=new THREE.Color('#ff7a7a'),DIM=new THREE.Color('#3b566a');

export interface PerfSample{fps:number;frames:number;drawCalls:number;triangles:number;points:number;geometries:number;textures:number;particles:number;dpr:number}
declare global{interface Window{__quetzalPerf?:PerfSample&{quality:string;stage:string;samples:number[]}}}

export interface HoloProps{
 scene:SceneModel;stage:Stage;quality:Quality;paused:boolean;autoRotate:boolean;explore:boolean;reducedMotion:boolean;runId:number;
 onContextLost:()=>void;onFps:(fps:number)=>void;
}

const VERT=`
uniform float uProgress,uTime,uSize,uPixelRatio,uOpacity;
attribute vec3 aStart;attribute float aDelay,aKind,aState;
varying vec3 vColor;varying float vAlpha;
void main(){
  float p=clamp((uProgress-aDelay*0.65)/0.35,0.0,1.0);p=p*p*(3.0-2.0*p);
  float lost=step(1.5,aState),rec=step(0.5,aState)-lost;
  float pm=mix(p,0.0,lost);                 // las partículas de registros perdidos NO se materializan
  vec3 pos=mix(aStart,position,pm);
  float w=sin(uTime*1.1+position.y*2.3+position.x*1.7);
  pos+=vec3(w*0.018,cos(uTime*0.9+position.x*2.0)*0.014,w*0.012)*(1.0-lost*0.5);
  pos+=vec3(sin(uTime*0.35+aDelay*9.0),cos(uTime*0.3+aDelay*7.0),0.0)*0.18*lost*(0.6+0.4*p);
  vec4 mv=modelViewMatrix*vec4(pos,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=uSize*uPixelRatio*(1.0+0.6*step(2.5,aKind))*(1.0/-mv.z)*(1.0-0.35*lost);
  vec3 blue=vec3(0.17,0.78,0.98),gold=vec3(0.83,0.70,0.45),red=vec3(0.75,0.28,0.28);
  vec3 c=mix(blue,gold,step(2.5,aKind));
  c=mix(c,gold,rec*(0.55+0.45*sin(uTime*3.0+aDelay*20.0)));
  c=mix(c,red,lost);
  vColor=c;
  vAlpha=mix(0.95,0.28,lost)*smoothstep(0.0,0.08,p+lost)*uOpacity;
}`;
const FRAG=`
varying vec3 vColor;varying float vAlpha;
void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.0,d);gl_FragColor=vec4(vColor,a*vAlpha);}`;

/** Actualiza los uniforms del shader (efecto imperativo sobre un objeto de three, fuera del render de React). */
function writeUniforms(m:THREE.ShaderMaterial|null,v:{progress:number;time:number;pixelRatio:number;opacity:number}){
 if(!m)return;
 m.uniforms.uProgress.value=v.progress;m.uniforms.uTime.value=v.time;m.uniforms.uPixelRatio.value=v.pixelRatio;m.uniforms.uOpacity.value=v.opacity;
}

function QuetzalCloud({scene,quality,paused,reducedMotion,runId,scale,presence,position}:{scene:SceneModel;quality:Quality;paused:boolean;reducedMotion:boolean;runId:number;scale:number;presence:number;position:Vec3}){
 const dpr=useThree(s=>s.viewport.dpr);
 const cloud=useMemo(()=>buildQuetzalCloud(PARTICLE_TIERS[quality],scene.fractions),[quality,scene.fractions]);
 const geo=useMemo(()=>{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(cloud.target,3));
  g.setAttribute('aStart',new THREE.BufferAttribute(cloud.start,3));
  g.setAttribute('aDelay',new THREE.BufferAttribute(cloud.delay,1));
  g.setAttribute('aKind',new THREE.BufferAttribute(Float32Array.from(cloud.kind),1));
  g.setAttribute('aState',new THREE.BufferAttribute(Float32Array.from(cloud.state),1));
  g.computeBoundingSphere();g.boundingSphere!.radius=9;
  return g;
 },[cloud]);
 const uniforms=useMemo(()=>({uProgress:{value:0},uTime:{value:0},uSize:{value:34},uPixelRatio:{value:1},uOpacity:{value:1}}),[]);
 const matRef=useRef<THREE.ShaderMaterial>(null);
 const t0=useRef(0),time=useRef(0);
 useEffect(()=>{t0.current=0;const u=matRef.current?.uniforms;if(u)u.uProgress.value=reducedMotion?1:0;},[runId,reducedMotion]);
 useEffect(()=>()=>{geo.dispose();},[geo]);
 useFrame((_,dt)=>{
  if(paused)return;
  time.current+=reducedMotion?0:dt;t0.current+=dt;
  // La materialización dura 4,2 s; las partículas de registros perdidos nunca se ensamblan (ver shader).
  writeUniforms(matRef.current,{progress:reducedMotion?1:Math.min(1,t0.current/4.2),time:time.current,pixelRatio:dpr,opacity:presence});
 });
 return <points geometry={geo} scale={scale} position={position} frustumCulled={false}>
  <shaderMaterial ref={matRef} vertexShader={VERT} fragmentShader={FRAG} transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms}/>
 </points>;
}

function Scanner({paused,reducedMotion}:{paused:boolean;reducedMotion:boolean}){
 const ref=useRef<THREE.Mesh>(null);const t=useRef(0);
 useFrame((_,dt)=>{if(paused||reducedMotion||!ref.current)return;t.current+=dt*0.35;ref.current.position.y=-4.4+((t.current%1))*6.2;(ref.current.material as THREE.MeshBasicMaterial).opacity=0.22*Math.sin(Math.PI*(t.current%1));});
 return <>
  <mesh ref={ref} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[0.1,2.4,64]}/><meshBasicMaterial color={BLUE} transparent opacity={0.15} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false}/></mesh>
  <mesh position={[0,-4.55,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[2.2,2.28,96]}/><meshBasicMaterial color={GOLD} transparent opacity={0.8}/></mesh>
  <mesh position={[0,-4.55,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.4,1.43,96]}/><meshBasicMaterial color={BLUE} transparent opacity={0.5}/></mesh>
 </>;
}

const label=(txt:string,sub?:string,warn?:boolean)=><Html center distanceFactor={9} style={{pointerEvents:'none',whiteSpace:'nowrap',textAlign:'center',fontFamily:'Arial,sans-serif'}}>
 <div style={{color:warn?'#ff9a9a':'#e9edf1',fontSize:'13px',fontWeight:700,textShadow:'0 0 6px #000'}}>{txt}</div>{sub&&<div style={{color:'#8aa0b0',fontSize:'10px',textShadow:'0 0 6px #000'}}>{sub}</div>}</Html>;

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
  for(const c of scene.columns)c.cubes.forEach((k,i)=>{m[k].push(new THREE.Matrix4().makeTranslation(c.pos[0],-1.6+i*0.19,c.pos[2]));});
  return m;
 },[scene.columns]);
 return <group>
  <Inst list={kinds.intacto} color={BLUE} opacity={0.9}/><Inst list={kinds.recuperado} color={GOLD} opacity={0.95}/><Inst list={kinds.perdido} color={RED} opacity={0.5} wire/>
  {scene.columns.map(c=><group key={c.table} position={[c.pos[0],-2.05,c.pos[2]]}>{label(c.table,`${c.intact} · ${c.recovered} · ${c.lost}${c.perCube>1?` (1 cubo = ${c.perCube})`:''}`,c.lost>0)}</group>)}
 </group>;
}
function Inst({list,color,opacity,wire=false}:{list:THREE.Matrix4[];color:THREE.Color;opacity:number;wire?:boolean}){
 const ref=useRef<THREE.InstancedMesh>(null);
 useLayoutEffect(()=>{const m=ref.current;if(!m)return;list.forEach((mx,i)=>m.setMatrixAt(i,mx));m.instanceMatrix.needsUpdate=true;},[list]);
 if(list.length===0)return null;
 return <instancedMesh ref={ref} args={[undefined,undefined,list.length]} key={list.length}><boxGeometry args={[0.5,0.15,0.5]}/><meshBasicMaterial color={color} transparent opacity={opacity} wireframe={wire} depthWrite={false} blending={THREE.AdditiveBlending}/></instancedMesh>;
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

function PerfProbe({quality,stage,onFps}:{quality:Quality;stage:Stage;onFps:(f:number)=>void}){
 const {gl}=useThree();const acc=useRef({t:0,n:0,total:0,samples:[] as number[]});
 useFrame((_,dt)=>{
  const a=acc.current;a.t+=dt;a.n++;a.total++;
  if(a.t>=0.5){
   const fps=a.n/a.t;a.samples.push(Math.round(fps));if(a.samples.length>60)a.samples.shift();
   const i=gl.info;
   window.__quetzalPerf={fps:Math.round(fps*10)/10,frames:a.total,drawCalls:i.render.calls,triangles:i.render.triangles,points:i.render.points,geometries:i.memory.geometries,textures:i.memory.textures,particles:PARTICLE_TIERS[quality],dpr:gl.getPixelRatio(),quality,stage,samples:[...a.samples]};
   onFps(fps);a.t=0;a.n=0;
  }
 });
 return null;
}

function Rig({stage,paused,autoRotate,explore,reducedMotion}:{stage:Stage;paused:boolean;autoRotate:boolean;explore:boolean;reducedMotion:boolean}){
 const t=useRef(0);
 useFrame(({camera},dt)=>{
  if(paused||reducedMotion||explore)return;
  t.current+=dt;camera.position.y+=((stage==='materializar'?-0.4:0.6)+Math.sin(t.current*0.4)*0.25-camera.position.y)*Math.min(1,dt*1.5);
 });
 return <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={autoRotate&&!paused&&!reducedMotion} autoRotateSpeed={0.9} enablePan={explore} enableZoom={explore} minDistance={4} maxDistance={16} maxPolarAngle={Math.PI*0.62}/>;
}

export default function HoloScene(p:HoloProps){
 const {scene,stage,quality}=p;
 const dprMax=quality==='alta'?2:quality==='media'?1.5:1;
 const q=stage==='materializar'?{scale:1,presence:1,pos:[0,-0.6,0] as Vec3}:{scale:0.5,presence:0.3,pos:[0,-0.3,-2.2] as Vec3};
 return <Canvas dpr={[1,dprMax]} camera={{position:[0,0.4,9],fov:48}} frameloop={p.paused?'demand':'always'}
   gl={{antialias:quality!=='baja',powerPreference:'high-performance',alpha:true}}
   onCreated={({gl})=>{gl.setClearColor(0x000000,0);gl.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();p.onContextLost();});}}
   style={{width:'100%',height:'100%',touchAction:'none'}} aria-hidden="true">
  <Rig stage={stage} paused={p.paused} autoRotate={p.autoRotate} explore={p.explore} reducedMotion={p.reducedMotion}/>
  <QuetzalCloud scene={scene} quality={quality} paused={p.paused} reducedMotion={p.reducedMotion} runId={p.runId} scale={q.scale} presence={q.presence} position={q.pos}/>
  {stage==='materializar'&&<Scanner paused={p.paused} reducedMotion={p.reducedMotion}/>}
  {stage==='discovery'&&<Files scene={scene}/>}
  {stage==='recovery'&&<Columns scene={scene}/>}
  {stage==='reconstruction'&&<Network scene={scene}/>}
  {stage==='studio'&&<Studio scene={scene}/>}
  {stage==='vault'&&<Vault scene={scene}/>}
  <PerfProbe quality={quality} stage={stage} onFps={p.onFps}/>
 </Canvas>;
}
