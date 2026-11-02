'use client';
import {useState,useEffect,useCallback} from 'react';
import {analyzeCsv,MAX_BYTES,type CsvResult} from '../lib/csv';
import {parseDbf,MAX_DBF_BYTES,type DbfResult} from '../lib/dbf';
import {reconstructInventory,type InventoryResult,type InventoryRow} from '../lib/inventory';
import {verifyInventory,type VerificationResult} from '../lib/verification';
import {
  ProjectStorage,upsertProject,deleteProject,createProject,addEvidence,addVerification,
  type Project,type ProjectStore,
} from '../lib/project';
import {exportInventoryCsv,exportInventoryJson,exportVerificationCsv,exportVerificationJson,inferredFields} from '../lib/export';
import Engine,{ENGINE_SECTIONS,type EngineSection} from './engine';
import type {Stage} from '../lib/experience';
import HeroHologram from './experience/HeroHologram';
import Quetzalito from './quetzalito/Quetzalito';
import {DEMO_CSV_A,DEMO_CSV_B,DEMO_INV_A,DEMO_INV_B,DEMO_VERIFICATION} from '../lib/demo';
import {tr,tf,tm,nf,useUi} from '../lib/i18n';
import UiControls from './UiControls';
import GuidedDemo from './guided-demo';

const sections=['Dashboard','Nueva recuperación','Laboratorio','Verificación','Archivo'] as const;
type Section=(typeof sections)[number]|EngineSection;
// Etapa de la experiencia 3D que corresponde a cada sección (por defecto, la materialización).
const STAGE_FOR_SECTION:Partial<Record<Section,Stage>>={Discovery:'discovery',Recovery:'recovery','Schema Intelligence':'reconstruction',Reconstruction:'reconstruction','AI Analyst':'reconstruction','Resurrection Studio':'studio','Evidence Vault':'vault'};
const isEngineSection=(s:Section):s is EngineSection=>(ENGINE_SECTIONS as readonly string[]).includes(s);
const CONF:Record<string,string>={alto:'◉ alto',medio:'◎ medio',bajo:'○ bajo'};
const ROL:Record<string,string>={id:'IDENTIFICADOR',cantidad:'CANTIDAD',nombre:'NOMBRE'};
const STATUS_LABEL:Record<string,string>={
  verificado:'✓ verificado',discrepancia:'✗ discrepancia',
  solo_principal:'solo fuente',solo_referencia:'solo referencia',no_comparable:'no comparable'
};
const STATUS_CLASS:Record<string,string>={
  verificado:'vstatus-ok',discrepancia:'vstatus-diff',
  solo_principal:'vstatus-only',solo_referencia:'vstatus-only',no_comparable:'vstatus-nc'
};

export default function Home(){
 // ── Sesión de trabajo ────────────────────────────────────────────────────
 useUi();   // idioma y tema globales: al cambiar se vuelve a pintar toda la página
 const [section,setSection]=useState<Section>('Dashboard');
 const [csvResult,setCsvResult]=useState<CsvResult|null>(null);
 const [dbfResult,setDbfResult]=useState<DbfResult|null>(null);
 const [invResult,setInvResult]=useState<InventoryResult|null>(null);
 const [filename,setFilename]=useState('');
 const [fileType,setFileType]=useState<'csv'|'dbf'|null>(null);
 const [error,setError]=useState('');
 // Verificación
 const [refCsvResult,setRefCsvResult]=useState<CsvResult|null>(null);
 const [refInvResult,setRefInvResult]=useState<InventoryResult|null>(null);
 const [refFilename,setRefFilename]=useState('');
 const [refError,setRefError]=useState('');
 const [verResult,setVerResult]=useState<VerificationResult|null>(null);
 // Proyecto activo
 const [projectName,setProjectName]=useState('');
 const [savedMsg,setSavedMsg]=useState('');
 const [isDemo,setIsDemo]=useState(false);
 const [expOpen,setExpOpen]=useState(false);
 const [demoOpen,setDemoOpen]=useState(false);
 // Store
 const [store,setStore]=useState<ProjectStore>({version:1,projects:[]});
 const [openProject,setOpenProject]=useState<Project|null>(null);

 // Hidratación desde localStorage: solo puede leerse tras montar en el cliente.
 // eslint-disable-next-line react-hooks/set-state-in-effect
 useEffect(()=>{setStore(ProjectStorage.load());},[]);

 // ── Importación de archivo principal ─────────────────────────────────────
 const upload=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const f=e.target.files?.[0];if(!f)return;
  setCsvResult(null);setDbfResult(null);setInvResult(null);setVerResult(null);
  setRefCsvResult(null);setRefInvResult(null);setRefFilename('');setIsDemo(false);
  setError('');setFilename('');setFileType(null);
  try{
   const bytes=new Uint8Array(await f.arrayBuffer());
   const ext=f.name.toLowerCase().split('.').pop();
   if(ext==='dbf'){
    if(f.size>MAX_DBF_BYTES)throw new Error('El archivo supera el límite de 4 MB.');
    const r=parseDbf(bytes,f.name);
    setDbfResult(r);setFilename(f.name);setFileType('dbf');
    const invRows:InventoryRow[]=r.records.map(rec=>({values:rec.values,deleted:rec.deleted}));
    setInvResult(reconstructInventory(r.fields.map(fld=>fld.name),invRows));
   }else{
    if(f.size>MAX_BYTES)throw new Error('El archivo supera el límite de 2 MB.');
    const r=analyzeCsv(bytes,f.name);
    setCsvResult(r);setFilename(f.name);setFileType('csv');
    const invRows:InventoryRow[]=r.rows.map(row=>{
     const values:Record<string,string>={};
     r.headers.forEach((h,i)=>{values[h]=row[i]??'';});
     return {values,deleted:false};
    });
    setInvResult(reconstructInventory(r.headers,invRows));
   }
  }catch(err){setError(err instanceof Error?err.message:'No se pudo analizar el archivo.');}
  e.target.value='';
 },[]);

 // ── Importación de archivo de referencia (Verificación) ──────────────────
 const uploadRef=useCallback(async(e:React.ChangeEvent<HTMLInputElement>)=>{
  const f=e.target.files?.[0];if(!f)return;
  setRefCsvResult(null);setRefInvResult(null);setRefFilename('');setRefError('');setVerResult(null);
  try{
   const bytes=new Uint8Array(await f.arrayBuffer());
   const ext=f.name.toLowerCase().split('.').pop();
   let headers:string[];
   let invRows:InventoryRow[];
   if(ext==='dbf'){
    if(f.size>MAX_DBF_BYTES)throw new Error('Referencia: supera el límite de 4 MB.');
    const r=parseDbf(bytes,f.name);
    headers=r.fields.map(fld=>fld.name);
    invRows=r.records.map(rec=>({values:rec.values,deleted:rec.deleted}));
   }else{
    if(f.size>MAX_BYTES)throw new Error('Referencia: supera el límite de 2 MB.');
    const r=analyzeCsv(bytes,f.name);
    setRefCsvResult(r);
    headers=r.headers;
    invRows=r.rows.map(row=>{const values:Record<string,string>={};r.headers.forEach((h,i)=>{values[h]=row[i]??'';});return {values,deleted:false};});
   }
   const ri=reconstructInventory(headers,invRows);
   setRefInvResult(ri);setRefFilename(f.name);
   if(invResult){
    const vr=verifyInventory(invResult,ri,filename,f.name,new Date().toISOString());
    setVerResult(vr);
   }
  }catch(err){setRefError(err instanceof Error?err.message:'No se pudo analizar la referencia.');}
  e.target.value='';
 },[invResult,filename]);

 // ── Guardar proyecto ──────────────────────────────────────────────────────
 function saveProject(){
  if(!invResult&&!verResult){setSavedMsg('⚠ No hay datos para guardar.');return;}
  try{
   const name=projectName.trim()||filename||tr('Proyecto sin nombre');
   let p=createProject(name,isDemo);
   if(filename&&invResult){
    p=addEvidence(p,{filename,type:fileType??'csv',importedAt:new Date().toISOString(),
     csvResult:csvResult??undefined,dbfResult:dbfResult??undefined,inventoryResult:invResult});
   }
   if(refFilename&&refInvResult){
    p=addEvidence(p,{filename:refFilename,type:refFilename.toLowerCase().endsWith('.dbf')?'dbf':'csv',importedAt:new Date().toISOString(),
     csvResult:refCsvResult??undefined,inventoryResult:refInvResult});
   }
   if(verResult&&p.evidences.length>=2){
    p=addVerification(p,{executedAt:new Date().toISOString(),
     principalEvidenceId:p.evidences[0].id,referenceEvidenceId:p.evidences[1].id,result:verResult});
   }
   const newStore=upsertProject(store,p);
   ProjectStorage.save(newStore);
   setStore(newStore);
   setSavedMsg(`✓ Proyecto "${p.name}" guardado.`);
   setTimeout(()=>setSavedMsg(''),4000);
  }catch(e){setSavedMsg(`Error al guardar: ${e instanceof Error?e.message:String(e)}`);}
 }

 // ── Cargar demo ───────────────────────────────────────────────────────────
 function loadDemo(){
  setCsvResult(DEMO_CSV_A);setFilename('sistema-A-demo.csv');setFileType('csv');
  setInvResult(DEMO_INV_A);setRefCsvResult(DEMO_CSV_B);setRefFilename('sistema-B-demo.csv');
  setRefInvResult(DEMO_INV_B);setVerResult(DEMO_VERIFICATION);
  setError('');setRefError('');setProjectName('Demo Kiroween 2026');setIsDemo(true);
  setSection('Laboratorio');
 }

 // ── Exportación (descarga local, sin red) ─────────────────────────────────
 function download(name:string,text:string,mime:string){
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function exportInv(fmt:'json'|'csv'){
  if(!invResult)return;
  const ctx={filename,synthetic:isDemo,generatedAt:new Date().toISOString()};
  const base=(filename||'inventario').replace(/\.[^.]+$/,'')+'-reconstruccion';
  if(fmt==='json')download(base+'.json',exportInventoryJson(invResult,ctx),'application/json');
  else download(base+'.csv',exportInventoryCsv(invResult,ctx),'text/csv;charset=utf-8');
 }
 function exportVer(fmt:'json'|'csv'){
  if(!verResult)return;
  const ctx={filename,synthetic:isDemo,generatedAt:new Date().toISOString()};
  if(fmt==='json')download('verificacion.json',exportVerificationJson(verResult,ctx),'application/json');
  else download('verificacion.csv',exportVerificationCsv(verResult,ctx),'text/csv;charset=utf-8');
 }

 // ── Abrir proyecto guardado ───────────────────────────────────────────────
 function openSavedProject(p:Project){
  setOpenProject(p);setSection('Archivo');
 }
 // Restaura la sesión de trabajo desde un proyecto guardado (reabrir).
 function restoreProject(p:Project){
  const main=p.evidences[0];const ref=p.evidences[1];
  setCsvResult(main?.csvResult??null);setDbfResult(main?.dbfResult??null);
  setInvResult(main?.inventoryResult??null);setFilename(main?.filename??'');setFileType(main?.type??null);
  setRefCsvResult(ref?.csvResult??null);setRefInvResult(ref?.inventoryResult??null);setRefFilename(ref?.filename??'');
  setVerResult(p.verifications.length?p.verifications[p.verifications.length-1].result:null);
  setError('');setRefError('');setProjectName(p.name);setIsDemo(p.isDemo);setSection('Laboratorio');
 }
 function deleteProjectById(id:string){
  const ns=deleteProject(store,id);
  ProjectStorage.save(ns);setStore(ns);
  if(openProject?.id===id)setOpenProject(null);
 }

 return <div className="shell">
  <aside>
   {/* eslint-disable-next-line @next/next/no-img-element -- logo oficial estático: se conserva el render exacto */}
   <div className="brand"><img src="/quetzal-logo.png" alt={tr('Quetzal Afterlife')}/><span>{tr('RESURRECTION ENGINE')}</span></div>
   <div className="navlabel">{tr('ESPACIO DE TRABAJO')}</div>
   <nav aria-label={tr('Navegación principal')}>{sections.map((s,i)=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}><span className="navicon">{['◈','＋','⌬','◇','▤'][i]}</span>{tr(s)}</button>)}</nav>
   <div className="navlabel" style={{marginTop:'22px'}}>{tr('MOTOR DE RESURRECCIÓN 2.0')}</div>
   <nav aria-label={tr('Motor de resurrección')}>{ENGINE_SECTIONS.map((s,i)=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}><span className="navicon">{['✺','⌕','✚','⬡','⚙','✦','▣','⚿','⛁'][i]}</span>{tr(s)}</button>)}</nav>
   <div className="sidebottom"><span className="pulse"/> {tr('MOTOR 2.0')} <small>{tr('Recuperación · Local')}</small></div>
  </aside>
  <main>
   <header>
    <div><span className="eyebrow">{tr('QUETZAL AFTERLIFE /')} {tr(section).toUpperCase()}</span><p>{tr('THE DIGITAL RESURRECTION ENGINE')}</p></div>
    <div className="head-actions" style={{display:'flex',gap:'10px',alignItems:'center'}}>
     <UiControls/>
     <button className="secondary" style={{padding:'6px 12px',fontSize:'10px',marginTop:'0'}} onClick={()=>setExpOpen(true)}>{tr('✦ Ver resurrección')}</button>
     <button className="secondary" style={{padding:'6px 12px',fontSize:'10px',marginTop:'0'}} onClick={loadDemo}>{tr('▶ DEMO')}</button>
     <span className="status"><i/> {tr('SISTEMA LOCAL')}</span>
    </div>
   </header>

   {/* ── DASHBOARD ──────────────────────────────────────────────────── */}
   {section==='Dashboard' && <>
    <div className="intro">
     <div>
      <span className="kicker">{tr('◈   EL PASADO TIENE FUTURO')}</span>
      <h1>{tr('La evidencia es')}<br/><em>{tr('el punto de partida.')}</em></h1>
      <p>{tr('Recupera el contexto de sistemas heredados y construye un camino verificable hacia su reconstrucción.')}</p>
      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',alignItems:'center'}}>
       <button className="try-now" data-testid="try-quetzal-now" onClick={()=>setSection('Resurrection Lab')}><span aria-hidden>✺</span>{tr('TRY QUETZAL NOW')}<span aria-hidden>→</span></button>
       <button className="secondary" data-testid="guided-demo-open" style={{marginTop:'22px'}} onClick={()=>setDemoOpen(true)}>{tr('▶ Demo guiada · 3 min')}</button>
      </div>
      <p className="muted" style={{display:'block',margin:'8px 0 0',fontSize:11}}>{tr('6 archivos dañados reales · análisis en tu navegador · sin subir nada')}</p>
      <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
       <button className="primary" onClick={()=>setSection('Nueva recuperación')}>{tr('Iniciar recuperación')} <span>↗</span></button>
       <button className="secondary" onClick={loadDemo} style={{marginTop:'22px'}}>{tr('▶ Ver demo Kiroween')}</button>
       <button className="secondary" onClick={()=>setSection('Discovery')} style={{marginTop:'22px'}}>{tr('Motor 2.0: descubrir y reconstruir →')}</button>
      </div>
     </div>
     <HeroHologram onOpen={()=>setExpOpen(true)}/>
    </div>
    <div className="sectionhead">
     <div><span className="eyebrow">{tr('TU ESPACIO DE TRABAJO')}</span><h2>{tr('El camino de la recuperación')}</h2></div>
     <span className="muted">{tr('FASE 03 / VERIFICACIÓN')}</span>
    </div>
    <div className="cards">{[
     ['01','Archaeology','Importa evidencia CSV y DBF y examina su estructura.','DISPONIBLE'],
     ['02','Reconstruction','Detecta operaciones de inventario y reconstruye el estado.','DISPONIBLE'],
     ['03','Verification','Contrasta el inventario reconstruido contra una referencia independiente.','DISPONIBLE'],
     ['04','Preservation','Guarda y reabre proyectos de recuperación.','DISPONIBLE'],
    ].map(c=><article key={c[0]}><div className="cardtop"><span>{c[0]}</span><b>↗</b></div><h3>{c[1]}</h3><p>{tr(c[2])}</p><small>{tr(c[3])}</small></article>)}</div>
    <div className="note"><span>✧</span><div><strong>{tr('La confianza se construye con evidencia.')}</strong><p>{tr('Los datos recuperados, inferidos, verificados y desconocidos se distinguen explícitamente. Las funciones futuras no se presentan como completadas.')}</p></div></div>
   </>}

   {/* ── NUEVA RECUPERACIÓN ─────────────────────────────────────────── */}
   {section==='Nueva recuperación' && <div className="workspace">
    <span className="kicker">{tr('ARCHAEOLOGY / IMPORTACIÓN')}</span>
    <h1>{tr('Nueva recuperación')}<span className="gold">.</span></h1>
    <p>{tr('Analiza un archivo CSV o DBF en tu navegador. El archivo no se envía al servidor ni se guarda.')}</p>
    <label className="drop">
     <span className="upload">↑</span><strong>{tr('Seleccionar evidencia CSV o DBF')}</strong>
     <span>{tr('CSV: hasta 2 MB y 10 000 filas · DBF: hasta 4 MB y 10 000 registros')}</span>
     <input type="file" accept=".csv,.dbf,text/csv" onChange={upload}/>
    </label>
    {error&&<p role="alert" className="error">{tm(error)}</p>}
    {fileType==='csv'&&csvResult&&<div className="result">
     <span className="kicker">{tr('EVIDENCIA RECUPERADA · CSV')}</span><h2>{filename}</h2>
     <p>{csvResult.rows.length} {tr('filas ·')} {csvResult.headers.length} {tr('columnas · UTF-8')}</p>
     <div className="tablewrap"><table><thead><tr>{csvResult.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
     <tbody>{csvResult.rows.slice(0,10).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
     <small>{tr('Vista previa: 10 filas. Los valores son texto recuperado.')}</small>
     {invResult?.operacionDetectada&&<p className="inv-hint">{tr('✓ Operación de inventario detectada —')} <button className="link-btn" onClick={()=>setSection('Laboratorio')}>{tr('ver reconstrucción →')}</button></p>}
    </div>}
    {fileType==='dbf'&&dbfResult&&<div className="result">
     <span className="kicker">{tr('EVIDENCIA RECUPERADA · DBF')}</span><h2>{filename}</h2>
     <div className="dbf-meta"><table className="dbf-meta-table"><tbody>
      <tr><th>{tr('Formato')}</th><td>{dbfResult.meta.versionLabel}</td></tr>
      <tr><th>{tr('Codificación')}</th><td>{dbfResult.meta.encodingLabel}</td></tr>
      <tr><th>{tr('Última modificación')}</th><td>{dbfResult.meta.lastModified}</td></tr>
      <tr><th>{tr('Registros')}</th><td>{dbfResult.meta.recordCount} {tr('declarados ·')} {dbfResult.meta.recordCountActual} {tr('leídos ·')} <span className="gold">{dbfResult.meta.deletedCount} {tr('borrados')}</span></td></tr>
      <tr><th>{tr('Campos')}</th><td>{dbfResult.meta.fieldCount}</td></tr>
     </tbody></table></div>
     <div className="dbf-field-grid" style={{marginTop:'12px'}}>
      {dbfResult.fields.map((f,i)=><div key={i} className={`dbf-field-item${f.typeKnown?'':' dbf-field-unknown'}`}>
       <span className="dbf-field-name">{f.name}</span><span className="dbf-field-type">{f.type}</span>
       <span className="dbf-field-len">{f.length}</span>
      </div>)}
     </div>
     {dbfResult.records.length>0&&<><div className="tablewrap" style={{marginTop:'12px'}}><table>
      <thead><tr><th className="dbf-status-col">{tr('Estado')}</th>{dbfResult.fields.map((f,i)=><th key={i}>{f.name}</th>)}</tr></thead>
      <tbody>{dbfResult.records.slice(0,10).map((rec,i)=>(
       <tr key={i} className={rec.deleted?'dbf-row-deleted':rec.corrupt?'dbf-row-corrupt':''}>
        <td className="dbf-status-col">{rec.deleted?tr('[borrado]'):rec.corrupt?tf('[corrupto·{0}]',rec.corruptOffset??''):tr('activo')}</td>
        {dbfResult.fields.map((f,j)=><td key={j}>{rec.values[f.name]}</td>)}
       </tr>
      ))}</tbody></table></div></>}
     {invResult?.operacionDetectada&&<p className="inv-hint">{tr('✓ Operación de inventario detectada —')} <button className="link-btn" onClick={()=>setSection('Laboratorio')}>{tr('ver reconstrucción →')}</button></p>}
    </div>}
   </div>}

   {/* ── LABORATORIO ─────────────────────────────────────────────────── */}
   {section==='Laboratorio' && <div className="workspace">
    <span className="kicker">{tr('RECONSTRUCTION / INVENTARIO')}</span>
    <h1>{tr('Laboratorio')}<span className="gold">.</span></h1>
    {!invResult&&<><p>{tr('Importa un archivo en')} <em>{tr('Nueva recuperación')}</em> {tr('o carga el')} <button className="link-btn" onClick={loadDemo}>{tr('modo demo')}</button>.</p><button className="secondary" onClick={()=>setSection('Nueva recuperación')}>{tr('Ir a importación →')}</button></>}
    {invResult&&<>
     {isDemo&&<p className="demo-banner" role="note"><span className="demo-badge">{tr('SINTÉTICO')}</span> {tr('Datos de demostración generados para este prototipo. No representan ningún sistema ni empresa real.')}</p>}
     {filename&&<p style={{color:'var(--c-687784)',fontSize:'12px',marginBottom:'20px'}}>{tr('Fuente:')} <span style={{color:'var(--c-c8d4dc)'}}>{filename}</span></p>}
     {!invResult.operacionDetectada&&<div className="inv-no-op"><span className="kicker">{tr('SIN OPERACIÓN DE INVENTARIO DETECTADA')}</span><p>{tm(invResult.warnings[0])}</p></div>}
     {invResult.operacionDetectada&&<>
      <div className="inv-fields">
       {invResult.fieldMatches.map((m,i)=><div key={i} className="inv-field-badge">
        <span className="inv-field-role">{tr(ROL[m.role]??m.role)}</span>
        <span className="inv-field-name">{m.fieldName}</span>
        <span className={`inv-field-conf inv-conf-${m.confidence}`}>{tr(CONF[m.confidence])}</span>
       </div>)}
      </div>
      {inferredFields(invResult).length>0&&<p className="inv-warn-line" style={{marginTop:'12px'}}>{tr('⚠ Estimación, no hecho confirmado: el rol de')} {inferredFields(invResult).join('; ')} {tr('fue inferido por heurística con confianza no alta.')}</p>}
      <p style={{color:'var(--c-687784)',fontSize:'11px',marginTop:'12px'}}>{tr('La asignación de campos es una detección heurística; las cantidades son las del archivo, sin imputar. «Fila» indica la posición en el archivo de origen.')}</p>
      <div className="inv-totals" style={{marginTop:'24px'}}>
       <div className="inv-total-card inv-total-active">
        <span className="inv-total-label">{tr('Total recuperado (activos)')}</span>
        <span className="inv-total-val">{nf(invResult.totalActivos)}</span>
        <span className="inv-total-sub">{tr('unidades · fuente: recuperado')}</span>
       </div>
       {invResult.totalBorrados>0&&<div className="inv-total-card inv-total-deleted">
        <span className="inv-total-label">{tr('Total recuperado (borrados)')}</span>
        <span className="inv-total-val">{nf(invResult.totalBorrados)}</span>
        <span className="inv-total-sub">{tr('unidades · fuente: recuperado_borrado')}</span>
       </div>}
       {invResult.desconocidos>0&&<div className="inv-total-card inv-total-unknown">
        <span className="inv-total-label">{tr('Desconocidos')}</span>
        <span className="inv-total-val">{invResult.desconocidos}</span>
        <span className="inv-total-sub">{tr('registros sin cantidad parseable')}</span>
       </div>}
      </div>
      <div className="tablewrap" style={{marginTop:'20px'}}><table>
       <thead><tr><th>{tr('Fila')}</th><th>{tr('ID')}</th>{invResult.fieldMatches.find(m=>m.role==='nombre')&&<th>{tr('Nombre')}</th>}<th>{tr('Cantidad')}</th><th>{tr('Fuente')}</th></tr></thead>
       <tbody>{invResult.items.slice(0,20).map((item,i)=>(
        <tr key={i} className={item.source==='recuperado_borrado'?'dbf-row-deleted':item.source==='desconocido'?'inv-row-unknown':''}>
         <td style={{color:'var(--c-687784)',fontSize:'10px'}}>{item.rowIndex+1}</td>
         <td>{item.id}</td>
         {invResult.fieldMatches.find(m=>m.role==='nombre')&&<td>{item.nombre||<span style={{color:'var(--c-687784)'}}>—</span>}</td>}
         <td>{item.cantidad!==null?item.cantidad:<span style={{color:'var(--c-687784)'}}>N/A</span>}</td>
         <td><span className={`inv-source inv-source-${item.source}`}>{tr(item.source)}</span></td>
        </tr>
       ))}</tbody>
      </table></div>
      {invResult.warnings.length>0&&<div className="inv-warnings">{invResult.warnings.map((w,i)=><p key={i} className="inv-warn-line">⚠ {tm(w)}</p>)}</div>}
      {invResult.items.length>20&&<p style={{color:'var(--c-687784)',fontSize:'11px',marginTop:'8px'}}>{tr('Mostrando 20 de')} {invResult.items.length} {tr('registros. La exportación incluye todos.')}</p>}
      <div style={{display:'flex',gap:'10px',marginTop:'16px',flexWrap:'wrap'}}>
       <button className="secondary" style={{marginTop:0}} onClick={()=>exportInv('csv')}>{tr('Exportar CSV')}</button>
       <button className="secondary" style={{marginTop:0}} onClick={()=>exportInv('json')}>{tr('Exportar JSON')}</button>
      </div>
      <p className="inv-hint" style={{marginTop:'20px'}}>{tr('Para verificar contra una referencia →')} <button className="link-btn" onClick={()=>setSection('Verificación')}>{tr('ir a Verificación →')}</button></p>
     </>}
    </>}
   </div>}

   {/* ── VERIFICACIÓN ─────────────────────────────────────────────────── */}
   {section==='Verificación' && <div className="workspace">
    <span className="kicker">{tr('VERIFICATION / CONTRASTE')}</span>
    <h1>{tr('Verificación')}<span className="gold">.</span></h1>

    {!invResult&&<><p>{tr('Primero importa un archivo principal en')} <em>{tr('Nueva recuperación')}</em>.</p>
    <button className="secondary" onClick={()=>setSection('Nueva recuperación')}>{tr('Ir a importación →')}</button></>}

    {invResult&&<>
     {isDemo&&<p className="demo-banner" role="note"><span className="demo-badge">{tr('SINTÉTICO')}</span> {tr('Datos de demostración generados para este prototipo. No representan ningún sistema ni empresa real.')}</p>}
     <p style={{color:'var(--c-94a0ac)',fontSize:'13px',maxWidth:'600px',lineHeight:'1.7'}}>{tr('Carga una fuente de referencia independiente para contrastar el inventario reconstruido de')} <strong style={{color:'var(--c-c8d4dc)'}}>{filename}</strong>{tr('. Los resultados muestran coincidencias, discrepancias y registros ausentes en cada fuente.')}</p>

     {/* Carga de referencia */}
     {!verResult&&<>
      <label className="drop" style={{marginTop:'24px',maxWidth:'580px'}}>
       <span className="upload">↑</span><strong>{tr('Seleccionar referencia independiente')}</strong>
       <span>{tr('CSV o DBF · mismos límites que la fuente principal')}</span>
       <input type="file" accept=".csv,.dbf,text/csv" onChange={uploadRef}/>
      </label>
      {refError&&<p role="alert" className="error">{tm(refError)}</p>}
     </>}

     {/* Resultado de verificación */}
     {verResult&&<>
      <div className="ver-sources">
       <div className="ver-source-badge"><span className="kicker">{tr('FUENTE PRINCIPAL')}</span><span>{verResult.fuentePrincipal}</span></div>
       <div className="ver-vs">{tr('VS')}</div>
       <div className="ver-source-badge"><span className="kicker">{tr('REFERENCIA')}</span><span>{verResult.fuenteReferencia}</span></div>
      </div>

      {/* Resumen */}
      <div className="inv-totals" style={{marginTop:'20px'}}>
       <div className={`inv-total-card ${verResult.summary.porcentajeCoincidencia===100?'inv-total-active':'inv-total-deleted'}`}>
        <span className="inv-total-label">{tr('Coincidencia')}</span>
        <span className="inv-total-val">{verResult.summary.porcentajeCoincidencia}%</span>
        <span className="inv-total-sub">{verResult.summary.verificados} {tr('verificados de')} {verResult.summary.verificados+verResult.summary.discrepancias} {tr('comparables')}</span>
       </div>
       <div className="inv-total-card inv-total-unknown">
        <span className="inv-total-label">{tr('Discrepancias')}</span>
        <span className="inv-total-val" style={{color:verResult.summary.discrepancias>0?'var(--c-ff9292)':'var(--c-43d6ad)'}}>{verResult.summary.discrepancias}</span>
        <span className="inv-total-sub">{tr('diferencia total:')} {verResult.summary.diferenciaTotal>0?'+':''}{verResult.summary.diferenciaTotal} {tr('unidades')}</span>
       </div>
       <div className="inv-total-card">
        <span className="inv-total-label">{tr('Solo en fuente / solo en ref.')}</span>
        <span className="inv-total-val" style={{color:'var(--c-687784)'}}>{verResult.summary.soloPrincipal} / {verResult.summary.soloReferencia}</span>
        <span className="inv-total-sub">{verResult.summary.noComparables} {tr('no comparables')}</span>
       </div>
      </div>

      {/* Tabla detallada */}
      <div className="tablewrap" style={{marginTop:'20px'}}><table>
       <thead><tr><th>{tr('ID')}</th><th>{tr('Nombre')}</th><th>{tr('Cantidad fuente')}</th><th>{tr('Cantidad ref.')}</th><th>{tr('Diferencia')}</th><th>{tr('Estado')}</th></tr></thead>
       <tbody>{verResult.entries.map((e,i)=>(
        <tr key={i}>
         <td>{e.id}</td>
         <td>{e.nombre||<span style={{color:'var(--c-687784)'}}>—</span>}</td>
         <td>{e.cantidadPrincipal??<span style={{color:'var(--c-687784)'}}>—</span>}</td>
         <td>{e.cantidadReferencia??<span style={{color:'var(--c-687784)'}}>—</span>}</td>
         <td style={{color:e.diferencia===0?'var(--c-43d6ad)':e.diferencia!==null?'var(--c-ff9292)':'var(--c-687784)'}}>
          {e.diferencia!==null?(e.diferencia>0?'+':'')+e.diferencia:'—'}
         </td>
         <td><span className={`vstatus ${STATUS_CLASS[e.status]??''}`}>{tr(STATUS_LABEL[e.status]??e.status)}</span></td>
        </tr>
       ))}</tbody>
      </table></div>

      {/* Advertencias */}
      {verResult.warnings.length>0&&<div className="inv-warnings" style={{marginTop:'12px'}}>
       {verResult.warnings.map((w,i)=><p key={i} className="inv-warn-line">⚠ {tm(w)}</p>)}
      </div>}

      <p style={{fontSize:'11px',color:'var(--c-687784)',marginTop:'16px'}}>{tr('Ejecutada:')} {verResult.ejecutadaEn} {tr('· Fuentes:')} {verResult.fuentePrincipal} {tr('vs')} {verResult.fuenteReferencia}
      </p>

      <div style={{display:'flex',gap:'10px',marginTop:'12px',flexWrap:'wrap'}}>
       <button className="secondary" style={{marginTop:0}} onClick={()=>exportVer('csv')}>{tr('Exportar CSV')}</button>
       <button className="secondary" style={{marginTop:0}} onClick={()=>exportVer('json')}>{tr('Exportar JSON')}</button>
      </div>
      {/* Cambiar referencia */}
      <button className="secondary" style={{marginTop:'12px'}} onClick={()=>{setVerResult(null);setRefCsvResult(null);setRefInvResult(null);setRefFilename('');}}>{tr('Cambiar referencia')}</button>
     </>}
    </>}
   </div>}

   {/* ── ARCHIVO ──────────────────────────────────────────────────────── */}
   {section==='Archivo' && <div className="workspace">
    <span className="kicker">{tr('PRESERVATION / PROYECTOS')}</span>
    <h1>{tr('Archivo')}<span className="gold">.</span></h1>

    {/* Guardar proyecto actual */}
    {(invResult||verResult)&&<div className="save-panel">
     <span className="kicker">{tr('GUARDAR SESIÓN ACTUAL')}</span>
     <div style={{display:'flex',gap:'10px',alignItems:'center',marginTop:'12px',flexWrap:'wrap'}}>
      <input
       type="text" placeholder={tr('Nombre del proyecto')}
       value={projectName} onChange={e=>setProjectName(e.target.value)}
       className="project-name-input" maxLength={80}
      />
      <button className="primary" style={{marginTop:'0',padding:'10px 18px'}} onClick={saveProject}>{tr('Guardar proyecto')}</button>
     </div>
     {savedMsg&&<p className={savedMsg.startsWith('✓')?'save-ok':'save-err'}>{tm(savedMsg)}</p>}
    </div>}

    {/* Proyectos guardados */}
    <div className="sectionhead" style={{marginTop:'30px'}}>
     <div><span className="eyebrow">{tr('PROYECTOS GUARDADOS')}</span></div>
     <span className="muted">{store.projects.length} {tr('proyecto')}{store.projects.length!==1?'s':''}</span>
    </div>

    {store.projects.length===0&&<p style={{color:'var(--c-687784)',fontSize:'13px'}}>{tr('No hay proyectos guardados. Importa un archivo y guarda la sesión para que aparezca aquí.')}</p>}

    {store.projects.map(p=>(
     <div key={p.id} className={`project-card${p.isDemo?' project-demo':''}`}>
      <div className="project-card-top">
       <div>
        <span className="project-name">{p.name}</span>
        {p.isDemo&&<span className="demo-badge">{tr('SINTÉTICO')}</span>}
       </div>
       <div style={{display:'flex',gap:'8px'}}>
        <button className="secondary" style={{padding:'5px 10px',fontSize:'10px',marginTop:'0'}} onClick={()=>openSavedProject(p)}>{tr('Detalle')}</button>
        <button className="secondary" style={{padding:'5px 10px',fontSize:'10px',marginTop:'0'}} onClick={()=>restoreProject(p)}>{tr('Reabrir')}</button>
        <button className="link-btn" style={{color:'var(--c-ff9292)',fontSize:'10px'}} onClick={()=>deleteProjectById(p.id)}>{tr('Eliminar')}</button>
       </div>
      </div>
      <div className="project-meta">
       <span>{p.evidences.length} {tr('evidencia')}{p.evidences.length!==1?'s':''}</span>
       <span>{p.verifications.length} {tr('verificación')}{p.verifications.length!==1?'es':''}</span>
       <span>{tr('Creado:')} {p.createdAt.slice(0,10)}</span>
       <span>{tr('Actualizado:')} {p.updatedAt.slice(0,10)}</span>
      </div>
      {openProject?.id===p.id&&<div className="project-detail">
       <span className="kicker" style={{display:'block',marginBottom:'10px'}}>{tr('DETALLE DEL PROYECTO')}</span>
       {p.evidences.map(ev=><div key={ev.id} className="project-evidence">
        <span className="dbf-field-type">{ev.type.toUpperCase()}</span>
        <span style={{color:'var(--c-c8d4dc)',marginLeft:'8px'}}>{ev.filename}</span>
        {ev.inventoryResult?.operacionDetectada&&<span style={{color:'var(--c-43d6ad)',fontSize:'10px',marginLeft:'8px'}}>· {ev.inventoryResult.totalActivos} {tr('activos')}</span>}
       </div>)}
       {p.verifications.map((vr)=><div key={vr.id} className="project-evidence" style={{borderColor:'var(--c-3a3a3a)'}}>
        <span className="vstatus vstatus-ok">{tr('verificación')}</span>
        <span style={{color:'var(--c-c8d4dc)',marginLeft:'8px'}}>{vr.result.summary.porcentajeCoincidencia}{tr('% coincidencia')}</span>
        <span style={{color:vr.result.summary.discrepancias>0?'var(--c-ff9292)':'var(--c-43d6ad)',marginLeft:'8px',fontSize:'10px'}}>
         · {vr.result.summary.discrepancias} {tr('discrepancias')}</span>
       </div>)}
      </div>}
     </div>
    ))}

    <div className="note" style={{marginTop:'24px'}}>
     <span>◈</span><div>
      <strong>{tr('Almacenamiento local.')}</strong>
      <p>{tr('Los proyectos se guardan en el almacenamiento local de este navegador. No se envían a ningún servidor. Los datos permanecen solo en este dispositivo y se pierden si se borra el almacenamiento del navegador.')}</p>
     </div>
    </div>
   </div>}

   {demoOpen&&<GuidedDemo onClose={()=>setDemoOpen(false)} onOpenLab={()=>{setDemoOpen(false);setSection('Resurrection Lab');}}/>}
   <Engine section={isEngineSection(section)?section:null} goto={setSection} experience={{open:expOpen,stage:STAGE_FOR_SECTION[section]??'materializar',onClose:()=>setExpOpen(false)}}/>

   <footer><span>{tr('QUETZAL AFTERLIFE')} <b> / </b> {tr('THE DIGITAL RESURRECTION ENGINE')}</span><span>{tr('MOTOR 2.0   ·   2026')}</span></footer>
  </main>
  <Quetzalito section={section} onNavigate={s=>setSection(s as Section)} context={{hasData:!!invResult,isDemo,fileType,hasVerification:!!verResult}}/>
 </div>;
}

