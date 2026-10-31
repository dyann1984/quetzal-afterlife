'use client';
import {useMemo,useState} from 'react';
import {ingest,IngestError,DEFAULT_LIMITS,type Ingested} from '../lib/ingest';
import {diagnose} from '../lib/discovery';
import {recoverTable,type RecoveredTable} from '../lib/recovery';
import {inferSchema} from '../lib/schema';
import {reconstruct,modelFingerprint,DEFAULT_OPTIONS,type Approvals} from '../lib/reconstruct';
import {localAnalyst,remoteAnalystPlaceholder,runAnalyst,toApprovals,ConsentError,type Proposal} from '../lib/analyst';
import {buildAppModel,createWorkingCopy,insertRow,updateRow,deleteRow,search,related,exportPrototypeHtml} from '../lib/studio';
import {buildDossier,verifyDossier,dossierJson,renderReportMarkdown,renderReportHtml,type Dossier,type TransformationStep,type VersionEntry} from '../lib/vault';
import {buildScenario,SCENARIO_LABEL,SCENARIO_DAMAGE} from '../lib/scenario';

export const ENGINE_SECTIONS=['Discovery','Recovery','Schema Intelligence','Reconstruction','AI Analyst','Resurrection Studio','Evidence Vault'] as const;
export type EngineSection=(typeof ENGINE_SECTIONS)[number];

const SEV:Record<string,string>={info:'vstatus-nc',aviso:'vstatus-only',dano:'vstatus-diff'};
const SEV_LABEL:Record<string,string>={info:'info',aviso:'aviso',dano:'daño'};
const PROV:Record<string,string>={original:'vstatus-ok',recuperado:'vstatus-only'};
const now=()=>new Date().toISOString();

function download(name:string,text:string,mime:string){
 const url=URL.createObjectURL(new Blob([text],{type:mime}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const short=(h:string)=>h.slice(0,10)+'…'+h.slice(-6);

function Banner({synthetic}:{synthetic:boolean}){
 return synthetic?<p className="demo-banner" role="note"><span className="demo-badge">SINTÉTICO</span> {SCENARIO_LABEL}. Daños controlados creados para esta demostración; no es una recuperación de archivos reales.</p>:null;
}
function Empty({go}:{go:()=>void}){
 return <><p>Todavía no hay evidencia. Importa archivos en <em>Discovery</em> o carga el escenario sintético.</p><button className="secondary" onClick={go}>Ir a Discovery →</button></>;
}

export default function Engine({section,goto}:{section:EngineSection|null;goto:(s:EngineSection)=>void}){
 const [items,setItems]=useState<Ingested[]>([]);
 const [synthetic,setSynthetic]=useState(false);
 const [errors,setErrors]=useState<string[]>([]);
 const [steps,setSteps]=useState<TransformationStep[]>([]);
 const [approvedIds,setApprovedIds]=useState<string[]>([]);
 const [applied,setApplied]=useState<Approvals>({relations:[],merges:[]});
 const [version,setVersion]=useState(1);
 const [history,setHistory]=useState<VersionEntry[]>([]);
 const [excludeDeleted,setExcludeDeleted]=useState(true);
 const [proposals,setProposals]=useState<Proposal[]|null>(null);
 const [rejectedCount,setRejectedCount]=useState(0);
 const [consent,setConsent]=useState(false);
 const [aiMsg,setAiMsg]=useState('');
 const [fp,setFp]=useState('');
 const [dossier,setDossier]=useState<Dossier|null>(null);
 const [dossierOk,setDossierOk]=useState<boolean|null>(null);
 // Recovery / Studio
 const [recTable,setRecTable]=useState('');
 const [entity,setEntity]=useState('');
 const [query,setQuery]=useState('');
 const [selKey,setSelKey]=useState('');
 const [rev,setRev]=useState(0);
 const [resetKey,setResetKey]=useState(0);
 const [form,setForm]=useState<Record<string,string>>({});
 const [opMsg,setOpMsg]=useState('');
 const [schemaSel,setSchemaSel]=useState('');

 const log=(step:string,description:string)=>setSteps(s=>[...s,{at:now(),step,description}]);

 const diagnoses=useMemo(()=>Object.fromEntries(items.map(i=>[i.evidence.id,diagnose(i.evidence,i.bytes)])),[items]);
 const tables:RecoveredTable[]=useMemo(()=>items.flatMap(i=>{const t=recoverTable(i.evidence,i.bytes);return t?[t]:[];}),[items]);
 const schema=useMemo(()=>inferSchema(tables),[tables]);
 const model=useMemo(()=>reconstruct(tables,schema,{...DEFAULT_OPTIONS,excludeDeleted,approved:applied,version,parentVersion:version>1?version-1:null}),[tables,schema,excludeDeleted,applied,version]);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 const wc=useMemo(()=>createWorkingCopy(model),[model,resetKey]);
 void rev;
 const app=useMemo(()=>buildAppModel(model),[model]);

 async function addFiles(files:{name:string;bytes:Uint8Array}[],isSynthetic:boolean){
  const errs:string[]=[];const added:Ingested[]=[];
  for(const f of files){
   try{added.push(await ingest(f.bytes,f.name,now()));}
   catch(e){errs.push(e instanceof IngestError||e instanceof Error?e.message:String(e));}
  }
  setErrors(errs);
  setItems(prev=>{const ids=new Set(prev.map(p=>p.evidence.id));return [...prev,...added.filter(a=>!ids.has(a.evidence.id))];});
  if(added.length){
   setSynthetic(s=>(items.length===0?isSynthetic:s&&isSynthetic));
   setSteps(s=>[...s,{at:now(),step:'ingesta',description:`${added.length} archivo(s) ingeridos como copia de trabajo con SHA-256: ${added.map(a=>a.evidence.name).join(', ')}`}]);
  }
 }
 async function onFiles(e:React.ChangeEvent<HTMLInputElement>){
  const list=[...(e.target.files??[])];
  // Se rechaza por tamaño ANTES de leer el contenido en memoria.
  const tooBig=list.filter(f=>f.size>DEFAULT_LIMITS.maxBytes);
  const files=await Promise.all(list.filter(f=>f.size<=DEFAULT_LIMITS.maxBytes).map(async f=>({name:f.name,bytes:new Uint8Array(await f.arrayBuffer())})));
  e.target.value='';
  await addFiles(files,false);
  if(tooBig.length)setErrors(prev=>[...prev,...tooBig.map(f=>`"${f.name}" supera el límite de ${DEFAULT_LIMITS.maxBytes/1048576} MB.`)]);
 }
 function loadScenario(){
  reset();
  void addFiles(buildScenario(),true);
 }
 function reset(){
  setItems([]);setSynthetic(false);setErrors([]);setSteps([]);setApprovedIds([]);setApplied({relations:[],merges:[]});setVersion(1);setHistory([]);
  setProposals(null);setDossier(null);setDossierOk(null);setFp('');setRecTable('');setEntity('');setSelKey('');setOpMsg('');setAiMsg('');setSchemaSel('');
 }
 async function newVersion(){
  const f=await modelFingerprint(model);
  setHistory(h=>[...h,{version,fingerprint:f,generatedAt:now(),note:`aprobaciones: ${applied.relations.length} relación(es), ${applied.merges.length} fusión(es)`}]);
  setVersion(v=>v+1);
  log('versión',`Se archivó la versión ${version} y se creó la ${version+1}.`);
 }

 // ── Analyst
 async function analyze(remote:boolean){
  setAiMsg('');
  try{
   const r=await runAnalyst(remote?remoteAnalystPlaceholder:localAnalyst,{tables,schema},{granted:consent,scope:'metadatos'});
   setProposals(r.valid);setRejectedCount(r.rejected.length);
   log('analista',`${r.valid.length} propuesta(s) con evidencia, ${r.rejected.length} descartada(s). Ninguna se aplicó.`);
  }catch(e){setAiMsg(e instanceof ConsentError?e.message:(e instanceof Error?e.message:String(e)));}
 }
 function applyApprovals(){
  if(!proposals)return;
  const ap=toApprovals(proposals,approvedIds);
  setApplied(ap);
  log('aprobación',`El usuario aprobó ${ap.relations.length} relación(es) y ${ap.merges.length} fusión(es): ${approvedIds.join(', ')||'ninguna'}.`);
 }

 // ── Vault
 async function makeDossier(){
  const d=await buildDossier({title:synthetic?'Expediente SINTÉTICO — Comercial Quetzal 1998':'Expediente de recuperación',synthetic,generatedAt:now(),evidences:items.map(i=>i.evidence),diagnoses,tables,schema,model,steps,approvals:applied,previousVersions:history});
  setDossier(d);setDossierOk(await verifyDossier(d));
 }

 const tablesReady=tables.length>0;
 const recT=tables.find(t=>t.name===recTable)??tables[0];
 const ent=app.entities.find(e=>e.name===entity)??app.entities[0];
 const entRows=ent?search(wc,ent.name,query):[];
 const rel=ent&&selKey?related(wc,ent.name,selKey):null;
 const sel=ent?wc.model.tables.find(t=>t.name===ent.name)?.rows.find(r=>r.key===selKey):undefined;

 function op(r:{ok:true}|{ok:false;error:string},okMsg:string){
  setOpMsg(r.ok?'✓ '+okMsg:'✗ '+r.error);if(r.ok)setRev(v=>v+1);
 }

 const hidden=section===null;
 return <div hidden={hidden}>
  {section==='Discovery'&&<div className="workspace">
   <span className="kicker">DISCOVERY / DIAGNÓSTICO DE FORMATOS</span>
   <h1>Discovery<span className="gold">.</span></h1>
   <p>Cada archivo se identifica por su contenido (no por su extensión), se calcula su SHA-256 y se analiza una copia. Nada se ejecuta ni se envía a un servidor.</p>
   <Banner synthetic={synthetic}/>
   <label className="drop" style={{maxWidth:'740px'}}>
    <span className="upload">↑</span><strong>Importar evidencias (varios archivos)</strong>
    <span>CSV · DBF · SQLite (solo diagnóstico) · hasta 4 MB cada uno</span>
    <input type="file" multiple onChange={onFiles} aria-label="Importar evidencias"/>
   </label>
   <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginTop:'14px'}}>
    <button className="primary" style={{marginTop:0}} onClick={loadScenario}>Cargar escenario SINTÉTICO</button>
    {items.length>0&&<button className="secondary" style={{marginTop:0}} onClick={reset}>Vaciar sesión</button>}
   </div>
   {errors.map((e,i)=><p key={i} role="alert" className="error">{e}</p>)}
   {items.length===0&&<div className="note"><span>◈</span><div><strong>Escenario sintético.</strong><p>Un sistema comercial inventado con clientes, productos, ventas, detalle e inventario, con daños controlados:</p><ul style={{color:'#9c9d98',fontSize:'12px',lineHeight:1.6}}>{SCENARIO_DAMAGE.map(d=><li key={d}>{d}</li>)}</ul></div></div>}
   {items.map(({evidence:e})=>{const d=diagnoses[e.id];return <div key={e.id} className="project-card">
    <div className="project-card-top"><div><span className="project-name">{e.name}</span> <span className="dbf-field-type">{e.format.toUpperCase()}</span> <span className={`vstatus ${d.damaged?'vstatus-diff':'vstatus-ok'}`}>{d.damaged?'con daños':'sin daños detectados'}</span></div><span className="muted">soporte: {d.supportLevel}</span></div>
    <div className="project-meta"><span>{e.size.toLocaleString('es-MX')} bytes</span><span title={e.sha256}>SHA-256 {short(e.sha256)}</span><span>identificación: {e.confidence}</span>{d.encoding&&<span>codificación: {d.encoding}</span>}</div>
    <p style={{fontSize:'11px',color:'#687784',margin:'8px 0'}}>Identificado por: {e.signals.join('; ')}.{d.encodingBasis?` Codificación: ${d.encodingBasis}.`:''}</p>
    {Object.keys(d.metadata).length>0&&<div className="project-meta">{Object.entries(d.metadata).map(([k,v])=><span key={k}>{k}: <b style={{color:'#c8d4dc'}}>{String(v)}</b></span>)}</div>}
    {d.tables.map(t=><p key={t.name} style={{fontSize:'12px',color:'#94a0ac'}}>Tabla {t.name}: {t.columns.map(c=>c.type?`${c.name} ${c.type}`:c.name).join(', ')}</p>)}
    {d.findings.length>0&&<div className="inv-warnings">{d.findings.slice(0,12).map((f,i)=><p key={i} className="inv-warn-line"><span className={`vstatus ${SEV[f.severity]}`}>{SEV_LABEL[f.severity]}</span> {f.message}{f.offset!==undefined?` (offset ${f.offset})`:''}</p>)}{d.findings.length>12&&<p className="inv-warn-line">… {d.findings.length-12} hallazgos más.</p>}</div>}
   </div>;})}
   {tablesReady&&<p className="inv-hint" style={{marginTop:'16px'}}>Siguiente: <button className="link-btn" onClick={()=>goto('Recovery')}>Recovery →</button></p>}
  </div>}

  {section==='Recovery'&&<div className="workspace">
   <span className="kicker">RECOVERY / RECUPERACIÓN PARCIAL</span>
   <h1>Recovery<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&<Empty go={()=>goto('Discovery')}/>}
   {tablesReady&&recT&&<>
    <p>Se recupera lo legible y se separa lo <b>original</b> (leído sin anomalías), lo <b>recuperado</b> (zona dañada) y lo <b>desconocido</b> (celda ilegible: no se estima).</p>
    <div className="tablewrap"><table><thead><tr><th>Tabla</th><th>Declarados</th><th>Leídos</th><th>Íntegros</th><th>Recuperados con daño</th><th>Perdidos</th><th>Celdas desconocidas</th></tr></thead><tbody>
     {tables.map(t=><tr key={t.name} style={{cursor:'pointer'}} onClick={()=>setRecTable(t.name)}><td>{t.name}</td><td>{t.report.declared??'n/d'}</td><td>{t.report.read}</td><td>{t.report.intact}</td><td style={{color:t.report.recoveredDamaged?'#d3b273':undefined}}>{t.report.recoveredDamaged}</td><td style={{color:t.report.lost?'#ff9292':undefined}}>{t.report.lost}</td><td>{t.report.cellsUnknown}</td></tr>)}
    </tbody></table></div>
    <span className="kicker">REGISTROS DE {recT.name}</span>
    <div className="tablewrap"><table><thead><tr><th>Ref.</th><th>Procedencia</th>{recT.columns.map(c=><th key={c.name}>{c.name}</th>)}<th>Observaciones</th></tr></thead><tbody>
     {recT.rows.slice(0,40).map(r=><tr key={r.ref} className={r.deleted?'dbf-row-deleted':''}><td>{r.ref}</td><td><span className={`vstatus ${PROV[r.provenance]}`}>{r.provenance}</span>{r.deleted&&' · borrado'}</td>
      {recT.columns.map(c=><td key={c.name}>{r.unknownFields.includes(c.name)?<span className="vstatus vstatus-diff">desconocido</span>:r.values[c.name]}</td>)}
      <td style={{fontSize:'11px',color:'#94a0ac'}}>{r.issues.join('; ')}</td></tr>)}
    </tbody></table></div>
    {recT.rows.length>40&&<p className="muted" style={{display:'block'}}>Mostrando 40 de {recT.rows.length}. El expediente incluye todos.</p>}
    {recT.report.unrecoverable.length>0&&<div className="inv-warnings"><span className="kicker">SEGMENTOS IRRECUPERABLES</span>{recT.report.unrecoverable.map((u,i)=><p key={i} className="inv-warn-line">bytes {u.start}–{u.end}: {u.reason}</p>)}</div>}
    <p className="inv-hint" style={{marginTop:'16px'}}>Siguiente: <button className="link-btn" onClick={()=>goto('Schema Intelligence')}>Schema Intelligence →</button></p>
   </>}
  </div>}

  {section==='Schema Intelligence'&&<div className="workspace">
   <span className="kicker">SCHEMA / INFERENCIA RELACIONAL</span>
   <h1>Schema Intelligence<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&<Empty go={()=>goto('Discovery')}/>}
   {tablesReady&&<>
    <p className="inv-warn-line">⚠ Todo lo mostrado aquí es INFERIDO a partir de los datos recuperados. Ninguna clave ni relación proviene del sistema original.</p>
    <SchemaDiagram schema={schema} sel={schemaSel} onSel={setSchemaSel}/>
    <div className="tablewrap"><table><thead><tr><th>Tabla</th><th>Activos</th><th>Borrados</th><th>Clave primaria (inferida)</th><th>Columnas</th></tr></thead><tbody>
     {schema.tables.map(t=><tr key={t.name} style={{background:schemaSel===t.name?'#101e29':undefined}}><td>{t.name}</td><td>{t.activeRows}</td><td>{t.deletedRows}</td><td>{t.primaryKey?<>{t.primaryKey.columns.join(' + ')} <span className={`inv-field-conf inv-conf-${t.primaryKey.confidence}`}>{t.primaryKey.confidence}</span><br/><small style={{color:'#687784'}}>{t.primaryKey.evidence}</small></>:'—'}</td><td style={{fontSize:'11px'}}>{t.columns.map(c=>`${c.name}:${c.inferredType}`).join(' · ')}</td></tr>)}
    </tbody></table></div>
    <span className="kicker">RELACIONES INFERIDAS</span>
    {schema.relations.length===0&&<p>No se infirieron relaciones.</p>}
    {schema.relations.map(r=><div key={r.id} className="project-card" style={{borderColor:schemaSel&&(schemaSel===r.child.table||schemaSel===r.parent.table)?'#2cc7fa':undefined}}>
     <div className="project-card-top"><span className="project-name">{r.child.table}.{r.child.column} → {r.parent.table}.{r.parent.column}</span><span><span className="dbf-field-type">{r.cardinality}</span> <span className={`inv-field-conf inv-conf-${r.confidence}`}>{r.confidence}</span> <span className="vstatus vstatus-only">inferido</span></span></div>
     <ul style={{fontSize:'12px',color:'#94a0ac',lineHeight:1.6,margin:'8px 0 0'}}>{r.evidence.map((e,i)=><li key={i}>{e}</li>)}</ul>
     {r.orphans.length>0&&<p className="inv-warn-line">⚠ Sin padre: {r.orphans.join(', ')}{r.possiblyExplainedByLoss?' — coherente con registros perdidos por daño en '+r.parent.table+' (no probado)':''}</p>}
    </div>)}
    {schema.issues.length>0&&<><span className="kicker">INCONSISTENCIAS Y DUPLICADOS</span><div className="inv-warnings">{schema.issues.map((i,k)=><p key={k} className="inv-warn-line">⚠ [{i.table}] {i.message}</p>)}</div></>}
    <p className="inv-hint" style={{marginTop:'16px'}}>Siguiente: <button className="link-btn" onClick={()=>goto('AI Analyst')}>AI Analyst (aprobar propuestas) →</button></p>
   </>}
  </div>}

  {section==='Reconstruction'&&<div className="workspace">
   <span className="kicker">RECONSTRUCTION / MODELO MULTITABLA</span>
   <h1>Reconstruction<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&<Empty go={()=>goto('Discovery')}/>}
   {tablesReady&&<>
    <p>Modelo v{version}{version>1?` (deriva de v${version-1})`:''}. Solo se aplican las relaciones y fusiones que aprobaste en <button className="link-btn" onClick={()=>goto('AI Analyst')}>AI Analyst</button>.</p>
    <label style={{fontSize:'12px',color:'#94a0ac',display:'block',margin:'10px 0'}}><input type="checkbox" checked={excludeDeleted} onChange={e=>setExcludeDeleted(e.target.checked)}/> Excluir registros marcados como borrados (regla R-borrados)</label>
    <div className="inv-totals">
     {model.tables.map(t=><div key={t.name} className="inv-total-card"><span className="inv-total-label">{t.name}</span><span className="inv-total-val">{t.rows.length}</span><span className="inv-total-sub">{t.rows.filter(r=>!r.complete).length} parcial(es) · clave {t.primaryKey?.join('+')??'—'} (inferida)</span></div>)}
    </div>
    <span className="kicker">VALIDACIONES DE INTEGRIDAD</span>
    {model.integrity.length===0&&<p>Sin validaciones aún.</p>}
    <div className="inv-warnings">{model.integrity.map(i=><p key={i.id} className="inv-warn-line"><span className={`vstatus ${i.status==='ok'?'vstatus-ok':i.status==='falla'?'vstatus-diff':'vstatus-only'}`}>{i.status}</span> {i.message}</p>)}</div>
    <span className="kicker">REGLAS APLICADAS</span>
    {model.rules.length===0&&<p>Ninguna.</p>}
    {model.rules.map(r=><p key={r.id} style={{fontSize:'12px',color:'#94a0ac'}}><b style={{color:'#c8d4dc'}}>{r.id}</b> — {r.description} <small>({r.affected} afectado(s): refs {r.refs.slice(0,10).join(', ')})</small></p>)}
    {model.excluded.length>0&&<><span className="kicker">EXCLUIDOS (CONSERVADOS PARA TRAZABILIDAD)</span><p style={{fontSize:'12px',color:'#94a0ac'}}>{model.excluded.map(x=>`${x.table} #${x.ref}: ${x.reason}${x.mergedInto?` → #${x.mergedInto}`:''}`).join(' · ')}</p></>}
    <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginTop:'14px',alignItems:'center'}}>
     <button className="secondary" style={{marginTop:0}} onClick={newVersion}>Archivar y crear versión {version+1}</button>
     <button className="secondary" style={{marginTop:0}} onClick={async()=>setFp(await modelFingerprint(model))}>Calcular huella del modelo</button>
     {fp&&<code style={{fontSize:'11px',color:'#d3b273'}}>{fp}</code>}
    </div>
    {history.length>0&&<p style={{fontSize:'11px',color:'#687784'}}>Versiones previas: {history.map(h=>`v${h.version} ${h.fingerprint.slice(0,10)}…`).join(' · ')}</p>}
   </>}
  </div>}

  {section==='AI Analyst'&&<div className="workspace">
   <span className="kicker">AI RECOVERY ANALYST / PROPUESTAS CON EVIDENCIA</span>
   <h1>AI Analyst<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&<Empty go={()=>goto('Discovery')}/>}
   {tablesReady&&<>
    <div className="note"><span>◈</span><div><strong>Privacidad.</strong><p>El analista local usa reglas deterministas y no envía nada fuera de tu navegador. El módulo está desacoplado: un proveedor de IA externo solo podría recibir metadatos, y únicamente con tu consentimiento. Hoy no hay ninguno configurado ni credenciales.</p></div></div>
    <div style={{display:'flex',gap:'10px',flexWrap:'wrap',alignItems:'center'}}>
     <button className="primary" style={{marginTop:0}} onClick={()=>analyze(false)}>Analizar con el analista local</button>
     <label style={{fontSize:'12px',color:'#94a0ac'}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Consiento enviar solo metadatos a un proveedor externo</label>
     <button className="secondary" style={{marginTop:0}} onClick={()=>analyze(true)}>Probar proveedor de IA externo</button>
    </div>
    {aiMsg&&<p role="alert" className="error">{aiMsg}</p>}
    {proposals&&<>
     <p style={{fontSize:'12px',color:'#94a0ac',marginTop:'16px'}}>{proposals.length} propuesta(s) con evidencia · {rejectedCount} descartada(s) por falta de evidencia. <b>Nada se aplica hasta que lo apruebes.</b></p>
     {proposals.map(p=><div key={p.id} className="project-card">
      <div className="project-card-top"><label style={{display:'flex',gap:'8px',alignItems:'center'}}>
       {p.action.type!=='none'?<input type="checkbox" checked={approvedIds.includes(p.id)} onChange={e=>setApprovedIds(a=>e.target.checked?[...a,p.id]:a.filter(x=>x!==p.id))} aria-label={`Aprobar: ${p.title}`}/>:<span className="vstatus vstatus-nc">informativa</span>}
       <span className="project-name">{p.title}</span></label><span className="dbf-field-type">{p.kind.replace('_',' ')}</span></div>
      <p style={{fontSize:'12px',color:'#94a0ac',margin:'8px 0'}}>{p.explanation}</p>
      <ul style={{fontSize:'11px',color:'#687784',margin:0}}>{p.evidence.slice(0,6).map((e,i)=><li key={i}>{e}</li>)}</ul>
     </div>)}
     <button className="primary" onClick={applyApprovals}>Aplicar {approvedIds.length} aprobación(es) al modelo</button>
     {applied.relations.length+applied.merges.length>0&&<p className="save-ok">✓ Aplicadas: {applied.relations.length} relación(es), {applied.merges.length} fusión(es). Ver <button className="link-btn" onClick={()=>goto('Reconstruction')}>Reconstruction →</button></p>}
    </>}
   </>}
  </div>}

  {section==='Resurrection Studio'&&<div className="workspace">
   <span className="kicker">STUDIO / APLICACIÓN RECONSTRUIDA</span>
   <h1>Resurrection Studio<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&<Empty go={()=>goto('Discovery')}/>}
   {tablesReady&&ent&&<>
    <p className="inv-warn-line">⚠ {app.notice}</p>
    <p style={{fontSize:'12px',color:'#94a0ac'}}>Edición solo sobre una <b>copia de trabajo</b>; la evidencia y el modelo reconstruido no cambian. {model.relations.length===0&&'Aprueba relaciones en AI Analyst para habilitar la navegación entre entidades.'}</p>
    <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'12px'}}>
     {app.entities.map(e=><button key={e.name} className={e.name===ent.name?'primary':'secondary'} style={{marginTop:0,padding:'8px 12px'}} onClick={()=>{setEntity(e.name);setSelKey('');setQuery('');setForm({});setOpMsg('');}}>{e.name}</button>)}
    </div>
    <input className="project-name-input" placeholder={`Buscar en ${ent.name}…`} value={query} onChange={e=>setQuery(e.target.value)} aria-label="Buscar"/>
    <div className="tablewrap"><table><thead><tr>{ent.fields.map(f=><th key={f.name}>{f.name}{f.isKey?' 🔑':''}</th>)}<th>Procedencia</th></tr></thead><tbody>
     {entRows.slice(0,50).map(r=><tr key={r.key} onClick={()=>{setSelKey(r.key);setForm({...r.values});setOpMsg('');}} style={{cursor:'pointer',background:r.key===selKey?'#101e29':undefined}}>
      {ent.fields.map(f=><td key={f.name}>{r.values[f.name]||(r.lineage.unknownFields.includes(f.name)?<span className="vstatus vstatus-diff">desconocido</span>:'')}</td>)}
      <td><span className={`vstatus ${PROV[r.lineage.provenance]}`}>{r.lineage.provenance}</span>{!r.complete&&' · parcial'}</td></tr>)}
    </tbody></table></div>
    <p className="muted" style={{display:'block'}}>{entRows.length} registro(s){entRows.length>50?' (mostrando 50)':''}</p>
    {sel&&rel&&<div className="project-card"><span className="kicker">DETALLE · {ent.name} {sel.key}</span>
     <p style={{fontSize:'11px',color:'#687784'}}>Origen: {sel.lineage.evidenceName}, registro {sel.lineage.ref||'—'}. {sel.lineage.issues.join('; ')}</p>
     {rel.parents.map(p=><p key={p.relationId} style={{fontSize:'12px',color:'#c8d4dc'}}>↑ {p.table}: {Object.values(p.row.values).join(' · ')}</p>)}
     {rel.children.map(c=><p key={c.relationId} style={{fontSize:'12px',color:'#c8d4dc'}}>↓ {c.table} ({c.rows.length}): {c.rows.slice(0,4).map(r=>r.key).join(', ')}{c.rows.length>4?'…':''}</p>)}
    </div>}
    <div className="save-panel"><span className="kicker">CRUD EN LA COPIA DE TRABAJO</span>
     <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'8px',marginTop:'10px'}}>
      {ent.fields.map(f=><input key={f.name} className="project-name-input" style={{minWidth:0}} placeholder={f.name} aria-label={f.name} value={form[f.name]??''} onChange={e=>setForm(v=>({...v,[f.name]:e.target.value}))}/>)}
     </div>
     <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'10px'}}>
      <button className="secondary" style={{marginTop:0}} onClick={()=>op(insertRow(wc,ent.name,form,now()),'Registro insertado en la copia.')}>Insertar</button>
      <button className="secondary" style={{marginTop:0}} disabled={!selKey} onClick={()=>{const r=updateRow(wc,ent.name,selKey,form,now());op(r,'Registro actualizado.');if(r.ok){const t=wc.model.tables.find(x=>x.name===ent.name);const k=t?.primaryKey?t.primaryKey.map(c=>form[c]).join('|'):selKey;setSelKey(k);}}}>Actualizar seleccionado</button>
      <button className="secondary" style={{marginTop:0}} disabled={!selKey} onClick={()=>{const r=deleteRow(wc,ent.name,selKey,now());op(r,'Registro eliminado de la copia.');if(r.ok)setSelKey('');}}>Eliminar seleccionado</button>
      <button className="secondary" style={{marginTop:0}} onClick={()=>{setResetKey(k=>k+1);setOpMsg('✓ Copia restablecida desde el modelo.');setSelKey('');}}>Restablecer copia</button>
     </div>
     {opMsg&&<p className={opMsg.startsWith('✓')?'save-ok':'save-err'} role="status">{opMsg}</p>}
     <details style={{marginTop:'10px'}}><summary style={{fontSize:'12px',color:'#94a0ac'}}>Reglas CRUD explícitas</summary><ul style={{fontSize:'11px',color:'#94a0ac'}}>{app.crudRules.map(r=><li key={r}>{r}</li>)}</ul></details>
     {wc.log.length>0&&<details><summary style={{fontSize:'12px',color:'#94a0ac'}}>Historial de la copia ({wc.log.length})</summary><ul style={{fontSize:'11px',color:'#94a0ac'}}>{wc.log.map((l,i)=><li key={i}>{l.op} {l.table} {l.key}</li>)}</ul></details>}
    </div>
    <button className="secondary" onClick={()=>{download('prototipo-reconstruido.html',exportPrototypeHtml(wc,{title:synthetic?'Sistema reconstruido (SINTÉTICO)':'Sistema reconstruido',synthetic}),'text/html');log('exportación','Se exportó un prototipo HTML de solo consulta.');}}>Exportar prototipo (HTML de solo consulta)</button>
   </>}
  </div>}

  {section==='Evidence Vault'&&<div className="workspace">
   <span className="kicker">VAULT / EXPEDIENTE FORENSE</span>
   <h1>Evidence Vault<span className="gold">.</span></h1>
   <Banner synthetic={synthetic}/>
   {!tablesReady&&items.length===0&&<Empty go={()=>goto('Discovery')}/>}
   {items.length>0&&<>
    <span className="kicker">EVIDENCIAS Y HUELLAS</span>
    <div className="tablewrap"><table><thead><tr><th>Archivo</th><th>Formato</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>{items.map(i=><tr key={i.evidence.id}><td>{i.evidence.name}</td><td>{i.evidence.format}</td><td>{i.evidence.size}</td><td style={{fontFamily:'monospace',fontSize:'10px'}}>{i.evidence.sha256}</td></tr>)}</tbody></table></div>
    <span className="kicker">HISTORIAL DE TRANSFORMACIONES</span>
    <ul style={{fontSize:'12px',color:'#94a0ac',lineHeight:1.7}}>{steps.map((s,i)=><li key={i}><b style={{color:'#c8d4dc'}}>{s.step}</b> — {s.description}</li>)}</ul>
    <button className="primary" onClick={makeDossier}>Generar expediente</button>
    {dossier&&<>
     <p className={dossierOk?'save-ok':'save-err'} role="status">{dossierOk?'✓ Integridad verificada':'✗ El expediente no coincide con su hash'} · SHA-256 del expediente <code style={{fontSize:'10px'}}>{dossier.dossierSha256}</code></p>
     <div className="inv-totals">
      <div className="inv-total-card"><span className="inv-total-label">Incertidumbre</span><span className="inv-total-val">{dossier.uncertainty.length}</span><span className="inv-total-sub">elementos registrados</span></div>
      <div className="inv-total-card"><span className="inv-total-label">Registros con linaje</span><span className="inv-total-val">{dossier.records.length}</span><span className="inv-total-sub">modelo v{dossier.versions[dossier.versions.length-1].version}</span></div>
      <div className="inv-total-card"><span className="inv-total-label">Perdidos</span><span className="inv-total-val" style={{color:'#ff9292'}}>{dossier.recovery.reduce((n,r)=>n+r.lost,0)}</span><span className="inv-total-sub">declarados y ausentes</span></div>
     </div>
     <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
      <button className="secondary" style={{marginTop:0}} onClick={()=>download('expediente.json',dossierJson(dossier),'application/json')}>Descargar expediente JSON</button>
      <button className="secondary" style={{marginTop:0}} onClick={()=>download('informe.md',renderReportMarkdown(dossier),'text/markdown')}>Informe Markdown</button>
      <button className="secondary" style={{marginTop:0}} onClick={()=>download('informe.html',renderReportHtml(dossier),'text/html')}>Informe HTML</button>
      <button className="secondary" style={{marginTop:0}} onClick={async()=>setDossierOk(await verifyDossier(dossier))}>Verificar de nuevo</button>
     </div>
     <span className="kicker" style={{display:'block',marginTop:'20px'}}>REGISTRO DE INCERTIDUMBRE</span>
     <ul style={{fontSize:'12px',color:'#94a0ac',lineHeight:1.6}}>{dossier.uncertainty.slice(0,40).map((u,i)=><li key={i}><span className="dbf-field-type">{u.kind.replace('_',' ')}</span> {u.subject}: {u.detail}</li>)}</ul>
    </>}
   </>}
  </div>}
 </div>;
}

function SchemaDiagram({schema,sel,onSel}:{schema:ReturnType<typeof inferSchema>;sel:string;onSel:(n:string)=>void}){
 const n=schema.tables.length;
 if(n===0)return null;
 const W=680,H=360,cx=W/2,cy=H/2,rx=250,ry=125;
 const pos=new Map(schema.tables.map((t,i)=>{const a=-Math.PI/2+i*2*Math.PI/n;return [t.name,{x:cx+rx*Math.cos(a),y:cy+ry*Math.sin(a)}];}));
 return <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Diagrama relacional inferido" style={{width:'100%',maxWidth:'760px',background:'#0a0f15',border:'1px solid #263440',margin:'14px 0'}}>
  <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2cc7fa"/></marker></defs>
  {schema.relations.map(r=>{const a=pos.get(r.child.table),b=pos.get(r.parent.table);if(!a||!b)return null;
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const sx=a.x+dx/len*58,sy=a.y+dy/len*20,ex=b.x-dx/len*62,ey=b.y-dy/len*24;
   return <g key={r.id}><line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#2cc7fa" strokeWidth={sel&&(sel===r.child.table||sel===r.parent.table)?2.5:1.2} strokeDasharray={r.confidence==='baja'?'5 4':undefined} markerEnd="url(#arr)"/>
    <text x={(sx+ex)/2} y={(sy+ey)/2-4} fill="#d3b273" fontSize="10" textAnchor="middle">{r.cardinality}</text></g>;})}
  {schema.tables.map(t=>{const p=pos.get(t.name)!;return <g key={t.name} onClick={()=>onSel(sel===t.name?'':t.name)} style={{cursor:'pointer'}} tabIndex={0} role="button" aria-label={`Tabla ${t.name}`} onKeyDown={e=>{if(e.key==='Enter')onSel(sel===t.name?'':t.name);}}>
   <rect x={p.x-58} y={p.y-20} width="116" height="40" rx="4" fill={sel===t.name?'#101e29':'#0d1720'} stroke={sel===t.name?'#2cc7fa':'#d3b273'}/>
   <text x={p.x} y={p.y-3} fill="#e9edf1" fontSize="12" textAnchor="middle" fontWeight="bold">{t.name}</text>
   <text x={p.x} y={p.y+12} fill="#687784" fontSize="9" textAnchor="middle">{t.activeRows} reg · PK {t.primaryKey?.columns.join('+')??'—'}</text></g>;})}
 </svg>;
}
