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
import {DEMO_CSV_A,DEMO_CSV_B,DEMO_INV_A,DEMO_INV_B,DEMO_VERIFICATION} from '../lib/demo';

const sections=['Dashboard','Nueva recuperación','Laboratorio','Verificación','Archivo'] as const;
type Section=(typeof sections)[number];
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
  setRefCsvResult(null);setRefInvResult(null);setRefFilename('');
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
   const name=projectName.trim()||filename||'Proyecto sin nombre';
   let p=createProject(name);
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
  setError('');setRefError('');setProjectName('Demo Kiroween 2026');
  setSection('Laboratorio');
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
  setError('');setRefError('');setProjectName(p.name);setSection('Laboratorio');
 }
 function deleteProjectById(id:string){
  const ns=deleteProject(store,id);
  ProjectStorage.save(ns);setStore(ns);
  if(openProject?.id===id)setOpenProject(null);
 }

 return <div className="shell">
  <aside>
   <div className="brand"><img src="/quetzal-logo.png" alt="Quetzal Afterlife"/><span>RESURRECTION ENGINE</span></div>
   <div className="navlabel">ESPACIO DE TRABAJO</div>
   <nav aria-label="Navegación principal">{sections.map((s,i)=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}><span className="navicon">{['◈','＋','⌬','◇','▤'][i]}</span>{s}</button>)}</nav>
   <div className="sidebottom"><span className="pulse"/> FASE 03 <small>Verificación · Local</small></div>
  </aside>
  <main>
   <header>
    <div><span className="eyebrow">QUETZAL AFTERLIFE / {section.toUpperCase()}</span><p>THE DIGITAL RESURRECTION ENGINE</p></div>
    <div style={{display:'flex',gap:'10px',alignItems:'center'}}>
     <button className="secondary" style={{padding:'6px 12px',fontSize:'10px',marginTop:'0'}} onClick={loadDemo}>▶ DEMO</button>
     <span className="status"><i/> SISTEMA LOCAL</span>
    </div>
   </header>

   {/* ── DASHBOARD ──────────────────────────────────────────────────── */}
   {section==='Dashboard' && <>
    <div className="intro">
     <div>
      <span className="kicker">◈ &nbsp; EL PASADO TIENE FUTURO</span>
      <h1>La evidencia es<br/><em>el punto de partida.</em></h1>
      <p>Recupera el contexto de sistemas heredados y construye un camino verificable hacia su reconstrucción.</p>
      <div style={{display:'flex',gap:'12px',flexWrap:'wrap'}}>
       <button className="primary" onClick={()=>setSection('Nueva recuperación')}>Iniciar recuperación <span>↗</span></button>
       <button className="secondary" onClick={loadDemo} style={{marginTop:'22px'}}>▶ Ver demo Kiroween</button>
      </div>
     </div>
     <div className="hero"><img src="/quetzal-logo.png" alt="Logo oficial de Quetzal Afterlife"/></div>
    </div>
    <div className="sectionhead">
     <div><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h2>El camino de la recuperación</h2></div>
     <span className="muted">FASE 03 / VERIFICACIÓN</span>
    </div>
    <div className="cards">{[
     ['01','Archaeology','Importa evidencia CSV y DBF y examina su estructura.','DISPONIBLE'],
     ['02','Reconstruction','Detecta operaciones de inventario y reconstruye el estado.','DISPONIBLE'],
     ['03','Verification','Contrasta el inventario reconstruido contra una referencia independiente.','DISPONIBLE'],
     ['04','Preservation','Guarda y reabre proyectos de recuperación.','DISPONIBLE'],
    ].map(c=><article key={c[0]}><div className="cardtop"><span>{c[0]}</span><b>↗</b></div><h3>{c[1]}</h3><p>{c[2]}</p><small>{c[3]}</small></article>)}</div>
    <div className="note"><span>✧</span><div><strong>La confianza se construye con evidencia.</strong><p>Los datos recuperados, inferidos, verificados y desconocidos se distinguen explícitamente. Las funciones futuras no se presentan como completadas.</p></div></div>
   </>}

   {/* ── NUEVA RECUPERACIÓN ─────────────────────────────────────────── */}
   {section==='Nueva recuperación' && <div className="workspace">
    <span className="kicker">ARCHAEOLOGY / IMPORTACIÓN</span>
    <h1>Nueva recuperación<span className="gold">.</span></h1>
    <p>Analiza un archivo CSV o DBF en tu navegador. El archivo no se envía al servidor ni se guarda.</p>
    <label className="drop">
     <span className="upload">↑</span><strong>Seleccionar evidencia CSV o DBF</strong>
     <span>CSV: hasta 2 MB y 10 000 filas · DBF: hasta 4 MB y 10 000 registros</span>
     <input type="file" accept=".csv,.dbf,text/csv" onChange={upload}/>
    </label>
    {error&&<p role="alert" className="error">{error}</p>}
    {fileType==='csv'&&csvResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · CSV</span><h2>{filename}</h2>
     <p>{csvResult.rows.length} filas · {csvResult.headers.length} columnas · UTF-8</p>
     <div className="tablewrap"><table><thead><tr>{csvResult.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
     <tbody>{csvResult.rows.slice(0,10).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
     <small>Vista previa: 10 filas. Los valores son texto recuperado.</small>
     {invResult?.operacionDetectada&&<p className="inv-hint">✓ Operación de inventario detectada — <button className="link-btn" onClick={()=>setSection('Laboratorio')}>ver reconstrucción →</button></p>}
    </div>}
    {fileType==='dbf'&&dbfResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · DBF</span><h2>{filename}</h2>
     <div className="dbf-meta"><table className="dbf-meta-table"><tbody>
      <tr><th>Formato</th><td>{dbfResult.meta.versionLabel}</td></tr>
      <tr><th>Codificación</th><td>{dbfResult.meta.encodingLabel}</td></tr>
      <tr><th>Última modificación</th><td>{dbfResult.meta.lastModified}</td></tr>
      <tr><th>Registros</th><td>{dbfResult.meta.recordCount} declarados · {dbfResult.meta.recordCountActual} leídos · <span className="gold">{dbfResult.meta.deletedCount} borrados</span></td></tr>
      <tr><th>Campos</th><td>{dbfResult.meta.fieldCount}</td></tr>
     </tbody></table></div>
     <div className="dbf-field-grid" style={{marginTop:'12px'}}>
      {dbfResult.fields.map((f,i)=><div key={i} className={`dbf-field-item${f.typeKnown?'':' dbf-field-unknown'}`}>
       <span className="dbf-field-name">{f.name}</span><span className="dbf-field-type">{f.type}</span>
       <span className="dbf-field-len">{f.length}</span>
      </div>)}
     </div>
     {dbfResult.records.length>0&&<><div className="tablewrap" style={{marginTop:'12px'}}><table>
      <thead><tr><th className="dbf-status-col">Estado</th>{dbfResult.fields.map((f,i)=><th key={i}>{f.name}</th>)}</tr></thead>
      <tbody>{dbfResult.records.slice(0,10).map((rec,i)=>(
       <tr key={i} className={rec.deleted?'dbf-row-deleted':rec.corrupt?'dbf-row-corrupt':''}>
        <td className="dbf-status-col">{rec.deleted?'[borrado]':rec.corrupt?`[corrupto·${rec.corruptOffset}]`:'activo'}</td>
        {dbfResult.fields.map((f,j)=><td key={j}>{rec.values[f.name]}</td>)}
       </tr>
      ))}</tbody></table></div></>}
     {invResult?.operacionDetectada&&<p className="inv-hint">✓ Operación de inventario detectada — <button className="link-btn" onClick={()=>setSection('Laboratorio')}>ver reconstrucción →</button></p>}
    </div>}
   </div>}

   {/* ── LABORATORIO ─────────────────────────────────────────────────── */}
   {section==='Laboratorio' && <div className="workspace">
    <span className="kicker">RECONSTRUCTION / INVENTARIO</span>
    <h1>Laboratorio<span className="gold">.</span></h1>
    {!invResult&&<><p>Importa un archivo en <em>Nueva recuperación</em> o carga el <button className="link-btn" onClick={loadDemo}>modo demo</button>.</p><button className="secondary" onClick={()=>setSection('Nueva recuperación')}>Ir a importación →</button></>}
    {invResult&&<>
     {filename&&<p style={{color:'#687784',fontSize:'12px',marginBottom:'20px'}}>Fuente: <span style={{color:'#c8d4dc'}}>{filename}</span></p>}
     {!invResult.operacionDetectada&&<div className="inv-no-op"><span className="kicker">SIN OPERACIÓN DE INVENTARIO DETECTADA</span><p>{invResult.warnings[0]}</p></div>}
     {invResult.operacionDetectada&&<>
      <div className="inv-fields">
       {invResult.fieldMatches.map((m,i)=><div key={i} className="inv-field-badge">
        <span className="inv-field-role">{ROL[m.role]??m.role}</span>
        <span className="inv-field-name">{m.fieldName}</span>
        <span className={`inv-field-conf inv-conf-${m.confidence}`}>{CONF[m.confidence]}</span>
       </div>)}
      </div>
      <div className="inv-totals" style={{marginTop:'24px'}}>
       <div className="inv-total-card inv-total-active">
        <span className="inv-total-label">Total recuperado (activos)</span>
        <span className="inv-total-val">{invResult.totalActivos.toLocaleString('es-MX')}</span>
        <span className="inv-total-sub">unidades · fuente: recuperado</span>
       </div>
       {invResult.totalBorrados>0&&<div className="inv-total-card inv-total-deleted">
        <span className="inv-total-label">Total recuperado (borrados)</span>
        <span className="inv-total-val">{invResult.totalBorrados.toLocaleString('es-MX')}</span>
        <span className="inv-total-sub">unidades · fuente: recuperado_borrado</span>
       </div>}
       {invResult.desconocidos>0&&<div className="inv-total-card inv-total-unknown">
        <span className="inv-total-label">Desconocidos</span>
        <span className="inv-total-val">{invResult.desconocidos}</span>
        <span className="inv-total-sub">registros sin cantidad parseable</span>
       </div>}
      </div>
      <div className="tablewrap" style={{marginTop:'20px'}}><table>
       <thead><tr><th>#</th><th>ID</th>{invResult.fieldMatches.find(m=>m.role==='nombre')&&<th>Nombre</th>}<th>Cantidad</th><th>Fuente</th></tr></thead>
       <tbody>{invResult.items.slice(0,20).map((item,i)=>(
        <tr key={i} className={item.source==='recuperado_borrado'?'dbf-row-deleted':item.source==='desconocido'?'inv-row-unknown':''}>
         <td style={{color:'#687784',fontSize:'10px'}}>{item.rowIndex+1}</td>
         <td>{item.id}</td>
         {invResult.fieldMatches.find(m=>m.role==='nombre')&&<td>{item.nombre||<span style={{color:'#687784'}}>—</span>}</td>}
         <td>{item.cantidad!==null?item.cantidad:<span style={{color:'#687784'}}>N/A</span>}</td>
         <td><span className={`inv-source inv-source-${item.source}`}>{item.source}</span></td>
        </tr>
       ))}</tbody>
      </table></div>
      {invResult.warnings.length>0&&<div className="inv-warnings">{invResult.warnings.map((w,i)=><p key={i} className="inv-warn-line">⚠ {w}</p>)}</div>}
      <p className="inv-hint" style={{marginTop:'20px'}}>Para verificar contra una referencia → <button className="link-btn" onClick={()=>setSection('Verificación')}>ir a Verificación →</button></p>
     </>}
    </>}
   </div>}

   {/* ── VERIFICACIÓN ─────────────────────────────────────────────────── */}
   {section==='Verificación' && <div className="workspace">
    <span className="kicker">VERIFICATION / CONTRASTE</span>
    <h1>Verificación<span className="gold">.</span></h1>

    {!invResult&&<><p>Primero importa un archivo principal en <em>Nueva recuperación</em>.</p>
    <button className="secondary" onClick={()=>setSection('Nueva recuperación')}>Ir a importación →</button></>}

    {invResult&&<>
     <p style={{color:'#94a0ac',fontSize:'13px',maxWidth:'600px',lineHeight:'1.7'}}>
      Carga una fuente de referencia independiente para contrastar el inventario reconstruido de <strong style={{color:'#c8d4dc'}}>{filename}</strong>.
      Los resultados muestran coincidencias, discrepancias y registros ausentes en cada fuente.
     </p>

     {/* Carga de referencia */}
     {!verResult&&<>
      <label className="drop" style={{marginTop:'24px',maxWidth:'580px'}}>
       <span className="upload">↑</span><strong>Seleccionar referencia independiente</strong>
       <span>CSV o DBF · mismos límites que la fuente principal</span>
       <input type="file" accept=".csv,.dbf,text/csv" onChange={uploadRef}/>
      </label>
      {refError&&<p role="alert" className="error">{refError}</p>}
     </>}

     {/* Resultado de verificación */}
     {verResult&&<>
      <div className="ver-sources">
       <div className="ver-source-badge"><span className="kicker">FUENTE PRINCIPAL</span><span>{verResult.fuentePrincipal}</span></div>
       <div className="ver-vs">VS</div>
       <div className="ver-source-badge"><span className="kicker">REFERENCIA</span><span>{verResult.fuenteReferencia}</span></div>
      </div>

      {/* Resumen */}
      <div className="inv-totals" style={{marginTop:'20px'}}>
       <div className={`inv-total-card ${verResult.summary.porcentajeCoincidencia===100?'inv-total-active':'inv-total-deleted'}`}>
        <span className="inv-total-label">Coincidencia</span>
        <span className="inv-total-val">{verResult.summary.porcentajeCoincidencia}%</span>
        <span className="inv-total-sub">{verResult.summary.verificados} verificados de {verResult.summary.verificados+verResult.summary.discrepancias} comparables</span>
       </div>
       <div className="inv-total-card inv-total-unknown">
        <span className="inv-total-label">Discrepancias</span>
        <span className="inv-total-val" style={{color:verResult.summary.discrepancias>0?'#ff9292':'#43d6ad'}}>{verResult.summary.discrepancias}</span>
        <span className="inv-total-sub">diferencia total: {verResult.summary.diferenciaTotal>0?'+':''}{verResult.summary.diferenciaTotal} unidades</span>
       </div>
       <div className="inv-total-card">
        <span className="inv-total-label">Solo en fuente / solo en ref.</span>
        <span className="inv-total-val" style={{color:'#687784'}}>{verResult.summary.soloPrincipal} / {verResult.summary.soloReferencia}</span>
        <span className="inv-total-sub">{verResult.summary.noComparables} no comparables</span>
       </div>
      </div>

      {/* Tabla detallada */}
      <div className="tablewrap" style={{marginTop:'20px'}}><table>
       <thead><tr><th>ID</th><th>Nombre</th><th>Cantidad fuente</th><th>Cantidad ref.</th><th>Diferencia</th><th>Estado</th></tr></thead>
       <tbody>{verResult.entries.map((e,i)=>(
        <tr key={i}>
         <td>{e.id}</td>
         <td>{e.nombre||<span style={{color:'#687784'}}>—</span>}</td>
         <td>{e.cantidadPrincipal??<span style={{color:'#687784'}}>—</span>}</td>
         <td>{e.cantidadReferencia??<span style={{color:'#687784'}}>—</span>}</td>
         <td style={{color:e.diferencia===0?'#43d6ad':e.diferencia!==null?'#ff9292':'#687784'}}>
          {e.diferencia!==null?(e.diferencia>0?'+':'')+e.diferencia:'—'}
         </td>
         <td><span className={`vstatus ${STATUS_CLASS[e.status]??''}`}>{STATUS_LABEL[e.status]??e.status}</span></td>
        </tr>
       ))}</tbody>
      </table></div>

      {/* Advertencias */}
      {verResult.warnings.length>0&&<div className="inv-warnings" style={{marginTop:'12px'}}>
       {verResult.warnings.map((w,i)=><p key={i} className="inv-warn-line">⚠ {w}</p>)}
      </div>}

      <p style={{fontSize:'11px',color:'#687784',marginTop:'16px'}}>
       Ejecutada: {verResult.ejecutadaEn} · Fuentes: {verResult.fuentePrincipal} vs {verResult.fuenteReferencia}
      </p>

      {/* Cambiar referencia */}
      <button className="secondary" style={{marginTop:'12px'}} onClick={()=>{setVerResult(null);setRefCsvResult(null);setRefInvResult(null);setRefFilename('');}}>
       Cambiar referencia
      </button>
     </>}
    </>}
   </div>}

   {/* ── ARCHIVO ──────────────────────────────────────────────────────── */}
   {section==='Archivo' && <div className="workspace">
    <span className="kicker">PRESERVATION / PROYECTOS</span>
    <h1>Archivo<span className="gold">.</span></h1>

    {/* Guardar proyecto actual */}
    {(invResult||verResult)&&<div className="save-panel">
     <span className="kicker">GUARDAR SESIÓN ACTUAL</span>
     <div style={{display:'flex',gap:'10px',alignItems:'center',marginTop:'12px',flexWrap:'wrap'}}>
      <input
       type="text" placeholder="Nombre del proyecto"
       value={projectName} onChange={e=>setProjectName(e.target.value)}
       className="project-name-input" maxLength={80}
      />
      <button className="primary" style={{marginTop:'0',padding:'10px 18px'}} onClick={saveProject}>
       Guardar proyecto
      </button>
     </div>
     {savedMsg&&<p className={savedMsg.startsWith('✓')?'save-ok':'save-err'}>{savedMsg}</p>}
    </div>}

    {/* Proyectos guardados */}
    <div className="sectionhead" style={{marginTop:'30px'}}>
     <div><span className="eyebrow">PROYECTOS GUARDADOS</span></div>
     <span className="muted">{store.projects.length} proyecto{store.projects.length!==1?'s':''}</span>
    </div>

    {store.projects.length===0&&<p style={{color:'#687784',fontSize:'13px'}}>No hay proyectos guardados. Importa un archivo y guarda la sesión para que aparezca aquí.</p>}

    {store.projects.map(p=>(
     <div key={p.id} className={`project-card${p.isDemo?' project-demo':''}`}>
      <div className="project-card-top">
       <div>
        <span className="project-name">{p.name}</span>
        {p.isDemo&&<span className="demo-badge">SINTÉTICO</span>}
       </div>
       <div style={{display:'flex',gap:'8px'}}>
        <button className="secondary" style={{padding:'5px 10px',fontSize:'10px',marginTop:'0'}} onClick={()=>openSavedProject(p)}>Detalle</button>
        <button className="secondary" style={{padding:'5px 10px',fontSize:'10px',marginTop:'0'}} onClick={()=>restoreProject(p)}>Reabrir</button>
        <button className="link-btn" style={{color:'#ff9292',fontSize:'10px'}} onClick={()=>deleteProjectById(p.id)}>Eliminar</button>
       </div>
      </div>
      <div className="project-meta">
       <span>{p.evidences.length} evidencia{p.evidences.length!==1?'s':''}</span>
       <span>{p.verifications.length} verificación{p.verifications.length!==1?'es':''}</span>
       <span>Creado: {p.createdAt.slice(0,10)}</span>
       <span>Actualizado: {p.updatedAt.slice(0,10)}</span>
      </div>
      {openProject?.id===p.id&&<div className="project-detail">
       <span className="kicker" style={{display:'block',marginBottom:'10px'}}>DETALLE DEL PROYECTO</span>
       {p.evidences.map(ev=><div key={ev.id} className="project-evidence">
        <span className="dbf-field-type">{ev.type.toUpperCase()}</span>
        <span style={{color:'#c8d4dc',marginLeft:'8px'}}>{ev.filename}</span>
        {ev.inventoryResult?.operacionDetectada&&<span style={{color:'#43d6ad',fontSize:'10px',marginLeft:'8px'}}>· {ev.inventoryResult.totalActivos} activos</span>}
       </div>)}
       {p.verifications.map((vr)=><div key={vr.id} className="project-evidence" style={{borderColor:'#3a3a3a'}}>
        <span className="vstatus vstatus-ok">verificación</span>
        <span style={{color:'#c8d4dc',marginLeft:'8px'}}>{vr.result.summary.porcentajeCoincidencia}% coincidencia</span>
        <span style={{color:vr.result.summary.discrepancias>0?'#ff9292':'#43d6ad',marginLeft:'8px',fontSize:'10px'}}>
         · {vr.result.summary.discrepancias} discrepancias
        </span>
       </div>)}
      </div>}
     </div>
    ))}

    <div className="note" style={{marginTop:'24px'}}>
     <span>◈</span><div>
      <strong>Almacenamiento local.</strong>
      <p>Los proyectos se guardan en el almacenamiento local de este navegador. No se envían a ningún servidor. Los datos permanecen solo en este dispositivo y se pierden si se borra el almacenamiento del navegador.</p>
     </div>
    </div>
   </div>}

   <footer><span>QUETZAL AFTERLIFE <b> / </b> THE DIGITAL RESURRECTION ENGINE</span><span>FASE 03 &nbsp; · &nbsp; 2026</span></footer>
  </main>
 </div>;
}
