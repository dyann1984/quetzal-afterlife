'use client';
/**
 * RESURRECTION LAB: seis ejemplos reproducibles (original + dañado) que se procesan con el motor real al pulsar «Ejecutar».
 * Nada está pregrabado: los archivos se generan por código y el veredicto se calcula comparando con el original.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {buildLabExamples,runLab,type LabExample,type LabRun,type LabStage,type Bi,type Confidence} from '../lib/filerec/lab';
import {exportRecovered,reportJson} from '../lib/filerec';
import {useUi} from '../lib/i18n';

const UI={
 kicker:{es:'RESURRECTION LAB / PRUÉBALO TÚ MISMO',en:'RESURRECTION LAB / TRY IT YOURSELF'},
 intro:{es:'Seis archivos dañados de forma controlada, cada uno con su original de referencia. Pulsa «Ejecutar análisis»: el motor procesa los bytes reales en tu navegador (nada se sube) y el resultado se compara con el original. Los datos son sintéticos y el laboratorio incluye un caso que NO se puede recuperar, para demostrar que el diagnóstico es honesto.',en:'Six deliberately damaged files, each with its reference original. Press “Run analysis”: the engine processes the real bytes in your browser (nothing is uploaded) and the result is compared with the original. The data is synthetic and the lab includes one case that CANNOT be recovered, to show the diagnosis is honest.'},
 run:{es:'Ejecutar análisis',en:'Run analysis'},running:{es:'Procesando…',en:'Processing…'},runAll:{es:'Ejecutar los 6 ejemplos',en:'Run all 6 examples'},
 original:{es:'Original de referencia',en:'Reference original'},damaged:{es:'Archivo dañado',en:'Damaged file'},recovered:{es:'Recuperado',en:'Recovered'},
 download:{es:'Descargar',en:'Download'},problem:{es:'El problema',en:'The problem'},damageDone:{es:'Daño aplicado',en:'Damage applied'},expect:{es:'Qué debe ocurrir',en:'What should happen'},
 checks:{es:'Verificación contra el original',en:'Verification against the original'},confidence:{es:'Nivel de confianza',en:'Confidence level'},
 sha:{es:'Huellas SHA-256',en:'SHA-256 fingerprints'},stages:{es:'Etapas ejecutadas (tiempos reales)',en:'Stages executed (real timings)'},
 findings:{es:'Diagnóstico del motor',en:'Engine diagnosis'},limits:{es:'Límites',en:'Limits'},report:{es:'Informe técnico completo (JSON)',en:'Full technical report (JSON)'},
 dlRepaired:{es:'Descargar archivo recuperado',en:'Download recovered file'},dlZip:{es:'Paquete seguro (ZIP)',en:'Safe package (ZIP)'},dlReport:{es:'Informe JSON',en:'JSON report'},
 noRecovered:{es:'No hay archivo recuperado: el motor no inventa datos.',en:'There is no recovered file: the engine does not invent data.'},
 cantShow:{es:'El navegador no puede mostrar este archivo',en:'The browser cannot display this file'},
 summary:{es:'Resumen de los 6 ejemplos',en:'Summary of the 6 examples'},synthetic:{es:'SINTÉTICO',en:'SYNTHETIC'},
 same:{es:'idéntico',en:'identical'},differs:{es:'distinto',en:'different'},
 notVerified:{es:'NO verificado',en:'NOT verified'},verified:{es:'verificado',en:'verified'},
 damagedRanges:{es:'Rangos dañados localizados',en:'Damaged ranges located'},bytes:{es:'bytes',en:'bytes'},
} satisfies Record<string,Bi>;
const OUT_LABEL:Record<LabExample['outcome'],Bi>={exact:{es:'RECUPERACIÓN COMPLETA',en:'FULL RECOVERY'},partial:{es:'RECUPERACIÓN PARCIAL',en:'PARTIAL RECOVERY'},'honest-fail':{es:'IRRECUPERABLE',en:'UNRECOVERABLE'}};
const CONF_LABEL:Record<Confidence,Bi>={alta:{es:'ALTA',en:'HIGH'},media:{es:'MEDIA',en:'MEDIUM'},baja:{es:'BAJA',en:'LOW'},nula:{es:'NULA',en:'NONE'}};
const CONF_CLS:Record<Confidence,string>={alta:'vstatus-ok',media:'vstatus-only',baja:'vstatus-only',nula:'vstatus-diff'};
const SEV_CLS:Record<string,string>={info:'vstatus-nc',aviso:'vstatus-only',dano:'vstatus-diff'};

export function save(name:string,data:Uint8Array|string,mime:string){
 const url=URL.createObjectURL(new Blob([data as BlobPart],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name.replace(/[^\w.-]+/g,'_');document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const kb=(n:number)=>n>=1024?`${(n/1024).toFixed(1)} KiB`:`${n} B`;
const hex=(b:Uint8Array,n=48)=>Array.from(b.subarray(0,n),x=>x.toString(16).padStart(2,'0')).join(' ');
const showText=(b:Uint8Array)=>new TextDecoder('utf-8',{fatal:false}).decode(b).replace(/\u0000/g,'␀');

function useUrl(bytes:Uint8Array|undefined,mime:string){
 // URL de datos (pura, sin efectos ni recursos que liberar): las imágenes pesan pocos KiB.
 return useMemo(()=>{
  if(!bytes)return '';
  let s='';for(let k=0;k<bytes.length;k+=8192)s+=String.fromCharCode(...bytes.subarray(k,k+8192));
  return `data:${mime};base64,${btoa(s)}`;
 },[bytes,mime]);
}
function BlobImg({src,alt,onError}:{src:string;alt:string;onError:()=>void}){
 // eslint-disable-next-line @next/next/no-img-element -- URL blob: next/image no puede optimizarla
 return <img src={src} alt={alt} onError={onError} width={256} height={192}/>;
}
export function Pic({bytes,label,lang}:{bytes?:Uint8Array;label:string;lang:'es'|'en'}){
 const url=useUrl(bytes,'image/png');const [badFor,setBadFor]=useState<Uint8Array|undefined>();
 const bad=!!bytes&&badFor===bytes;
 return <figure className="lab-pic"><figcaption>{label}</figcaption>
  {bytes?(bad?<div className="lab-broken" role="img" aria-label={UI.cantShow[lang]}><span>✕</span>{UI.cantShow[lang]}{bytes&&<code>{hex(bytes,24)}…</code>}</div>
   :url&&<BlobImg src={url} alt={label} onError={()=>setBadFor(bytes)}/>)
   :<div className="lab-broken"><span>∅</span>{UI.noRecovered[lang]}</div>}
 </figure>;
}

function Result({run,lang}:{run:LabRun;lang:'es'|'en'}){
 const ex=run.example,rep=run.report.repaired,L=(b:Bi)=>b[lang];
 const zip=useMemo(()=>exportRecovered(run.report),[run]);
 const fullJson=useMemo(()=>reportJson(run.report),[run]);
 return <section className="lab-result" aria-live="polite" data-testid="lab-result">
  <div className={`lab-verdict conf-${run.confidence}`}>
   <div><span className="eyebrow">{L(UI.confidence)}</span><b className={`vstatus ${CONF_CLS[run.confidence]}`}>{L(CONF_LABEL[run.confidence])}</b></div>
   <p>{L(run.confidenceWhy)}</p>
  </div>

  {ex.view==='image'&&<div className="lab-compare"><Pic bytes={ex.original.bytes} label={L(UI.original)} lang={lang}/><Pic bytes={ex.damaged.bytes} label={L(UI.damaged)} lang={lang}/><Pic bytes={rep?.bytes} label={L(UI.recovered)} lang={lang}/></div>}
  {ex.view==='text'&&<div className="lab-compare lab-text"><div><h4>{L(UI.damaged)}</h4><pre>{showText(ex.damaged.bytes)}</pre></div><div><h4>{L(UI.recovered)}</h4><pre>{rep?showText(rep.bytes):L(UI.noRecovered)}</pre></div></div>}
  {ex.view==='zip'&&<div className="tablewrap"><table><thead><tr><th>{lang==='es'?'Entrada':'Entry'}</th><th>{lang==='es'?'Tamaño':'Size'}</th><th>{lang==='es'?'Estado':'Status'}</th><th>{lang==='es'?'Base':'Basis'}</th></tr></thead><tbody>
   {run.report.items.filter(i=>i.kind==='entrada').map((i,k)=><tr key={k}><td>{i.name}</td><td>{i.size}</td><td><span className={`vstatus ${i.verified?'vstatus-ok':'vstatus-diff'}`}>{i.verified?L(UI.verified):L(UI.notVerified)}</span></td><td style={{fontSize:11}}>{i.basis}{i.partialBytes?` · ${lang==='es'?'prefijo legible':'readable prefix'}: ${i.partialBytes.length} B`:''}</td></tr>)}
  </tbody></table></div>}

  <h3>{L(UI.checks)}</h3>
  <ul className="lab-checks" data-testid="lab-checks">{run.checks.map((c,i)=><li key={i} className={c.ok?'ok':'bad'}><span aria-hidden>{c.ok?'✓':'✗'}</span><div><b>{L(c.label)}</b><small>{c.detail}</small></div></li>)}</ul>

  <h3>{L(UI.sha)}</h3>
  <div className="tablewrap"><table><tbody>
   <tr><th>{L(UI.original)}</th><td><code>{run.originalSha}</code></td></tr>
   <tr><th>{L(UI.damaged)}</th><td><code>{run.damagedSha}</code></td></tr>
   <tr><th>{L(UI.recovered)}</th><td>{run.recoveredSha?<><code>{run.recoveredSha}</code> <span className={`vstatus ${run.recoveredSha===run.originalSha?'vstatus-ok':'vstatus-only'}`}>{run.recoveredSha===run.originalSha?`= ${L(UI.original)} (${L(UI.same)})`:`≠ ${L(UI.original)} (${L(UI.differs)})`}</span></>:'—'}</td></tr>
  </tbody></table></div>

  <h3>{L(UI.findings)}</h3>
  <div className="inv-warnings">{run.report.findings.length===0&&<p className="inv-warn-line">—</p>}{run.report.findings.map((f,i)=><p key={i} className="inv-warn-line"><span className={`vstatus ${SEV_CLS[f.severity]}`}>{f.severity}</span> {f.message}{f.offset!==undefined?` (offset ${f.offset})`:''}</p>)}</div>
  {run.report.damaged.length>0&&<><h3>{L(UI.damagedRanges)}</h3><div className="tablewrap"><table><thead><tr><th>{lang==='es'?'Bytes':'Bytes'}</th><th>{lang==='es'?'Sectores (512 B)':'Sectors (512 B)'}</th><th>{lang==='es'?'Motivo':'Reason'}</th></tr></thead><tbody>{run.report.damaged.slice(0,10).map((d,i)=><tr key={i}><td>{d.start} – {d.end}</td><td>{d.sectors?`${d.sectors[0]}–${d.sectors[1]}`:'—'}</td><td>{d.reason}</td></tr>)}</tbody></table></div></>}
  {rep&&<p className={rep.structureVerified?'save-ok':'save-err'} role="note">{rep.structureVerified?'✓':'⚠'} {rep.note}</p>}

  <div className="lab-actions">
   {rep&&<button className="primary" style={{marginTop:0}} onClick={()=>save(rep.name,rep.bytes,'application/octet-stream')}>{L(UI.dlRepaired)} · {rep.name}</button>}
   <button className="secondary" style={{marginTop:0}} onClick={()=>save(`${ex.id}.recuperado.zip`,zip,'application/zip')}>{L(UI.dlZip)}</button>
   <button className="secondary" style={{marginTop:0}} onClick={()=>save(`${ex.id}.informe.json`,fullJson,'application/json')}>{L(UI.dlReport)}</button>
  </div>
  <details><summary>{L(UI.stages)}</summary><ul className="lab-stages">{Object.entries(run.stageMs).map(([k,v])=><li key={k}><code>{k}</code> {v} ms</li>)}</ul></details>
  {run.report.limitations.length>0&&<details><summary>{L(UI.limits)} ({run.report.limitations.length})</summary><ul style={{fontSize:12}}>{run.report.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></details>}
  <details><summary>{L(UI.report)}</summary><pre className="lab-json">{fullJson}</pre></details>
 </section>;
}

export default function ResurrectionLab({initialId}:{initialId?:string}){
 const {lang}=useUi();const L=(b:Bi)=>b[lang];
 const examples=useMemo(()=>buildLabExamples(),[]);
 const [sel,setSel]=useState(initialId&&examples.some(e=>e.id===initialId)?initialId:examples[0].id);
 const [runs,setRuns]=useState<Record<string,LabRun>>({});
 const [stage,setStage]=useState<LabStage|null>(null);
 const [busy,setBusy]=useState<string|null>(null);
 const [error,setError]=useState('');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const ex=examples.find(e=>e.id===sel)!,run=runs[sel];

 async function exec(e:LabExample){
  setBusy(e.id);setError('');
  try{const r=await runLab(e,s=>{if(alive.current)setStage(s);});if(alive.current)setRuns(p=>({...p,[e.id]:r}));}
  catch(err){if(alive.current)setError(err instanceof Error?err.message:String(err));}
  finally{if(alive.current){setBusy(null);setStage(null);}}
 }
 async function execAll(){for(const e of examples){setSel(e.id);await exec(e);}}

 return <div className="workspace lab" id="resurrection-lab">
  <span className="kicker">{L(UI.kicker)}</span>
  <h1>Resurrection Lab<span className="gold">.</span></h1>
  <p style={{maxWidth:860}}>{L(UI.intro)}</p>

  <div className="lab-grid" role="tablist" aria-label="Examples">
   {examples.map(e=><button key={e.id} role="tab" aria-selected={sel===e.id} className={`lab-card${sel===e.id?' active':''}`} onClick={()=>setSel(e.id)} data-testid={`lab-card-${e.id}`}>
    <span className="lab-n">{e.n}</span><b>{L(e.title)}</b>
    <span className={`vstatus ${e.outcome==='exact'?'vstatus-ok':e.outcome==='partial'?'vstatus-only':'vstatus-diff'}`}>{L(OUT_LABEL[e.outcome])}</span>
    {runs[e.id]&&<span className="lab-done" title={L(CONF_LABEL[runs[e.id].confidence])}>✓ {L(CONF_LABEL[runs[e.id].confidence])}</span>}
   </button>)}
  </div>
  <p><button className="secondary" style={{marginTop:0}} disabled={!!busy} onClick={execAll} data-testid="lab-run-all">{L(UI.runAll)}</button></p>

  <article className="lab-panel" aria-labelledby="lab-title">
   <header><span className="demo-badge">{L(UI.synthetic)}</span><h2 id="lab-title">{ex.n}. {L(ex.title)}</h2></header>
   <div className="lab-info">
    <div><h4>{L(UI.problem)}</h4><p>{L(ex.problem)}</p><h4>{L(UI.damageDone)}</h4><ul>{ex.damage.map((d,i)=><li key={i}>{L(d)}</li>)}</ul><h4>{L(UI.expect)}</h4><p>{L(ex.expectation)}</p></div>
    <div className="lab-files">
     <div><b>{L(UI.original)}</b><code>{ex.original.name}</code><small>{kb(ex.original.bytes.length)}</small><button className="link-btn" onClick={()=>save(ex.original.name,ex.original.bytes,'application/octet-stream')}>{L(UI.download)}</button></div>
     <div><b>{L(UI.damaged)}</b><code>{ex.damaged.name}</code><small>{kb(ex.damaged.bytes.length)}</small><button className="link-btn" onClick={()=>save(ex.damaged.name,ex.damaged.bytes,'application/octet-stream')} data-testid="lab-dl-damaged">{L(UI.download)}</button></div>
    </div>
   </div>
   <button className="primary" style={{marginTop:6}} disabled={!!busy} onClick={()=>exec(ex)} data-testid="lab-run">{busy===ex.id?L(UI.running):L(UI.run)}</button>
   {busy===ex.id&&stage&&<div className="lab-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stage.pct} aria-label={L(stage.label)}><i style={{width:`${stage.pct}%`}}/><span>{stage.pct}% · {L(stage.label)}</span></div>}
   {error&&<p role="alert" className="error">{error}</p>}
   {run&&<Result run={run} lang={lang}/>}
  </article>

  {Object.keys(runs).length===examples.length&&<section className="lab-summary" data-testid="lab-summary"><h3>{L(UI.summary)}</h3><div className="tablewrap"><table><tbody>
   {examples.map(e=>{const r=runs[e.id];const ok=r.checks.every(c=>c.ok);return <tr key={e.id}><td>{e.n}. {L(e.title)}</td><td><span className={`vstatus ${CONF_CLS[r.confidence]}`}>{L(CONF_LABEL[r.confidence])}</span></td><td>{ok?'✓':'✗'} {r.checks.filter(c=>c.ok).length}/{r.checks.length}</td></tr>;})}
  </tbody></table></div></section>}
 </div>;
}
