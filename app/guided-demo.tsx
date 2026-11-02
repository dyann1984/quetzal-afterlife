'use client';
/**
 * Demostración guiada de ~3 minutos para los jueces. Los pasos 3–7 NO son una animación: al llegar al paso 4 se ejecuta
 * el motor real sobre el archivo dañado y los pasos siguientes muestran su resultado verificado contra el original.
 */
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {buildLabExamples,runLab,type LabRun,type LabStage,type Bi} from '../lib/filerec/lab';
import {useUi} from '../lib/i18n';
import {Pic,save} from './resurrection-lab';

const B=(es:string,en:string):Bi=>({es,en});
interface Step{id:string;secs:number;title:Bi;body:Bi}
const STEPS:Step[]=[
 {id:'problem',secs:20,title:B('1 · El problema','1 · The problem'),body:B('Archivos de sistemas heredados, discos viejos y descargas cortadas llegan dañados: un CRC roto, una firma borrada, un corte a mitad. Las herramientas comunes responden «archivo corrupto» y ahí termina todo. QUETZAL pregunta algo distinto: ¿qué parte de esto sigue siendo verificablemente recuperable?','Files from legacy systems, old disks and cut-off downloads arrive damaged: a broken CRC, an erased signature, a cut in the middle. Common tools say “corrupt file” and stop. QUETZAL asks something different: which part of this is still verifiably recoverable?')},
 {id:'identity',secs:20,title:B('2 · Identidad: el quetzal que renace','2 · Identity: the quetzal that is reborn'),body:B('El quetzal simboliza la resurrección. El holograma del Dashboard refleja datos reales cuando cargas evidencia, y todo lo que ves está en azul eléctrico y dorado: azul para lo analizado, dorado para lo verificado.','The quetzal symbolises resurrection. The Dashboard hologram reflects real data when you load evidence, and everything is in electric blue and gold: blue for what was analysed, gold for what was verified.')},
 {id:'damaged',secs:20,title:B('3 · Un archivo digital dañado','3 · A damaged digital file'),body:B('Este PNG tiene 3 bytes alterados en campos de control (CRC-32). Los píxeles siguen dentro, pero los visores estrictos lo rechazan. Es un archivo sintético con su original de referencia, que usaremos solo para comprobar el resultado.','This PNG has 3 bytes altered in control fields (CRC-32). The pixels are still inside, but strict viewers reject it. It is a synthetic file with a reference original that we will use only to check the result.')},
 {id:'analysis',secs:25,title:B('4 · Análisis y recuperación reales','4 · Real analysis and recovery'),body:B('Ahora el motor procesa los bytes reales en tu navegador: SHA-256, identificación por firma, análisis de chunks, validación CRC-32, descompresión Deflate con Adler-32 y reparación. Los tiempos son los medidos.','The engine now processes the real bytes in your browser: SHA-256, signature identification, chunk analysis, CRC-32 validation, Deflate decompression with Adler-32 and repair. The timings are the measured ones.')},
 {id:'compare',secs:25,title:B('5 · Antes / después','5 · Before / after'),body:B('Izquierda: el original. Centro: el dañado, que el navegador no puede abrir. Derecha: lo recuperado por el motor.','Left: the original. Centre: the damaged file, which the browser cannot open. Right: what the engine recovered.')},
 {id:'verify',secs:25,title:B('6 · Verificación: no hay que creernos','6 · Verification: you do not have to trust us'),body:B('El SHA-256 del archivo recuperado se compara con el del original. Si coincide, la recuperación es exacta, byte a byte. El nivel de confianza se deriva de sumas de comprobación, no de una opinión.','The recovered file’s SHA-256 is compared with the original’s. If they match, the recovery is exact, byte for byte. The confidence level is derived from checksums, not from an opinion.')},
 {id:'download',secs:25,title:B('7 · Descarga y reproducibilidad','7 · Download and reproducibility'),body:B('Descarga el archivo recuperado, el paquete seguro y el informe técnico, y repite el experimento con los otros ocho ejemplos: reparación parcial, texto corrupto, firma alterada, ZIP dañado, GIF, BMP y WAV truncados y un caso irrecuperable donde el motor dice la verdad.','Download the recovered file, the safe package and the technical report, and repeat the experiment with the other eight examples: partial repair, corrupt text, altered signature, damaged ZIP, truncated GIF, BMP and WAV, and an unrecoverable case where the engine tells the truth.')},
 {id:'innovation',secs:20,title:B('8 · Innovación','8 · Innovation'),body:B('Recuperación con contrato de honestidad: cada elemento solo se marca «verificado» si una comprobación objetiva lo respalda (CRC-32, Adler-32, SHA-256, re-análisis). Decodificador Deflate propio que rescata el prefijo válido de flujos dañados, reparaciones que no tocan los bytes de datos, y diagnóstico que admite cuándo no hay nada que recuperar. Todo local, sin subir archivos.','Recovery with an honesty contract: an item is only marked “verified” if an objective check backs it (CRC-32, Adler-32, SHA-256, re-analysis). Our own Deflate decoder rescues the valid prefix of damaged streams, repairs never touch data bytes, and the diagnosis admits when there is nothing to recover. All local, no files uploaded.')},
];
function Logo(){
 // eslint-disable-next-line @next/next/no-img-element -- logo oficial estático: se conserva el render exacto
 return <img src="/quetzal-logo-640.png" alt="Quetzal Afterlife" style={{maxHeight:200,width:'auto',maxWidth:'100%'}}/>;
}
export const DEMO_TOTAL_SECS=STEPS.reduce((n,s)=>n+s.secs,0);

export default function GuidedDemo({onClose,onOpenLab}:{onClose:()=>void;onOpenLab:()=>void}){
 const {lang}=useUi();const L=(b:Bi)=>b[lang];
 const ex=useMemo(()=>buildLabExamples()[0],[]);
 // El tiempo transcurrido es la única fuente de verdad: el paso actual se deriva de él (sin estado duplicado).
 const [sec,setSec]=useState(0);const [play,setPlay]=useState(true);
 const [run,setRun]=useState<LabRun|null>(null);const [stage,setStage]=useState<LabStage|null>(null);const started=useRef(false);
 const starts=useMemo(()=>STEPS.map((_,k)=>STEPS.slice(0,k).reduce((n,s)=>n+s.secs,0)),[]);
 const i=Math.max(0,starts.findLastIndex(s0=>s0<=Math.min(sec,DEMO_TOTAL_SECS-1)));
 const step=STEPS[i],elapsed=Math.min(sec,DEMO_TOTAL_SECS);

 const go=useCallback((n:number)=>setSec(starts[Math.max(0,Math.min(STEPS.length-1,n))]),[starts]);
 useEffect(()=>{ // la ejecución real arranca al llegar al paso 4
  if(i>=3&&!started.current){started.current=true;runLab(ex,setStage).then(setRun).catch(()=>{started.current=false;});}
 },[i,ex]);
 useEffect(()=>{
  if(!play)return;
  const t=setInterval(()=>setSec(s=>Math.min(s+1,DEMO_TOTAL_SECS)),1000);return()=>clearInterval(t);
 },[play]);
 useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')go(i+1);if(e.key==='ArrowLeft')go(i-1);};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k);},[i,go,onClose]);

 const mm=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
 const rep=run?.report.repaired;

 return <div className="demo-overlay" role="dialog" aria-modal="true" aria-label={lang==='es'?'Demostración guiada de tres minutos':'Three-minute guided demo'} data-testid="guided-demo">
  <div className="demo-card">
   <div className="demo-top"><span className="eyebrow">{lang==='es'?'DEMOSTRACIÓN GUIADA':'GUIDED DEMO'} · {mm(elapsed)} / {mm(DEMO_TOTAL_SECS)}</span><button className="secondary" style={{marginTop:0,padding:'6px 12px',fontSize:11}} onClick={onClose}>{lang==='es'?'Cerrar (Esc)':'Close (Esc)'}</button></div>
   <div className="demo-bar" role="progressbar" aria-valuemin={0} aria-valuemax={DEMO_TOTAL_SECS} aria-valuenow={elapsed}><i style={{width:`${(elapsed/DEMO_TOTAL_SECS)*100}%`}}/></div>
   <h2>{L(step.title)}</h2>
   <p className="demo-body">{L(step.body)}</p>

   <div className="demo-visual">
    {step.id==='identity'&&<Logo/>}
    {step.id==='damaged'&&<Pic bytes={ex.damaged.bytes} label={ex.damaged.name} lang={lang}/>}
    {step.id==='analysis'&&(run?<ul className="lab-stages">{Object.entries(run.stageMs).map(([k,v])=><li key={k}><code>{k}</code> ✓ {v} ms</li>)}<li>{run.report.findings.length} {lang==='es'?'hallazgos':'findings'}</li></ul>
     :<div className="lab-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage?.pct??0}><i style={{width:`${stage?.pct??0}%`}}/><span>{stage?`${stage.pct}% · ${L(stage.label)}`:'…'}</span></div>)}
    {(step.id==='compare'||step.id==='verify'||step.id==='download')&&!run&&<p className="muted" style={{display:'block'}}>{lang==='es'?'Procesando…':'Processing…'}</p>}
    {step.id==='compare'&&run&&<div className="lab-compare"><Pic bytes={ex.original.bytes} label={lang==='es'?'Original':'Original'} lang={lang}/><Pic bytes={ex.damaged.bytes} label={lang==='es'?'Dañado':'Damaged'} lang={lang}/><Pic bytes={rep?.bytes} label={lang==='es'?'Recuperado':'Recovered'} lang={lang}/></div>}
    {step.id==='verify'&&run&&<><ul className="lab-checks">{run.checks.map((c,k)=><li key={k} className={c.ok?'ok':'bad'}><span aria-hidden>{c.ok?'✓':'✗'}</span><div><b>{L(c.label)}</b><small>{c.detail}</small></div></li>)}</ul><p><b>{lang==='es'?'Confianza':'Confidence'}:</b> {run.confidence.toUpperCase()} — {L(run.confidenceWhy)}</p></>}
    {step.id==='download'&&run&&<div className="lab-actions">{rep&&<button className="primary" style={{marginTop:0}} onClick={()=>save(rep.name,rep.bytes,'application/octet-stream')}>{lang==='es'?'Descargar recuperado':'Download recovered'}</button>}<button className="secondary" style={{marginTop:0}} onClick={()=>save('informe.json',JSON.stringify({sha256:{original:run.originalSha,damaged:run.damagedSha,recovered:run.recoveredSha},checks:run.checks,confidence:run.confidence,findings:run.report.findings},null,2),'application/json')}>{lang==='es'?'Informe JSON':'JSON report'}</button></div>}
    {step.id==='innovation'&&<button className="try-now" onClick={onOpenLab}><span aria-hidden>✺</span>{lang==='es'?'ABRIR EL LABORATORIO':'OPEN THE LAB'}<span aria-hidden>→</span></button>}
   </div>

   <div className="demo-nav">
    <button className="secondary" style={{marginTop:0}} disabled={i===0} onClick={()=>go(i-1)}>← {lang==='es'?'Anterior':'Back'}</button>
    <button className="secondary" style={{marginTop:0}} onClick={()=>setPlay(p=>!p)} aria-pressed={play}>{play?(lang==='es'?'⏸ Pausar':'⏸ Pause'):(lang==='es'?'▶ Reanudar':'▶ Resume')}</button>
    <span className="muted" style={{display:'inline'}}>{i+1}/{STEPS.length}</span>
    <button className="secondary" style={{marginTop:0}} disabled={i===STEPS.length-1} onClick={()=>go(i+1)}>{lang==='es'?'Siguiente':'Next'} →</button>
   </div>
  </div>
 </div>;
}
