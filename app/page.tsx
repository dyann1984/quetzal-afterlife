'use client';
import {useState} from 'react';
import {analyzeCsv,MAX_BYTES,type CsvResult} from '../lib/csv';
import {parseDbf,MAX_DBF_BYTES,type DbfResult} from '../lib/dbf';

const sections=['Dashboard','Nueva recuperación','Laboratorio','Verificación','Archivo'] as const;
type Section=(typeof sections)[number];

export default function Home(){
 const [section,setSection]=useState<Section>('Dashboard');
 const [csvResult,setCsvResult]=useState<CsvResult|null>(null);
 const [dbfResult,setDbfResult]=useState<DbfResult|null>(null);
 const [filename,setFilename]=useState('');
 const [fileType,setFileType]=useState<'csv'|'dbf'|null>(null);
 const [error,setError]=useState('');

 async function upload(e:React.ChangeEvent<HTMLInputElement>){
  const f=e.target.files?.[0];
  if(!f)return;
  setCsvResult(null);setDbfResult(null);setError('');setFilename('');setFileType(null);
  try{
   const bytes=new Uint8Array(await f.arrayBuffer());
   const ext=f.name.toLowerCase().split('.').pop();
   if(ext==='dbf'){
    if(f.size>MAX_DBF_BYTES)throw new Error('El archivo supera el límite de 4 MB.');
    const r=parseDbf(bytes,f.name);
    setDbfResult(r);setFilename(f.name);setFileType('dbf');
   } else {
    if(f.size>MAX_BYTES)throw new Error('El archivo supera el límite de 2 MB.');
    const r=analyzeCsv(bytes,f.name);
    setCsvResult(r);setFilename(f.name);setFileType('csv');
   }
  }catch(err){setError(err instanceof Error?err.message:'No se pudo analizar el archivo.');}
  e.target.value='';
 }

 return <div className="shell">
  <aside>
   <div className="brand"><img src="/quetzal-logo.png" alt="Quetzal Afterlife"/><span>RESURRECTION ENGINE</span></div>
   <div className="navlabel">ESPACIO DE TRABAJO</div>
   <nav aria-label="Navegación principal">{sections.map((s,i)=><button key={s} className={section===s?'active':''} onClick={()=>setSection(s)}><span className="navicon">{['◈','＋','⌬','◇','▤'][i]}</span>{s}</button>)}</nav>
   <div className="sidebottom"><span className="pulse"/> FASE 02A <small>Motor DBF · Local</small></div>
  </aside>
  <main>
   <header>
    <div><span className="eyebrow">QUETZAL AFTERLIFE / {section.toUpperCase()}</span><p>THE DIGITAL RESURRECTION ENGINE</p></div>
    <span className="status"><i/> SISTEMA LOCAL</span>
   </header>

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
     <span className="muted">FASE 02A / MOTOR DBF</span>
    </div>
    <div className="cards">{[
     ['01','Archaeology','Importa evidencia CSV y DBF y examina su estructura.','DISPONIBLE'],
     ['02','Reconstruction','Identifica reglas y reconstruye operaciones.','PRÓXIMAMENTE'],
     ['03','Verification','Contrasta resultados contra evidencia independiente.','PRÓXIMAMENTE'],
     ['04','Preservation','Conserva datos y documenta hallazgos.','PRÓXIMAMENTE'],
    ].map(c=><article key={c[0]}><div className="cardtop"><span>{c[0]}</span><b>↗</b></div><h3>{c[1]}</h3><p>{c[2]}</p><small>{c[3]}</small></article>)}</div>
    <div className="note"><span>✧</span><div><strong>La confianza se construye con evidencia.</strong><p>Los datos recuperados, inferidos, verificados y desconocidos se distinguen explícitamente. Las funciones futuras no se presentan como completadas.</p></div></div>
   </>}

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

    {fileType==='csv'&&csvResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · CSV</span>
     <h2>{filename}</h2>
     <p>{csvResult.rows.length} filas · {csvResult.headers.length} columnas · UTF-8</p>
     {csvResult.warnings.map(w=><p key={w}>{w}</p>)}
     <div className="tablewrap"><table><thead><tr>{csvResult.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead>
     <tbody>{csvResult.rows.slice(0,10).map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table></div>
     <small>Vista previa: hasta 10 filas. Los valores son texto recuperado; aún no se han inferido ni verificado reglas.</small>
    </div>}

    {fileType==='dbf'&&dbfResult&&<div className="result">
     <span className="kicker">EVIDENCIA RECUPERADA · DBF</span>
     <h2>{filename}</h2>

     {/* Metadatos */}
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

     {/* Lista de campos */}
     <div className="dbf-fields">
      <span className="kicker" style={{marginTop:'20px',display:'block'}}>ESTRUCTURA DE CAMPOS</span>
      <div className="dbf-field-grid">
       {dbfResult.fields.map((f,i)=>(
        <div key={i} className={`dbf-field-item${f.typeKnown?'':' dbf-field-unknown'}`}>
         <span className="dbf-field-name">{f.name}</span>
         <span className="dbf-field-type">{f.type}</span>
         <span className="dbf-field-len">{f.length}</span>
         {!f.typeKnown&&<span className="dbf-field-warn" title="Tipo de campo desconocido">⚠</span>}
        </div>
       ))}
      </div>
     </div>

     {/* Tabla de registros */}
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

     {/* Advertencias */}
     {dbfResult.warnings.length>0&&<details className="dbf-warnings">
      <summary className="kicker" style={{cursor:'pointer',marginTop:'16px'}}>
       ADVERTENCIAS ({dbfResult.warnings.length})
      </summary>
      <ul className="dbf-warn-list">
       {dbfResult.warnings.map((w,i)=><li key={i}><span className="dbf-warn-code">{w.code}</span> {w.message}</li>)}
      </ul>
     </details>}

     <small style={{display:'block',marginTop:'12px'}}>Los valores son texto recuperado. El estado de cada registro (activo/borrado) refleja el marcador original del archivo. No se han inferido ni verificado reglas.</small>
    </div>}
   </div>}

   {section!=='Dashboard'&&section!=='Nueva recuperación'&&<div className="workspace">
    <span className="kicker">FASE 02A / EN PREPARACIÓN</span>
    <h1>{section}<span className="gold">.</span></h1>
    <p>{section==='Laboratorio'?'El análisis de evidencia comienza con la importación CSV y DBF. La inferencia y reconstrucción se desarrollarán en fases posteriores.':section==='Verificación'?'Aquí se incorporarán pruebas comparativas y trazabilidad. Todavía no hay resultados de recuperación verificados.':'La exportación y preservación de proyectos se desarrollarán en una fase posterior.'}</p>
    <button className="secondary" onClick={()=>setSection('Nueva recuperación')}>Ir a importación →</button>
   </div>}

   <footer><span>QUETZAL AFTERLIFE <b> / </b> THE DIGITAL RESURRECTION ENGINE</span><span>FASE 02A &nbsp; · &nbsp; 2026</span></footer>
  </main>
 </div>;
}
