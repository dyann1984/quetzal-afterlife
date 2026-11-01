'use client';
/**
 * File Recovery: recuperación de archivos (PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT), carving de imágenes de disco,
 * matriz de capacidades y diseño de Software Archaeology. Todo se procesa en el navegador, en solo lectura.
 */
import {useEffect,useState,useSyncExternalStore} from 'react';
import {carveImage,exportRecovered,reportJson,DEFAULT_LIMITS,type FileReport,type CarveReport} from '../lib/filerec';
import {buildFixtures,FIXTURE_DAMAGE} from '../lib/filerec/fixtures';
import {CAPACIDADES,AREA_LABEL,ESTADO_LABEL,resumen,type Estado} from '../lib/capabilities';
import {tr,tm,nf} from '../lib/i18n';
import {runResurrection,OUTCOME_LABEL} from '../lib/filerec/protocol';
import {getSession,getServerSession,subscribeSession,loadHistory,upsertRun,finishRun,addCarves,addSource,setActive,setBusy,clearSession} from '../lib/filerec/session';
import ResurrectionView from './resurrection';

const INTEG:Record<string,{cls:string;txt:string}>={
 integro:{cls:'vstatus-ok',txt:'íntegro'},parcial:{cls:'vstatus-only',txt:'parcial'},danado:{cls:'vstatus-diff',txt:'dañado'},
 irrecuperable:{cls:'vstatus-diff',txt:'irrecuperable'},'no-analizado':{cls:'vstatus-nc',txt:'no analizado'},
};
const SEV:Record<string,string>={info:'vstatus-nc',aviso:'vstatus-only',dano:'vstatus-diff'};
const EST_CLS:Record<Estado,string>={'implementado-probado':'vstatus-ok',parcial:'vstatus-only','no-implementado':'vstatus-diff'};

function download(name:string,data:BlobPart|Uint8Array,mime:string){
 const url=URL.createObjectURL(new Blob([data as BlobPart],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name.replace(/[^\w.-]+/g,'_');document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const short=(h:string)=>h.slice(0,10)+'…'+h.slice(-6);
const kb=(n:number)=>n>=1048576?`${(n/1048576).toFixed(2)} MiB`:n>=1024?`${(n/1024).toFixed(1)} KiB`:`${n} B`;

function ReportCard({r,synthetic}:{r:FileReport;synthetic:boolean}){
 const ig=INTEG[r.integrity];const hasExport=r.items.some(i=>i.verified&&(i.bytes||i.kind==='texto'))||!!r.repaired;
 return <div className="project-card" data-testid="file-report">
  <div className="project-card-top"><div><span className="project-name">{r.name}</span> <span className="dbf-field-type">{r.format.toUpperCase()}</span> <span className={`vstatus ${ig.cls}`}>{tr(ig.txt)}</span>{r.dangerous&&<span className="vstatus vstatus-diff" style={{marginLeft:6}}>{tr('peligroso · no se ejecuta')}</span>}{synthetic&&<span className="demo-badge" style={{marginLeft:6}}>{tr('SINTÉTICO')}</span>}</div><span className="muted">{tm(r.label)} {tr('· confianza')} {tr(r.confidence)}</span></div>
  <div className="project-meta"><span>{kb(r.size)}</span><span title={r.sha256}>{tr('SHA-256')} {short(r.sha256)}</span><span>{r.elapsedMs} {tr('ms')}</span>{r.meta&&Object.entries(r.meta).map(([k,v])=><span key={k}>{tm(k)}: <b style={{color:'var(--c-c8d4dc)'}}>{tm(String(v))}</b></span>)}</div>
  <p style={{fontSize:'11px',color:'var(--c-687784)',margin:'6px 0'}}>{tr('Identificado por:')} {r.signals.map(tm).join('; ')}.</p>
  {r.findings.length>0&&<div className="inv-warnings">{r.findings.slice(0,10).map((f,i)=><p key={i} className="inv-warn-line"><span className={`vstatus ${SEV[f.severity]}`}>{tr(f.severity==='dano'?'daño':f.severity)}</span> {tm(f.message)}{f.offset!==undefined?` (offset ${f.offset})`:''}</p>)}{r.findings.length>10&&<p className="inv-warn-line">… {r.findings.length-10} {tr('hallazgos más (ver JSON).')}</p>}</div>}
  {r.damaged.length>0&&<div className="tablewrap"><table><thead><tr><th>{tr('Rango dañado (bytes)')}</th><th>{tr('Sectores de 512 B')}</th><th>{tr('Motivo')}</th></tr></thead><tbody>{r.damaged.slice(0,8).map((d,i)=><tr key={i}><td>{nf(d.start)} – {nf(d.end)}</td><td>{d.sectors?`${d.sectors[0]}–${d.sectors[1]}`:'—'}</td><td>{tm(d.reason)}</td></tr>)}</tbody></table></div>}
  {r.items.length>0&&<div className="tablewrap"><table><thead><tr><th>{tr('Recuperado')}</th><th>{tr('Tamaño')}</th><th>{tr('Verificación')}</th><th>{tr('Base')}</th></tr></thead><tbody>{r.items.slice(0,24).map((it,i)=><tr key={i}><td>{tm(it.name)}{it.preview&&<div style={{fontSize:'10px',color:'var(--c-8aa0b0)',maxWidth:340,whiteSpace:'pre-wrap'}}>{tm(it.preview.slice(0,160))}</div>}</td><td>{nf(it.size)}</td><td><span className={`vstatus ${it.verified?'vstatus-ok':'vstatus-only'}`}>{it.verified?tr('✓ verificado'):tr('⚠ no verificado')}</span></td><td style={{fontSize:'11px'}}>{tm(it.basis)}</td></tr>)}</tbody></table></div>}
  {r.repaired&&<p className={r.repaired.structureVerified?'save-ok':'save-err'} role="note">{r.repaired.structureVerified?'✓':'⚠'} {tr('Reparación propuesta «')}{r.repaired.name}»: {tm(r.repaired.note)}</p>}
  {r.limitations.length>0&&<details><summary style={{fontSize:'11px',color:'var(--c-94a0ac)',cursor:'pointer'}}>{tr('Limitaciones (')}{r.limitations.length})</summary><ul style={{fontSize:'11px',color:'var(--c-94a0ac)'}}>{r.limitations.map((l,i)=><li key={i}>{tm(l)}</li>)}</ul></details>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
   <button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(`${r.name}.informe.json`,reportJson(r),'application/json')}>{tr('Informe JSON')}</button>
   {hasExport&&<button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(`${r.name}.recuperado.zip`,exportRecovered(r),'application/zip')}>{tr('Recuperado (ZIP seguro)')}</button>}
   {r.repaired&&<button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(r.repaired!.name,r.repaired!.bytes,'application/octet-stream')}>{tr('Descargar reparado')}</button>}
  </div>
 </div>;
}

function CarveCard({c,synthetic}:{c:CarveReport;synthetic:boolean}){
 return <div className="project-card" data-testid="carve-report">
  <div className="project-card-top"><div><span className="project-name">{c.name}</span> <span className="dbf-field-type">{tr('IMAGEN EN BRUTO')}</span>{synthetic&&<span className="demo-badge" style={{marginLeft:6}}>{tr('SINTÉTICO')}</span>}</div><span className="muted">{c.candidates.length} {tr('candidato(s)')}</span></div>
  <div className="project-meta"><span>{kb(c.size)}</span><span title={c.sha256}>{tr('SHA-256')} {short(c.sha256)}</span><span>{tr('solo lectura, sobre copia en memoria')}</span></div>
  <div className="tablewrap"><table><thead><tr><th>{tr('Formato')}</th><th>{tr('Sector (512 B)')}</th><th>{tr('Offset')}</th><th>{tr('Longitud')}</th><th>{tr('Fin hallado')}</th><th>{tr('Estado')}</th><th>{tr('SHA-256')}</th><th/></tr></thead><tbody>
   {c.candidates.map((k,i)=>{const ig=INTEG[k.integrity??'no-analizado'];return <tr key={i}><td>{k.format.toUpperCase()}</td><td>{k.sectorStart}{k.aligned?'':tr(' (no alineado)')}</td><td>{nf(k.offset)}</td><td>{nf(k.length)}</td><td>{k.endFound?tr('sí'):tr('no')}</td><td><span className={`vstatus ${ig.cls}`}>{tr(ig.txt)}</span></td><td title={k.sha256}>{k.sha256?short(k.sha256):''}</td><td><button className="link-btn" onClick={()=>download(`${c.name}@${k.offset}.${k.format}`,k.bytes,'application/octet-stream')}>{tr('Extraer')}</button></td></tr>;})}
   {c.candidates.length===0&&<tr><td colSpan={8}>{tr('Sin firmas de archivos reconocidas: no se inventa ningún candidato.')}</td></tr>}
  </tbody></table></div>
  <ul style={{fontSize:'11px',color:'var(--c-94a0ac)'}}>{c.notes.map((n,i)=><li key={i}>{tm(n)}</li>)}</ul>
 </div>;
}

export default function FileRecovery(){
 const [tab,setTab]=useState<'recuperar'|'matriz'|'arqueologia'>('recuperar');
 // El estado vive en un almacén externo: sobrevive a los cambios de sección (antes se perdía al navegar).
 const ses=useSyncExternalStore(subscribeSession,getSession,getServerSession);
 const [errors,setErrors]=useState<string[]>([]);
 const [asDisk,setAsDisk]=useState(false);
 const [showDetail,setShowDetail]=useState(false);
 const busy=ses.busy;
 const res=resumen();
 useEffect(()=>{loadHistory();},[]);
 const active=ses.runs.find(r=>r.id===ses.active)??ses.runs[0]??null;

 async function process(files:Array<{name:string;bytes:Uint8Array;disk?:boolean}>,synthetic:boolean){
  setBusy(true);const errs:string[]=[];const cs:typeof ses.carves=[];
  for(const f of files){
   try{
    if(f.disk){cs.push({c:await carveImage(f.bytes,f.name),synthetic});continue;}
    const id=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    addSource(id,f.bytes);setActive(id);
    finishRun(await runResurrection(f.bytes,f.name,{id,synthetic,onStage:upsertRun}));
   }catch(e){errs.push(`${f.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  if(cs.length)addCarves(cs);setErrors(errs);setBusy(false);
 }
 async function onFiles(e:React.ChangeEvent<HTMLInputElement>){
  const list=[...(e.target.files??[])];e.target.value='';
  const errs:string[]=[];const ok:Array<{name:string;bytes:Uint8Array;disk:boolean}>=[];
  for(const f of list){
   // se rechaza por tamaño ANTES de leer el contenido en memoria
   if(f.size>DEFAULT_LIMITS.maxFileBytes){errs.push(`"${f.name}" supera el límite de ${kb(DEFAULT_LIMITS.maxFileBytes)}: no se lee.`);continue;}
   if(f.size===0){errs.push(`"${f.name}" está vacío.`);continue;}
   ok.push({name:f.name,bytes:new Uint8Array(await f.arrayBuffer()),disk:asDisk});
  }
  await process(ok,false);setErrors(p=>[...p,...errs]);
 }
 const loadFixtures=()=>process(buildFixtures().map(f=>({name:f.name,bytes:f.bytes,disk:f.expectation==='carving'})),true);
 const reports=ses.runs.filter(r=>r.report).map(r=>({r:r.report!,synthetic:r.synthetic}));
 const carves=ses.carves;

 return <div className="workspace">
  <span className="kicker">{tr('RECOVERY / ARCHIVOS Y SISTEMAS')}</span>
  <h1>{tr('Resurrección de archivos')}<span className="gold">.</span></h1>
  <div className="exp-tabs" role="tablist" style={{margin:'10px 0 18px'}}>
   {([['recuperar','Recuperar archivos'],['matriz','Matriz de capacidades'],['arqueologia','Software Archaeology']] as const).map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{tr(l)}</button>)}
  </div>

  {tab==='recuperar'&&<>
   <p>{tr('Identifica el formato por')} <b>{tr('firma binaria')}</b>{tr(', diagnostica la integridad, extrae solo lo')} <b>{tr('verificable')}</b> {tr('(CRC-32, Adler-32, estructura), registra los rangos y sectores dañados y exporta de forma segura. No se ejecuta nada ni se modifica ningún original.')} <b>{tr('No se promete recuperación universal')}</b>{tr(': lo sobrescrito o ausente no existe.')}</p>
   <label className="drop" style={{maxWidth:740}}>
    <span className="upload">↑</span><strong>{tr('Importar archivos dañados (JSON, XML, CSV, SQLite, PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT…)')}</strong>
    <span>{tr('hasta')} {kb(DEFAULT_LIMITS.maxFileBytes)} {tr('cada uno · el tipo se decide por contenido, no por extensión')}</span>
    <input type="file" multiple onChange={onFiles} aria-label={tr('Importar archivos para recuperar')}/>
   </label>
   <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginTop:12}}>
    <label style={{fontSize:12,color:'var(--c-94a0ac)'}}><input type="checkbox" checked={asDisk} onChange={e=>setAsDisk(e.target.checked)}/> {tr('Tratar el siguiente archivo como imagen de disco en bruto (buscar archivos incrustados)')}</label>
    <button className="primary" style={{marginTop:0}} onClick={loadFixtures} disabled={busy}>{tr('Cargar fixtures SINTÉTICOS')}</button>
    {(reports.length>0||carves.length>0)&&<button className="secondary" style={{marginTop:0}} onClick={()=>{clearSession();setErrors([]);}}>{tr('Limpiar sesión')}</button>}
   </div>
   {errors.map((e,i)=><p key={i} role="alert" className="error">{tm(e)}</p>)}
   {busy&&<p role="status" className="muted" style={{display:'block'}}>{tr('Analizando…')}</p>}
   {ses.runs.length>0&&<div className="rz-runs" role="tablist" aria-label={tr('Archivos de esta sesión')}>{ses.runs.map(r=><button key={r.id} role="tab" aria-selected={active?.id===r.id} className={`rz-chip rz-o-${r.outcome}${active?.id===r.id?' active':''}`} onClick={()=>setActive(r.id)} title={tm(OUTCOME_LABEL[r.outcome])}><i aria-hidden="true"/>{r.name}</button>)}</div>}
   {active&&<ResurrectionView run={active} source={ses.sources[active.id]}/>}
   {reports.length===0&&carves.length===0&&!busy&&<div className="rz-empty"><div className="rz-empty-orb" aria-hidden="true"/><div><strong>{tr('Aún no hay archivos en esta sesión.')}</strong><p>{tr('Importa un archivo dañado o carga los fixtures sintéticos: verás las seis etapas del protocolo avanzar conforme el motor termina cada una.')}</p><ul style={{color:'var(--c-9c9d98)',fontSize:12,lineHeight:1.6}}>{FIXTURE_DAMAGE.map(d=><li key={d}>{tm(d)}</li>)}</ul></div></div>}
   {carves.map((c,i)=><CarveCard key={`c${i}`} c={c.c} synthetic={c.synthetic}/>)}
   {active?.report&&<details className="rz-detail" open={showDetail} onToggle={e=>setShowDetail((e.target as HTMLDetailsElement).open)}><summary>{tr('Informe técnico completo')}</summary><ReportCard r={active.report} synthetic={active.synthetic}/></details>}
  </>}

  {tab==='matriz'&&<>
   <p>{tr('Estado real de cada capacidad.')} <b>{res.implementadoProbado}</b> {tr('implementadas y probadas ·')} <b>{res.parcial}</b> {tr('parciales ·')} <b>{res.noImplementado}</b> {tr('no implementadas. La matriz está respaldada por pruebas automatizadas que verifican que cada entrada apunte a código y pruebas existentes.')}</p>
   <div className="tablewrap"><table><thead><tr><th>{tr('Área')}</th><th>{tr('Formato')}</th><th>{tr('Estado')}</th><th>{tr('Qué hace hoy')}</th><th>{tr('Limitaciones')}</th><th>{tr('Riesgos')}</th><th>{tr('Dependencias')}</th></tr></thead><tbody>
    {CAPACIDADES.map(c=><tr key={c.id}><td>{tm(AREA_LABEL[c.area])}</td><td>{tm(c.formato)}</td><td><span className={`vstatus ${EST_CLS[c.estado]}`}>{tm(ESTADO_LABEL[c.estado])}</span></td><td style={{fontSize:11}}>{tm(c.soporta)}</td><td style={{fontSize:11}}>{tm(c.limitaciones)}</td><td style={{fontSize:11}}>{tm(c.riesgos)}</td><td style={{fontSize:11}}>{tm(c.dependencias)}</td></tr>)}
   </tbody></table></div>
  </>}

  {tab==='arqueologia'&&<>
   <p className="inv-warn-line">⚠ <b>{tr('Solo diseño, sin implementar.')}</b> {tr('Hoy los ejecutables únicamente se identifican y se rechazan:')} <b>{tr('nunca se ejecutan')}</b>.</p>
   <div className="note"><span>◈</span><div><strong>{tr('Software Archaeology (diseño)')}</strong>
    <p>{tr('Análisis')} <b>{tr('estático y de solo lectura')}</b> {tr('de programas heredados (PE, ELF, Mach-O): cabeceras, secciones, importaciones, cadenas, entropía y recursos. Produce')} <b>{tr('hipótesis con evidencia localizable')}</b> {tr('sobre qué hacía el programa y propuestas de reconstrucción funcional etiquetadas como observadas, inferidas o propuestas.')}</p>
    <p><b>{tr('No afirma')}</b> {tr('recuperar el código fuente original ni la lógica de negocio completa. Sin ejecución, sin emulación en la primera versión y con los mismos límites de tamaño, memoria y tiempo.')}</p>
    <p>{tr('Detalle, fases y criterios de aceptación:')} <code>{tr('docs/software-archaeology.md')}</code>{tr('. Roadmap general:')} <code>{tr('docs/recuperacion-universal.md')}</code>.</p></div></div>
  </>}
 </div>;
}

