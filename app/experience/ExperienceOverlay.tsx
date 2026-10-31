'use client';
/**
 * «Ver resurrección»: capa a pantalla completa con la escena holográfica 3D (WebGL, carga diferida)
 * y un fallback 2D accesible. Solo recibe un SceneModel ya calculado: no conoce el motor.
 */
import dynamic from 'next/dynamic';
import {Component,useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {STAGES,STAGE_LABEL,pickQuality,stepDown,type Quality,type SceneModel,type Stage} from '../../lib/experience';

const HoloScene=dynamic(()=>import('./HoloScene'),{ssr:false,loading:()=><p className="exp-loading" role="status">Cargando escena 3D…</p>});

class Boundary extends Component<{onError:()=>void;children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onError();}
 render(){return this.state.failed?null:this.props.children;}
}

function hasWebGL():boolean{
 try{
  const c=document.createElement('canvas');
  const gl=(c.getContext('webgl2')||c.getContext('webgl')) as WebGLRenderingContext|null;
  if(!gl)return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
 }catch{return false;}
}

function StageFacts({scene,stage}:{scene:SceneModel;stage:Stage}){
 const s=scene.stats;
 return <div className="exp-facts">
  {stage==='materializar'&&<ul><li>Íntegros: {s.intact}</li><li>Recuperados con daño: {s.recovered}</li><li>Perdidos (no se materializan): {s.lost}</li><li>Declarados: {s.declared}</li></ul>}
  {stage==='discovery'&&<table><thead><tr><th>Archivo</th><th>Formato</th><th>SHA-256</th><th>Estado</th></tr></thead><tbody>{scene.files.map(f=><tr key={f.id}><td>{f.label}</td><td>{f.format}</td><td>{f.shortHash}…</td><td>{f.damaged?`${f.findings} daño(s)`:'sin daños detectados'}</td></tr>)}</tbody></table>}
  {stage==='recovery'&&<table><thead><tr><th>Tabla</th><th>Íntegros</th><th>Recuperados</th><th>Perdidos</th><th>Celdas desconocidas</th></tr></thead><tbody>{scene.columns.map(c=><tr key={c.table}><td>{c.table}</td><td>{c.intact}</td><td>{c.recovered}</td><td>{c.lost}</td><td>{c.unknownCells}</td></tr>)}</tbody></table>}
  {stage==='reconstruction'&&<table><thead><tr><th>Relación</th><th>Cardinalidad</th><th>Confianza</th><th>Aprobada</th><th>Huérfanos</th></tr></thead><tbody>{scene.graph.edges.map(e=><tr key={e.id}><td>{e.id}</td><td>{e.cardinality}</td><td>{e.confidence}</td><td>{e.approved?'sí':'no'}</td><td>{e.orphans}</td></tr>)}</tbody></table>}
  {stage==='studio'&&<table><thead><tr><th>Tabla reconstruida</th><th>Registros</th><th>Evidencia de origen</th></tr></thead><tbody>{scene.graph.nodes.map(n=><tr key={n.id}><td>{n.id}</td><td>{n.rows}</td><td>{n.source}</td></tr>)}</tbody></table>}
  {stage==='vault'&&<ul><li>Validaciones correctas: {s.integrityOk}</li><li>Advertencias: {s.integrityWarn}</li><li>Fallas: {s.integrityFail}</li><li>Registros perdidos: {s.lost}</li><li>Celdas desconocidas: {s.unknownCells}</li><li>Excluidos registrados: {s.excluded}</li></ul>}
 </div>;
}

function Fractions({scene}:{scene:SceneModel}){
 const f=scene.fractions;
 return <svg viewBox="0 0 400 26" className="exp-bar" role="img" aria-label={`Íntegros ${(f.intact*100).toFixed(1)} %, recuperados ${(f.recovered*100).toFixed(1)} %, perdidos ${(f.lost*100).toFixed(1)} %`}>
  <rect x="0" y="4" width={400*f.intact} height="18" fill="#2cc7fa"/><rect x={400*f.intact} y="4" width={400*f.recovered} height="18" fill="#d3b273"/><rect x={400*(f.intact+f.recovered)} y="4" width={400*f.lost} height="18" fill="#ff7a7a"/>
 </svg>;
}

export default function ExperienceOverlay({scene,initialStage,onClose,onLoadScenario}:{scene:SceneModel|null;initialStage:Stage;onClose:()=>void;onLoadScenario:()=>void}){
 const [stage,setStage]=useState<Stage>(initialStage);
 const [tour,setTour]=useState(true);
 const [paused,setPaused]=useState(false);
 const [autoRotate,setAutoRotate]=useState(true);
 const [explore,setExplore]=useState(false);
 const [force2d,setForce2d]=useState(false);
 const [failed,setFailed]=useState(false);
 const [runId,setRunId]=useState(0);
 const [notice,setNotice]=useState('');
 const [webgl]=useState(()=>typeof document!=='undefined'&&hasWebGL());
 const [reduced]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [quality,setQuality]=useState<Quality>(()=>pickQuality({width:window.innerWidth,cores:navigator.hardwareConcurrency,memoryGb:(navigator as Navigator&{deviceMemory?:number}).deviceMemory,reducedMotion:reduced},new URLSearchParams(window.location.search).get('q')));
 const closeRef=useRef<HTMLButtonElement>(null);
 const low=useRef(0);
 const use3d=webgl&&!force2d&&!failed&&!!scene;

 useEffect(()=>{closeRef.current?.focus();},[]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[onClose]);
 // Recorrido automático por las etapas (se detiene al pausar o al explorar)
 useEffect(()=>{
  if(!tour||paused||explore||reduced||!scene)return;
  const i=STAGES.indexOf(stage);
  if(i>=STAGES.length-1){const t=setTimeout(()=>setTour(false),6000);return()=>clearTimeout(t);}
  const t=setTimeout(()=>setStage(STAGES[i+1]),stage==='materializar'?7000:6000);
  return()=>clearTimeout(t);
 },[tour,paused,explore,reduced,stage,scene]);

 const onFps=useCallback((fps:number)=>{
  if(document.visibilityState!=='visible')return;
  low.current=fps<24?low.current+1:0;
  if(low.current>=6){low.current=0;setQuality(q=>{const n=stepDown(q);if(n!==q)setNotice(`Rendimiento bajo (${fps.toFixed(0)} fps): calidad reducida a «${n}».`);return n;});}
 },[]);
 const onLost=useCallback(()=>{setFailed(true);setNotice('Se perdió el contexto WebGL: se muestra la vista 2D equivalente.');},[]);
 const pick=(s:Stage)=>{setTour(false);setStage(s);if(s==='materializar')setRunId(r=>r+1);};
 const restart=()=>{setStage('materializar');setRunId(r=>r+1);setTour(true);setPaused(false);};
 const sceneKey=useMemo(()=>`${quality}`,[quality]);

 return <div className="exp-overlay" role="dialog" aria-modal="true" aria-label="Experiencia de resurrección">
  <div className="exp-top">
   <div><span className="kicker">QUETZAL / RESURRECCIÓN</span><h2>{STAGE_LABEL[stage]}<span className="gold">.</span></h2></div>
   <button ref={closeRef} className="secondary" onClick={onClose} aria-label="Cerrar la experiencia">Cerrar ✕</button>
  </div>
  {scene?.synthetic&&<p className="demo-banner exp-banner" role="note"><span className="demo-badge">SINTÉTICO</span> Comercial Quetzal 1998 — datos de demostración con daños controlados. La escena refleja el estado real del motor sobre esos datos.</p>}
  <div className="exp-stage">
   {!scene&&<div className="exp-empty"><p>Todavía no hay evidencia analizada. La escena se construye a partir del estado real del motor.</p><button className="primary" onClick={onLoadScenario}>Cargar escenario SINTÉTICO</button></div>}
   {scene&&use3d&&<Boundary onError={onLost}><HoloScene key={sceneKey} scene={scene} stage={stage} quality={quality} paused={paused} autoRotate={autoRotate} explore={explore} reducedMotion={reduced} runId={runId} onContextLost={onLost} onFps={onFps}/></Boundary>}
   {scene&&!use3d&&<div className="exp-fallback" data-testid="exp-fallback"><p className="muted" style={{display:'block'}}>{!webgl?'Este dispositivo no ofrece WebGL: vista 2D equivalente.':'Vista 2D equivalente.'}</p><Fractions scene={scene}/><StageFacts scene={scene} stage={stage}/></div>}
  </div>
  {scene&&<>
   <p className="exp-narrative" aria-live="polite">{scene.narrative[stage]}</p>
   {notice&&<p className="inv-warn-line" role="status">⚠ {notice}</p>}
   <div className="exp-controls" role="toolbar" aria-label="Controles de la experiencia">
    <div className="exp-tabs">{STAGES.map(s=><button key={s} className={s===stage?'active':''} onClick={()=>pick(s)} aria-pressed={s===stage}>{STAGE_LABEL[s]}</button>)}</div>
    <div className="exp-btns">
     <button className="secondary" onClick={()=>setPaused(p=>!p)} aria-pressed={paused}>{paused?'▶ Reanudar':'❚❚ Pausar'}</button>
     <button className="secondary" onClick={()=>setAutoRotate(r=>!r)} aria-pressed={autoRotate} disabled={!use3d}>⟳ Girar: {autoRotate?'sí':'no'}</button>
     <button className="secondary" onClick={()=>{setExplore(e=>!e);setTour(false);}} aria-pressed={explore} disabled={!use3d}>✥ Explorar: {explore?'sí':'no'}</button>
     <button className="secondary" onClick={restart}>↺ Reiniciar</button>
     <button className="secondary" onClick={()=>setForce2d(f=>!f)} disabled={!webgl} aria-pressed={force2d}>{force2d?'Ver 3D':'Ver 2D'}</button>
    </div>
    <span className="muted" style={{display:'block',marginTop:'8px'}}>{use3d?`Calidad ${quality}${reduced?' · movimiento reducido':''}. Arrastra para girar${explore?', rueda para acercar':''}.`:'Modo 2D'}</span>
   </div>
   {use3d&&<details className="exp-text"><summary>Datos de esta escena (texto)</summary><StageFacts scene={scene} stage={stage}/></details>}
  </>}
 </div>;
}
