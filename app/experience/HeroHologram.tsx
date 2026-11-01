'use client';
/**
 * Holograma principal del Dashboard. Ligero por defecto: muestra el LOGOTIPO OFICIAL como póster y solo
 * descarga la escena 3D (chunk pesado) cuando el hero entra en pantalla y el dispositivo soporta WebGL.
 * Sin WebGL el logotipo permanece como fallback permanente. Lee el estado real del motor vía sceneStore.
 */
import dynamic from 'next/dynamic';
import {Component,useCallback,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {pickQuality,type Quality} from '../../lib/experience';
import {sceneStore} from '../../lib/sceneStore';
import {tr} from '../../lib/i18n';

const HeroCanvas=dynamic(()=>import('./HeroCanvas'),{ssr:false});
const EMBLEM={intact:1,recovered:0,lost:0};

interface Caps{webgl:boolean;reduced:boolean;interactive:boolean;quality:Quality}
let capsCache:Caps|null=null;
function readCaps():Caps|null{
 if(typeof window==='undefined')return null;
 if(capsCache)return capsCache;
 let webgl=false;
 try{const c=document.createElement('canvas');const gl=(c.getContext('webgl2')||c.getContext('webgl')) as WebGLRenderingContext|null;webgl=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{webgl=false;}
 const params=new URLSearchParams(window.location.search);
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches||params.get('motion')==='reduced';
 const q=params.get('q');
 const nav=navigator as Navigator&{deviceMemory?:number};
 capsCache={webgl,reduced,interactive:window.innerWidth>=768,quality:pickQuality({width:window.innerWidth,cores:nav.hardwareConcurrency,memoryGb:nav.deviceMemory,reducedMotion:reduced},q)};
 return capsCache;
}
const noop=()=>()=>{};

/** Si la escena falla al renderizar, el hero conserva el logotipo oficial. */
class Boundary extends Component<{onError:()=>void;children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(){this.props.onError();}
 render(){return this.state.failed?null:this.props.children;}
}

export default function HeroHologram({onOpen}:{onOpen:()=>void}){
 const scene=useSyncExternalStore(sceneStore.subscribe,sceneStore.get,()=>null);
 const caps=useSyncExternalStore(noop,readCaps,()=>null);
 const box=useRef<HTMLDivElement>(null);
 const [seen,setSeen]=useState(false);
 const [inView,setInView]=useState(false);
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  const el=box.current;if(!el)return;
  const io=new IntersectionObserver(([e])=>{setInView(e.isIntersecting);if(e.isIntersecting)setSeen(true);},{threshold:0.35});
  io.observe(el);return()=>io.disconnect();
 },[]);

 const [failed,setFailed]=useState(false);
 const onLost=useCallback(()=>{setFailed(true);setReady(false);},[]);
 const use3d=!!caps?.webgl&&seen&&!failed;
 const fr=scene?scene.fractions:EMBLEM;
 const hasData=!!scene&&scene.stats.declared>0;
 const s=scene?.stats;
 return <div className="hero-holo" ref={box} data-ready={ready?'1':'0'}>
  {/* Logotipo oficial: póster mientras carga y fallback si no hay WebGL */}
  <img className="hero-poster" src="/quetzal-logo.png" alt={tr('Logo oficial de Quetzal Afterlife')} aria-hidden={ready}/>
  {use3d&&caps&&<div className="hero-canvas" role="img" aria-label={tr('Quetzal holográfico tridimensional. Arrastra para girarlo.')}>
   <Boundary onError={onLost}><HeroCanvas fractions={fr} hasData={hasData} quality={caps.quality} active={inView&&!caps.reduced} reduced={caps.reduced} interactive={caps.interactive} onFirstFrame={()=>setReady(true)} onLost={onLost}/></Boundary>
  </div>}
  {ready&&<img className="hero-badge" src="/quetzal-logo.png" alt={tr('Logo oficial de Quetzal Afterlife')}/>}
  <div className="hero-overlay">
   <p className="hero-caption" aria-live="polite">
    {s&&scene
     ?<>{scene.synthetic&&<span className="demo-badge">{tr('SINTÉTICO')}</span>} {tr('ESTADO REAL DEL MOTOR ·')} {s.intact} {tr('íntegros ·')} {s.recovered} {tr('recuperados con daño ·')} <b style={{color:s.lost?'#ff9a9a':undefined}}>{s.lost} {tr('perdidos')}</b></>
     :<>{tr('EMBLEMA · el holograma refleja datos reales cuando cargas evidencia')}</>}
   </p>
   <div className="hero-actions">
    <button className="primary" style={{marginTop:0}} onClick={onOpen}>{tr('✦ Ver resurrección')}</button>
    {ready&&caps?.interactive&&<span className="hero-hint">{tr('Arrastra para girar')}</span>}
   </div>
  </div>
 </div>;
}


