'use client';
import {useState} from 'react';
import {analyzeCsv,MAX_BYTES,type CsvResult} from '../lib/csv';
import {parseDbf,MAX_DBF_BYTES,type DbfResult} from '../lib/dbf';
import {reconstructInventory,type InventoryResult,type InventoryRow} from '../lib/inventory';

const sections=['Dashboard','Nueva recuperación','Laboratorio','Verificación','Archivo'] as const;
type Section=(typeof sections)[number];

// Nivel de confianza → etiqueta visual
const CONF:Record<string,string>={alto:'◉ alto',medio:'◎ medio',bajo:'○ bajo'};
const ROL:Record<string,string>={id:'IDENTIFICADOR',cantidad:'CANTIDAD',nombre:'NOMBRE'};

export default function Home(){
 const [section,setSection]=useState<Section>('Dashboard');
 const [csvResult,setCsvResult]=useState<CsvResult|null>(null);
 const [dbfResult,setDbfResult]=useState<DbfResult|null>(null);
 const [invResult,setInvResult]=useState<InventoryResult|null>(null);
 const [filename,setFilename]=useState('');
 const [fileType,setFileType]=useState<'csv'|'dbf'|null>(null);
 const [error,setError]=useState('');

 async function upload(e:React.ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];
  if(!f)return;
  setCsvResult(null);setDbfResult(null);setInvResult(null);
  setError('');setFilename('');setFileType(null);
  try{
   const bytes=new Uint8Array(await f.arrayBuffer());
   const ext=f.name.toLowerCase().split('.').pop();
   if(ext==='dbf'){
    if(f.size>MAX_DBF_BYTES)throw new Error('El archivo supera el límite de 4 MB.');
    const r=parseDbf(bytes,f.name);
    setDbfResult(r);setFilename(f.name);setFileType('dbf');
    // Reconstruir inventario con filas DBF
    const invRows:InventoryRow[]=r.records.map(rec=>({values:rec.values,deleted:rec.deleted}));
    setInvResult(reconstructInventory(r.fields.map(f=>f.name),invRows));
   } else {
    if(f.size>MAX_BYTES)throw new Error('El archivo supera el límite de 2 MB.');
    const r=analyzeCsv(bytes,f.name);
    setCsvResult(r);setFilename(f.name);setFileType('csv');
    // Reconstruir inventario con filas CSV
    const invRows:InventoryRow[]=r.rows.map(row=>{
     const values:Record<string,string>={};
     r.headers.forEach((h,i)=>{values[h]=row[i]??'';});
     return {values,deleted:false};
    });
    setInvResult(reconstructInventory(r.headers,invRows));
   }
  }catch(err){setError(err instanceof Error?err.message:'No se pudo analizar el archivo.');}
  e.target.value='';
 }

 return <div className="shell">
  <aside>
   <div className="brand"><img src="/quetzal-logo.png" alt="Quetzal Afterlife"/><span>RESURRECTION ENGINE</span></div>
   <div className="navlabel">ESPACIO DE TRABAJO</div>
   <nav aria-label="Navegación principal">{sections.map((s,i)=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}><span className="navicon">{['◈','＋','⌬','◇','▤'][i]}</span>{s}</button>)}</nav>
   <div className="sidebottom"><span className="pulse"/> FASE 02B <small>Reconstrucción · Local</small></div>
  </aside>
  <main>
   <header>
    <div><span className="eyebrow">QUETZAL AFTERLIFE / {section.toUpperCase()}</span><p>THE DIGITAL RESURRECTION ENGINE</p></div>
    <span className="status"><i/> SISTEMA LOCAL</span>
   </header>

   {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
   {section==='Dashboard' && <>
    <div className="intro">
     <div>
      <span className="kicker">◈ &nbsp; EL PASADO TIENE FUTURO</span>
      <h1>La evidencia es<br/><em>el punto de partida.</em></h1>
      <p>Recupera el contexto de sistemas heredados y construye un camino verificable hacia su reconstrucción.</p>
      <button className="primary" onClick={()=>setSection('Nueva recuperación')}>Iniciar recuperación <span>↗</span></button>
     </div>
     <div className="hero"><img src="/quetzal-logo.png" alt="Logo oficial de Quetzal Afterlife"/></div>
    </div>
    <div className="sectionhead">
     <div><span className="eyebrow">TU ESPACIO DE TRABAJO</span><h2>El camino de la recuperación</h2></div>
     <span className="muted">FASE 02B / RECONSTRUCCIÓN</span>
    </div>
    <div className="cards">{[
     ['01','Archaeology','Importa evidencia CSV y DBF y examina su estructura.','DISPONIBLE'],
     ['02','Reconstruction','Detecta operaciones de inventario y reconstruye el estado.','DISPONIBLE'],
     ['03','Verification','Contrasta resultados contra evidencia independiente.','PRÓXIMAMENTE'],
     ['04','Preservation','Conserva datos y documenta hallazgos.','PRÓXIMAMENTE'],
    ].map(c=><article key={c[0]}><div className="cardtop"><span>{c[0]}</span><b>↗</b></div><h3>{c[1]}</h3><p>{c[2]}</p><small>{c[3]}</small></article>)}</div>
    <div className="note"><span>✧</span><div><strong>La confianza se construye con evidencia.</strong><p>Los datos recuperados, inferidos, verificados y desconocidos se distinguen explícitamente. Las funciones futuras no se presentan como completadas.</p></div></div>
   </>}

   {/* ── NUEVA RECUPERACIÓN ────────────────────────────────────────────── */}
   {section==='Nueva recuperación' && <div className="workspace">
    <span className="kicker">ARCHAEOLOGY / IMPORTACIÓN</span>
    <h1>Nueva recuperación<span className="gold">.</span></h1>
    <p>Analiza un archivo CSV UTF-8 o DBF en tu navegador. El archivo no se envía al servidor ni se guarda.</p>
    <label className="drop">
     <span className="upload">↑</span>
     <strong>Seleccionar evidencia CSV o DBF</strong>
     <span>CSV: hasta 2 MB y 10 000 filas · DBF: hasta 4 MB y 10 000 registros</span>
     <input type="file" accept=".csv,.dbf,text/csv" onChange={upload}/>
    </label>
    {error&&<p role="alert" className="error">{error}</p>}

    {/* Resultado CSV */}
    {fileType==='csv'&&csvResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · CSV</span>
     <h2>{filename}</h2>
     <p>{csvResult.rows.length} filas · {csvResult.headers.length} columnas · UTF-8</p>
     {csvResult.warnings.map(w=><p key={w}>{w}</p>)}
     <div className="tablewrap"><table><thead><tr>{csvResult.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
     <tbody>{csvResult.rows.slice(0,10).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
     <small>Vista previa: hasta 10 filas. Los valores son texto recuperado; aún no se han inferido ni verificado reglas.</small>
     {invResult?.operacionDetectada&&<p className="inv-hint">✓ Operación de inventario detectada — <button className="link-btn" onClick={()=>setSection('Laboratorio')}>ver reconstrucción →</button></p>}
    </div>}

    {/* Resultado DBF */}
    {fileType==='dbf'&&dbfResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · DBF</span>
     <h2>{filename}</h2>
     <div className="dbf-meta">
      <table className="dbf-meta-table"><tbody>
       <tr><th>Formato</th><td>{dbfResult.meta.versionLabel}</td></tr>
       <tr><th>Codificación</th><td>{dbfResult.meta.encodingLabel}</td></tr>
       <tr><th>Última modificación</th><td>{dbfResult.meta.lastModified}</td></tr>
       <tr><th>Registros</th><td>{dbfResult.meta.recordCount} declarados · {dbfResult.meta.recordCountActual} leídos · <span className="gold">{dbfResult.meta.deletedCount} borrados</span></td></tr>
       <tr><th>Campos</th><td>{dbfResult.meta.fieldCount}</td></tr>
       <tr><th>Tamaño de registro</th><td>{dbfResult.meta.recordSize} bytes</td></tr>
      </tbody></table>
     </div>
     <div className="dbf-fields">
      <span className="kicker" style={{marginTop:'20px',display:'block'}}>ESTRUCTURA DE CAMPOS</span>
      <div className="dbf-field-grid">
       {dbfResult.fields.map((f,i)=>(
        <div key={i} className={`dbf-field-item${f.typeKnown?'':' dbf-field-unknown'}`}>
         <span className="dbf-field-name">{f.name}</span>
         <span className="dbf-field-type">{f.type}</span>
         <span className="dbf-field-len">{f.length}</span>
         {!f.typeKnown&&<span className="dbf-field-warn" title="Tipo desconocido">⚠</span>}
        </div>
       ))}
      </div>
     </div>
     {dbfResult.records.length>0&&<>
      <span className="kicker" style={{marginTop:'20px',display:'block'}}>REGISTROS (vista previa: 10)</span>
      <div className="tablewrap"><table>
       <thead><tr>
        <th className="dbf-status-col">Estado</th>
        {dbfResult.fields.map((f,i)=><th key={i}>{f.name}</th>)}
       </tr></thead>
       <tbody>{dbfResult.records.slice(0,10).map((rec,i)=>(
        <tr key={i} className={rec.deleted?'dbf-row-deleted':rec.corrupt?'dbf-row-corrupt':''}>
         <td className="dbf-status-col" data-evidence={rec.deleted?'deleted':rec.corrupt?'corrupt':'recovered'}>
          {rec.deleted?'[borrado]':rec.corrupt?`[corrupto·${rec.corruptOffset}]`:'activo'}
         </td>
         {dbfResult.fields.map((f,j)=>(
          <td key={j} data-evidence={rec.deleted?'deleted':rec.corrupt?'corrupt':'recovered'}>
           {rec.values[f.name]}
          </td>
         ))}
        </tr>
       ))}</tbody>
      </table></div>
      {dbfResult.meta.recordCountActual>10&&<small>{dbfResult.meta.recordCountActual-10} registros adicionales no mostrados.</small>}
     </>}
     {dbfResult.warnings.length>0&&<details className="dbf-warnings">
      <summary className="kicker" style={{cursor:'pointer',marginTop:'16px'}}>ADVERTENCIAS ({dbfResult.warnings.length})</summary>
      <ul className="dbf-warn-list">
       {dbfResult.warnings.map((w,i)=><li key={i}><span className="dbf-warn-code">{w.code}</span> {w.message}</li>)}
      </ul>
     </details>}
     {invResult?.operacionDetectada&&<p className="inv-hint">✓ Operación de inventario detectada — <button className="link-btn" onClick={()=>setSection('Laboratorio')}>ver reconstrucción →</button></p>}
     <small style={{display:'block',marginTop:'12px'}}>Los valores son texto recuperado. No se han inferido ni verificado reglas.</small>
    </div>}
   </div>}

   {/* ── LABORATORIO / RECONSTRUCCIÓN ─────────────────────────────────── */}
   {section==='Laboratorio' && <div className="workspace">
    <span className="kicker">RECONSTRUCTION / INVENTARIO</span>
    <h1>Laboratorio<span className="gold">.</span></h1>

    {!invResult&&!filename&&<>
     <p>Importa un archivo CSV o DBF en <em>Nueva recuperación</em> para ver la reconstrucción de inventario aquí.</p>
     <button className="secondary" onClick={()=>setSection('Nueva recuperación')}>Ir a importación →</button>
    </>}

    {invResult&&<>
     {/* Fuente */}
     {filename&&<p style={{color:'#687784',fontSize:'12px',marginBottom:'20px'}}>Fuente: <span style={{color:'#c8d4dc'}}>{filename}</span></p>}

     {/* Sin operación detectada */}
     {!invResult.operacionDetectada&&<div className="inv-no-op">
      <span className="kicker">SIN OPERACIÓN DE INVENTARIO DETECTADA</span>
      <p>{invResult.warnings[0]}</p>
      <p style={{fontSize:'12px',color:'#687784'}}>Para que se detecte automáticamente una operación de inventario, el archivo debe contener un campo cuyo nombre incluya: cantidad, qty, stock, units, piezas, existencias o variantes similares.</p>
     </div>}

     {/* Operación detectada */}
     {invResult.operacionDetectada&&<>
      {/* Campos detectados */}
      <div className="sectionhead" style={{marginTop:'0'}}>
       <div><span className="eyebrow">CAMPOS IDENTIFICADOS</span></div>
      </div>
      <div className="inv-fields">
       {invResult.fieldMatches.map((m,i)=>(
        <div key={i} className="inv-field-badge">
         <span className="inv-field-role">{ROL[m.role]??m.role}</span>
         <span className="inv-field-name">{m.fieldName}</span>
         <span className={`inv-field-conf inv-conf-${m.confidence}`}>{CONF[m.confidence]}</span>
        </div>
       ))}
      </div>

      {/* Totales */}
      <div className="sectionhead" style={{marginTop:'28px'}}>
       <div><span className="eyebrow">ESTADO DEL INVENTARIO RECUPERADO</span></div>
       <span className="muted">RECUPERADO · NO VERIFICADO</span>
      </div>
      <div className="inv-totals">
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

      {/* Advertencias del inventario */}
      {invResult.warnings.length>0&&<div className="inv-warnings">
       {invResult.warnings.map((w,i)=><p key={i} className="inv-warn-line">⚠ {w}</p>)}
      </div>}

      {/* Tabla de ítems */}
      <div className="sectionhead" style={{marginTop:'28px'}}>
       <div><span className="eyebrow">ÍTEMS RECONSTRUIDOS (vista previa: 20)</span></div>
       <span className="muted">{invResult.items.length} total</span>
      </div>
      <div className="tablewrap"><table>
       <thead><tr>
        <th>#</th><th>ID</th>
        {invResult.fieldMatches.find(m=>m.role==='nombre')&&<th>Nombre</th>}
        <th>Cantidad</th><th>Fuente</th>
       </tr></thead>
       <tbody>{invResult.items.slice(0,20).map((item,i)=>(
        <tr key={i} className={
         item.source==='recuperado_borrado'?'dbf-row-deleted':
         item.source==='desconocido'?'inv-row-unknown':''
        }>
         <td style={{color:'#687784',fontSize:'10px'}}>{item.rowIndex+1}</td>
         <td>{item.id}</td>
         {invResult.fieldMatches.find(m=>m.role==='nombre')&&<td>{item.nombre||<span style={{color:'#687784'}}>—</span>}</td>}
         <td>{item.cantidad!==null?item.cantidad:<span style={{color:'#687784'}}>N/A</span>}</td>
         <td><span className={`inv-source inv-source-${item.source}`}>{item.source}</span></td>
        </tr>
       ))}</tbody>
      </table></div>
      {invResult.items.length>20&&<small>{invResult.items.length-20} ítems adicionales no mostrados.</small>}

      <div className="note" style={{marginTop:'24px'}}>
       <span>◈</span>
       <div>
        <strong>Estado de la reconstrucción.</strong>
        <p>Los totales y valores mostrados son <em>recuperados</em> del archivo original. No han sido inferidos, completados ni verificados contra una fuente independiente. Los registros borrados se incluyen separados para no mezclar evidencias de estado distinto.</p>
       </div>
      </div>
     </>}
    </>}
   </div>}

   {/* ── VERIFICACIÓN ─────────────────────────────────────────────────── */}
   {section==='Verificación' && <div className="workspace">
    <span className="kicker">FASE 02B / EN PREPARACIÓN</span>
    <h1>Verificación<span className="gold">.</span></h1>
    <p>Aquí se incorporarán pruebas comparativas contra una referencia independiente y trazabilidad completa. No hay resultados de recuperación verificados todavía.</p>
    <button className="secondary" onClick={()=>setSection('Laboratorio')}>Ir a Laboratorio →</button>
   </div>}

   {/* ── ARCHIVO ──────────────────────────────────────────────────────── */}
   {section==='Archivo' && <div className="workspace">
    <span className="kicker">FASE 02B / EN PREPARACIÓN</span>
    <h1>Archivo<span className="gold">.</span></h1>
    <p>La exportación y preservación de proyectos se desarrollarán en una fase posterior. Los datos de esta sesión no se persisten.</p>
    <button className="secondary" onClick={()=>setSection('Nueva recuperación')}>Ir a importación →</button>
   </div>}

   <footer><span>QUETZAL AFTERLIFE <b> / </b> THE DIGITAL RESURRECTION ENGINE</span><span>FASE 02B &nbsp; · &nbsp; 2026</span></footer>
  </main>
 </div>;
}
