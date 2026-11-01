'use client';
/**
 * Protocolo de resurrección (vista). Todo lo que se pinta sale de `ResurrectionRun`:
 *  · la pista de seis etapas avanza solo cuando el motor termina cada una (estado y duración medidos);
 *  · el mapa de bytes dibuja los rangos dañados reales a escala;
 *  · el núcleo muestra el veredicto y la estimación con su fundamento;
 *  · el comparador enseña el original y el resultado (texto con zonas dañadas marcadas, imágenes en vista previa segura);
 *  · Quetzalito explica con frases construidas a partir del informe (lib/quetzalito/explain.ts).
 */
import {useEffect,useMemo,useState} from 'react';
import Avatar from './quetzalito/Avatar';
import {STAGE_IDS,STAGE_LABEL,OUTCOME_LABEL,type ResurrectionRun,type StageState} from '../lib/filerec/protocol';
import {explainRun} from '../lib/quetzalito/explain';
import {tr,tm,nf,useUi} from '../lib/i18n';

const GLYPH:Record<StageState,string>={pendiente:'',activo:'',ok:'✓',parcial:'◐',omitido:'—',fallido:'✕'};
const STATE_TXT:Record<StageState,string>={pendiente:'pendiente',activo:'en curso',ok:'completada',parcial:'parcial',omitido:'omitida',fallido:'sin éxito'};
const LEVEL_TXT:Record<string,string>={total:'Total',alta:'Alta',media:'Media',baja:'Baja',nula:'Nula',desconocida:'Desconocida'};
const kb=(n:number)=>n>=1048576?`${(n/1048576).toFixed(2)} MiB`:n>=1024?`${(n/1024).toFixed(1)} KiB`:`${n} B`;
const TEXTY=new Set(['json','xml','csv','txt']);
const IMAGE_MIME:Record<string,string>={png:'image/png',jpeg:'image/jpeg'};

function download(name:string,data:Uint8Array,mime='application/octet-stream'){
 const url=URL.createObjectURL(new Blob([data as BlobPart],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name.replace(/[^\w.-]+/g,'_');document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/** URL de objeto con ciclo de vida; solo para formatos de imagen que el navegador decodifica sin ejecutar nada. */
function useBlobUrl(bytes:Uint8Array|undefined,mime:string|undefined){
 const url=useMemo(()=>bytes&&mime?URL.createObjectURL(new Blob([bytes as BlobPart],{type:mime})):null,[bytes,mime]);
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 return url;
}

export function StageTrack({run}:{run:ResurrectionRun}){
 const done=run.stages.filter(s=>s.state!=='pendiente'&&s.state!=='activo').length;
 const active=run.stages.findIndex(s=>s.state==='activo');
 const progress=Math.max(0,(active>=0?active:done)-1)/(STAGE_IDS.length-1);
 return <div className="rz-track" role="list" aria-label={tr('Protocolo de resurrección en seis etapas')}>
  <div className="rz-rail" aria-hidden="true" style={{'--p':progress} as React.CSSProperties}><i style={{transform:`scaleX(${progress})`}}/></div>
  {run.stages.map((s,i)=><div key={s.id} role="listitem" className={`rz-stage rz-${s.state}`} aria-current={s.state==='activo'?'step':undefined}>
   <div className="rz-node"><span className="rz-num">{String(i+1).padStart(2,'0')}</span><b aria-hidden="true">{GLYPH[s.state]}</b></div>
   <div className="rz-meta">
    <strong>{tm(STAGE_LABEL[s.id])}</strong>
    <span className="rz-state">{tr(STATE_TXT[s.state])}{(s.state!=='pendiente'&&s.state!=='activo')&&<> · {nf(s.ms)} {tr('ms')}</>}</span>
    {s.detail&&<p>{tm(s.detail)}</p>}
   </div>
  </div>)}
 </div>;
}

/** Mapa del archivo a escala: cada franja roja es un rango dañado medido. */
export function ByteMap({size,ranges}:{size:number;ranges:Array<{start:number;end:number;reason:string}>}){
 if(!size)return null;
 const shown=ranges.slice(0,200);
 return <figure className="rz-bytemap">
  <div className="rz-bytebar" role="img" aria-label={`${tr('Mapa de bytes')}: ${ranges.length} ${tr('rango(s) dañado(s)')}`}>
   {shown.map((d,i)=><span key={i} title={`${nf(d.start)}–${nf(d.end)} · ${tm(d.reason)}`} style={{left:`${(d.start/size)*100}%`,width:`max(2px,${((d.end-d.start)/size)*100}%)`}}/>)}
  </div>
  <figcaption><span>0</span><span>{ranges.length?`${ranges.length} ${tr('rango(s) dañado(s)')}`:tr('sin rangos dañados')}</span><span>{kb(size)}</span></figcaption>
 </figure>;
}

function Verdict({run}:{run:ResurrectionRun}){
 const r=run.recoverability,good=run.outcome==='integro'||run.outcome==='reparado-validado',bad=run.outcome==='irrecuperable'||run.outcome==='solo-diagnostico'||run.outcome==='no-analizado';
 return <div className={`rz-core ${good?'is-good':bad?'is-bad':'is-mid'}`}>
  <div className="rz-orb" aria-hidden="true"><i/><i/><i/></div>
  <div className="rz-core-body">
   <span className="eyebrow">{tr('VEREDICTO')}</span>
   <h3>{tm(OUTCOME_LABEL[run.outcome])}</h3>
   <div className="rz-gauge">
    <span>{tr('Recuperabilidad')}: <b>{tr(LEVEL_TXT[r.level])}</b></span>
    {r.intactBytesPct!==null&&<><div className="rz-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.intactBytesPct} aria-label={tr('Bytes fuera de zonas dañadas')}><i style={{width:`${r.intactBytesPct}%`}}/></div><small>{r.intactBytesPct} % {tr('de los bytes fuera de zonas dañadas')}</small></>}
   </div>
   <ul>{r.basis.map((b,i)=><li key={i}>{tm(b)}</li>)}</ul>
   <div className="rz-actions">
    {run.artifact&&<button className="primary" style={{marginTop:0}} onClick={()=>download(run.artifact!.name,run.artifact!.bytes,run.artifact!.kind==='paquete'?'application/zip':'application/octet-stream')}>{run.artifact.kind==='paquete'?tr('Descargar lo recuperado (ZIP)'):tr('Descargar archivo reparado')} <span>↓</span></button>}
    {run.artifact&&<span className="rz-muted" title={run.artifact.sha256}>{tr('SHA-256')} {run.artifact.sha256.slice(0,12)}…</span>}
    <span className="rz-muted">{tr('El original no se modifica.')}</span>
   </div>
  </div>
 </div>;
}

function TextPane({bytes,ranges,label}:{bytes:Uint8Array;ranges:Array<{start:number;end:number}>;label:string}){
 const LIMIT=6000,view=bytes.subarray(0,LIMIT),dec=new TextDecoder('utf-8',{fatal:false});
 const parts:Array<{t:string;bad:boolean}>=[];let p=0;
 for(const d of [...ranges].sort((a,b)=>a.start-b.start)){if(d.start>=LIMIT)break;const a=Math.max(p,d.start),b=Math.min(LIMIT,d.end);if(a>p)parts.push({t:dec.decode(view.subarray(p,a)),bad:false});if(b>a)parts.push({t:dec.decode(view.subarray(a,b)),bad:true});p=Math.max(p,b);}
 if(p<view.length)parts.push({t:dec.decode(view.subarray(p)),bad:false});
 return <div className="rz-pane"><span className="rz-pane-label">{label}</span><pre>{parts.map((x,i)=>x.bad?<mark key={i}>{x.t||' '}</mark>:<span key={i}>{x.t}</span>)}{bytes.length>LIMIT&&<span className="rz-muted">{'\n'}… {nf(bytes.length-LIMIT)} {tr('bytes más')}</span>}</pre></div>;
}

function ImagePane({bytes,mime,label}:{bytes:Uint8Array;mime:string;label:string}){
 const url=useBlobUrl(bytes,mime);const [err,setErr]=useState(false);
 // Vista previa de un blob local: next/image no aplica a URLs de objeto creadas en el navegador.
 const img=url&&!err?<img src={url} alt={label} onError={()=>setErr(true)}/>:null; // eslint-disable-line @next/next/no-img-element
 return <div className="rz-pane rz-pane-img"><span className="rz-pane-label">{label}</span>{img??<p className="rz-muted">{tr('El navegador no puede mostrar esta imagen tal como está.')}</p>}</div>;
}

export function Comparator({run,source}:{run:ResurrectionRun;source?:Uint8Array}){
 const r=run.report;if(!r||!source)return null;
 const fmt=r.format,out=run.artifact;
 const textOut=out&&out.kind==='reparado'&&TEXTY.has(run.validation?.format??'')?out.bytes:null;
 const imgMime=IMAGE_MIME[fmt];
 const items=r.items.filter(i=>i.verified).slice(0,6);
 return <section className="rz-compare" aria-label={tr('Comparador antes y después')}>
  <div className="sectionhead" style={{margin:'0 0 10px'}}><div><span className="eyebrow">{tr('ANTES / DESPUÉS')}</span><h2 style={{fontSize:22}}>{tr('Comparador')}</h2></div></div>
  <div className="rz-panes">
   {TEXTY.has(fmt)?<TextPane bytes={source} ranges={r.damaged} label={tr('Original (zonas dañadas marcadas)')}/>:imgMime?<ImagePane bytes={source} mime={imgMime} label={tr('Original')}/>:<div className="rz-pane"><span className="rz-pane-label">{tr('Original')}</span><p className="rz-muted">{tr('Formato binario: se muestra su mapa de bytes y lo extraído.')}</p><ByteMap size={r.size} ranges={r.damaged}/></div>}
   {textOut?<TextPane bytes={textOut} ranges={[]} label={tr('Resultado reparado')}/>
    :out&&out.kind==='reparado'&&IMAGE_MIME[run.validation?.format??'']?<ImagePane bytes={out.bytes} mime={IMAGE_MIME[run.validation!.format]} label={tr('Resultado reparado')}/>
    :<div className="rz-pane"><span className="rz-pane-label">{tr('Recuperado y verificado')}</span>{items.length?<ul className="rz-items">{items.map((it,i)=><li key={i}><b>{tm(it.name)}</b> <span className="rz-muted">{nf(it.size)} B · {tm(it.basis)}</span>{it.preview&&<pre>{it.preview.slice(0,220)}</pre>}</li>)}</ul>:<p className="rz-muted">{run.outcome==='integro'?tr('El original está íntegro: es su propia mejor versión.'):tr('No hay contenido verificado que mostrar.')}</p>}</div>}
  </div>
 </section>;
}

export function QuetzalitoExplains({run}:{run:ResurrectionRun}){
 const {lang}=useUi();const x=explainRun(run,lang);
 return <section className="rz-explain" aria-label={tr('Quetzalito explica el resultado')}>
  <div className="rz-explain-head"><Avatar size={44}/><div><span className="eyebrow">{tr('QUETZALITO EXPLICA')}</span><p>{x.headline}</p></div></div>
  <div className="rz-explain-grid">{x.sections.map((s,i)=><div key={i}><h4>{s.title}</h4><ul>{s.lines.map((l,k)=><li key={k}>{l}</li>)}</ul></div>)}</div>
  <p className="rz-next">→ {x.next}</p>
 </section>;
}

export default function ResurrectionView({run,source}:{run:ResurrectionRun;source?:Uint8Array}){
 const finished=run.stages.every(s=>s.state!=='pendiente'&&s.state!=='activo');
 return <div className="rz" data-testid="resurrection" aria-busy={!finished}>
  <div className="rz-head">
   <div><span className="kicker">{tr('PROTOCOLO DE RESURRECCIÓN')}{run.synthetic&&<span className="demo-badge" style={{marginLeft:8}}>{tr('SINTÉTICO')}</span>}</span><h2>{run.name}</h2>
    <p className="rz-muted">{kb(run.size)}{run.report&&<> · {tr('SHA-256')} <span title={run.report.sha256}>{run.report.sha256.slice(0,12)}…</span></>}{finished&&<> · {nf(run.totalMs)} {tr('ms en total')}</>}</p></div>
  </div>
  <StageTrack run={run}/>
  {finished&&run.report&&<>
   <div className="rz-split"><Verdict run={run}/><div className="rz-mapcard"><span className="eyebrow">{tr('ESTRUCTURA DEL ARCHIVO')}</span><ByteMap size={run.size} ranges={run.report.damaged}/><p className="rz-muted" style={{fontSize:11}}>{tr('Cada franja es un rango de bytes dañado medido por el analizador, a escala del archivo.')}</p></div></div>
   <QuetzalitoExplains run={run}/>
   <Comparator run={run} source={source}/>
  </>}
 </div>;
}
