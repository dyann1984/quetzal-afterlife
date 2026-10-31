'use client';
/**
 * File Recovery: recuperación de archivos (PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT), carving de imágenes de disco,
 * matriz de capacidades y diseño de Software Archaeology. Todo se procesa en el navegador, en solo lectura.
 */
import {useState} from 'react';
import {analyzeFile,carveImage,exportRecovered,reportJson,DEFAULT_LIMITS,type FileReport,type CarveReport} from '../lib/filerec';
import {buildFixtures,FIXTURE_DAMAGE} from '../lib/filerec/fixtures';
import {CAPACIDADES,AREA_LABEL,ESTADO_LABEL,resumen,type Estado} from '../lib/capabilities';

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
  <div className="project-card-top"><div><span className="project-name">{r.name}</span> <span className="dbf-field-type">{r.format.toUpperCase()}</span> <span className={`vstatus ${ig.cls}`}>{ig.txt}</span>{r.dangerous&&<span className="vstatus vstatus-diff" style={{marginLeft:6}}>peligroso · no se ejecuta</span>}{synthetic&&<span className="demo-badge" style={{marginLeft:6}}>SINTÉTICO</span>}</div><span className="muted">{r.label} · confianza {r.confidence}</span></div>
  <div className="project-meta"><span>{kb(r.size)}</span><span title={r.sha256}>SHA-256 {short(r.sha256)}</span><span>{r.elapsedMs} ms</span>{r.meta&&Object.entries(r.meta).map(([k,v])=><span key={k}>{k}: <b style={{color:'#c8d4dc'}}>{String(v)}</b></span>)}</div>
  <p style={{fontSize:'11px',color:'#687784',margin:'6px 0'}}>Identificado por: {r.signals.join('; ')}.</p>
  {r.findings.length>0&&<div className="inv-warnings">{r.findings.slice(0,10).map((f,i)=><p key={i} className="inv-warn-line"><span className={`vstatus ${SEV[f.severity]}`}>{f.severity==='dano'?'daño':f.severity}</span> {f.message}{f.offset!==undefined?` (offset ${f.offset})`:''}</p>)}{r.findings.length>10&&<p className="inv-warn-line">… {r.findings.length-10} hallazgos más (ver JSON).</p>}</div>}
  {r.damaged.length>0&&<div className="tablewrap"><table><thead><tr><th>Rango dañado (bytes)</th><th>Sectores de 512 B</th><th>Motivo</th></tr></thead><tbody>{r.damaged.slice(0,8).map((d,i)=><tr key={i}><td>{d.start.toLocaleString('es-MX')} – {d.end.toLocaleString('es-MX')}</td><td>{d.sectors?`${d.sectors[0]}–${d.sectors[1]}`:'—'}</td><td>{d.reason}</td></tr>)}</tbody></table></div>}
  {r.items.length>0&&<div className="tablewrap"><table><thead><tr><th>Recuperado</th><th>Tamaño</th><th>Verificación</th><th>Base</th></tr></thead><tbody>{r.items.slice(0,24).map((it,i)=><tr key={i}><td>{it.name}{it.preview&&<div style={{fontSize:'10px',color:'#8aa0b0',maxWidth:340,whiteSpace:'pre-wrap'}}>{it.preview.slice(0,160)}</div>}</td><td>{it.size.toLocaleString('es-MX')}</td><td><span className={`vstatus ${it.verified?'vstatus-ok':'vstatus-only'}`}>{it.verified?'✓ verificado':'⚠ no verificado'}</span></td><td style={{fontSize:'11px'}}>{it.basis}</td></tr>)}</tbody></table></div>}
  {r.repaired&&<p className={r.repaired.structureVerified?'save-ok':'save-err'} role="note">{r.repaired.structureVerified?'✓':'⚠'} Reparación propuesta «{r.repaired.name}»: {r.repaired.note}</p>}
  {r.limitations.length>0&&<details><summary style={{fontSize:'11px',color:'#94a0ac',cursor:'pointer'}}>Limitaciones ({r.limitations.length})</summary><ul style={{fontSize:'11px',color:'#94a0ac'}}>{r.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul></details>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}>
   <button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(`${r.name}.informe.json`,reportJson(r),'application/json')}>Informe JSON</button>
   {hasExport&&<button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(`${r.name}.recuperado.zip`,exportRecovered(r),'application/zip')}>Recuperado (ZIP seguro)</button>}
   {r.repaired&&<button className="secondary" style={{marginTop:0,padding:'6px 10px',fontSize:11}} onClick={()=>download(r.repaired!.name,r.repaired!.bytes,'application/octet-stream')}>Descargar reparado</button>}
  </div>
 </div>;
}

function CarveCard({c,synthetic}:{c:CarveReport;synthetic:boolean}){
 return <div className="project-card" data-testid="carve-report">
  <div className="project-card-top"><div><span className="project-name">{c.name}</span> <span className="dbf-field-type">IMAGEN EN BRUTO</span>{synthetic&&<span className="demo-badge" style={{marginLeft:6}}>SINTÉTICO</span>}</div><span className="muted">{c.candidates.length} candidato(s)</span></div>
  <div className="project-meta"><span>{kb(c.size)}</span><span title={c.sha256}>SHA-256 {short(c.sha256)}</span><span>solo lectura, sobre copia en memoria</span></div>
  <div className="tablewrap"><table><thead><tr><th>Formato</th><th>Sector (512 B)</th><th>Offset</th><th>Longitud</th><th>Fin hallado</th><th>Estado</th><th>SHA-256</th><th/></tr></thead><tbody>
   {c.candidates.map((k,i)=>{const ig=INTEG[k.integrity??'no-analizado'];return <tr key={i}><td>{k.format.toUpperCase()}</td><td>{k.sectorStart}{k.aligned?'':' (no alineado)'}</td><td>{k.offset.toLocaleString('es-MX')}</td><td>{k.length.toLocaleString('es-MX')}</td><td>{k.endFound?'sí':'no'}</td><td><span className={`vstatus ${ig.cls}`}>{ig.txt}</span></td><td title={k.sha256}>{k.sha256?short(k.sha256):''}</td><td><button className="link-btn" onClick={()=>download(`${c.name}@${k.offset}.${k.format}`,k.bytes,'application/octet-stream')}>Extraer</button></td></tr>;})}
   {c.candidates.length===0&&<tr><td colSpan={8}>Sin firmas de archivos reconocidas: no se inventa ningún candidato.</td></tr>}
  </tbody></table></div>
  <ul style={{fontSize:'11px',color:'#94a0ac'}}>{c.notes.map((n,i)=><li key={i}>{n}</li>)}</ul>
 </div>;
}

export default function FileRecovery(){
 const [tab,setTab]=useState<'recuperar'|'matriz'|'arqueologia'>('recuperar');
 const [reports,setReports]=useState<Array<{r:FileReport;synthetic:boolean}>>([]);
 const [carves,setCarves]=useState<Array<{c:CarveReport;synthetic:boolean}>>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [asDisk,setAsDisk]=useState(false);
 const [busy,setBusy]=useState(false);
 const res=resumen();

 async function process(files:Array<{name:string;bytes:Uint8Array;disk?:boolean}>,synthetic:boolean){
  setBusy(true);const errs:string[]=[];const rs:typeof reports=[],cs:typeof carves=[];
  for(const f of files){
   try{
    if(f.disk)cs.push({c:await carveImage(f.bytes,f.name),synthetic});
    else rs.push({r:await analyzeFile(f.bytes,f.name),synthetic});
   }catch(e){errs.push(`${f.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  setReports(p=>[...rs,...p]);setCarves(p=>[...cs,...p]);setErrors(errs);setBusy(false);
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

 return <div className="workspace">
  <span className="kicker">RECOVERY / ARCHIVOS Y SISTEMAS</span>
  <h1>File Recovery<span className="gold">.</span></h1>
  <div className="exp-tabs" role="tablist" style={{margin:'10px 0 18px'}}>
   {([['recuperar','Recuperar archivos'],['matriz','Matriz de capacidades'],['arqueologia','Software Archaeology']] as const).map(([k,l])=><button key={k} role="tab" aria-selected={tab===k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}
  </div>

  {tab==='recuperar'&&<>
   <p>Identifica el formato por <b>firma binaria</b>, diagnostica la integridad, extrae solo lo <b>verificable</b> (CRC-32, Adler-32, estructura), registra los rangos y sectores dañados y exporta de forma segura. No se ejecuta nada ni se modifica ningún original. <b>No se promete recuperación universal</b>: lo sobrescrito o ausente no existe.</p>
   <label className="drop" style={{maxWidth:740}}>
    <span className="upload">↑</span><strong>Importar archivos (PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT…)</strong>
    <span>hasta {kb(DEFAULT_LIMITS.maxFileBytes)} cada uno · el tipo se decide por contenido, no por extensión</span>
    <input type="file" multiple onChange={onFiles} aria-label="Importar archivos para recuperar"/>
   </label>
   <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',marginTop:12}}>
    <label style={{fontSize:12,color:'#94a0ac'}}><input type="checkbox" checked={asDisk} onChange={e=>setAsDisk(e.target.checked)}/> Tratar el siguiente archivo como imagen de disco en bruto (buscar archivos incrustados)</label>
    <button className="primary" style={{marginTop:0}} onClick={loadFixtures} disabled={busy}>Cargar fixtures SINTÉTICOS</button>
    {(reports.length>0||carves.length>0)&&<button className="secondary" style={{marginTop:0}} onClick={()=>{setReports([]);setCarves([]);setErrors([]);}}>Limpiar</button>}
   </div>
   {errors.map((e,i)=><p key={i} role="alert" className="error">{e}</p>)}
   {busy&&<p role="status" className="muted" style={{display:'block'}}>Analizando…</p>}
   {reports.length===0&&carves.length===0&&<div className="note"><span>◈</span><div><strong>Fixtures sintéticos.</strong><p>Archivos generados por código con daños controlados (no son datos reales):</p><ul style={{color:'#9c9d98',fontSize:12,lineHeight:1.6}}>{FIXTURE_DAMAGE.map(d=><li key={d}>{d}</li>)}</ul></div></div>}
   {carves.map((c,i)=><CarveCard key={`c${i}`} c={c.c} synthetic={c.synthetic}/>)}
   {reports.map((r,i)=><ReportCard key={`r${i}-${r.r.sha256}`} r={r.r} synthetic={r.synthetic}/>)}
  </>}

  {tab==='matriz'&&<>
   <p>Estado real de cada capacidad. <b>{res.implementadoProbado}</b> implementadas y probadas · <b>{res.parcial}</b> parciales · <b>{res.noImplementado}</b> no implementadas. La matriz está respaldada por pruebas automatizadas que verifican que cada entrada apunte a código y pruebas existentes.</p>
   <div className="tablewrap"><table><thead><tr><th>Área</th><th>Formato</th><th>Estado</th><th>Qué hace hoy</th><th>Limitaciones</th><th>Riesgos</th><th>Dependencias</th></tr></thead><tbody>
    {CAPACIDADES.map(c=><tr key={c.id}><td>{AREA_LABEL[c.area]}</td><td>{c.formato}</td><td><span className={`vstatus ${EST_CLS[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span></td><td style={{fontSize:11}}>{c.soporta}</td><td style={{fontSize:11}}>{c.limitaciones}</td><td style={{fontSize:11}}>{c.riesgos}</td><td style={{fontSize:11}}>{c.dependencias}</td></tr>)}
   </tbody></table></div>
  </>}

  {tab==='arqueologia'&&<>
   <p className="inv-warn-line">⚠ <b>Solo diseño, sin implementar.</b> Hoy los ejecutables únicamente se identifican y se rechazan: <b>nunca se ejecutan</b>.</p>
   <div className="note"><span>◈</span><div><strong>Software Archaeology (diseño)</strong>
    <p>Análisis <b>estático y de solo lectura</b> de programas heredados (PE, ELF, Mach-O): cabeceras, secciones, importaciones, cadenas, entropía y recursos. Produce <b>hipótesis con evidencia localizable</b> sobre qué hacía el programa y propuestas de reconstrucción funcional etiquetadas como observadas, inferidas o propuestas.</p>
    <p><b>No afirma</b> recuperar el código fuente original ni la lógica de negocio completa. Sin ejecución, sin emulación en la primera versión y con los mismos límites de tamaño, memoria y tiempo.</p>
    <p>Detalle, fases y criterios de aceptación: <code>docs/software-archaeology.md</code>. Roadmap general: <code>docs/recuperacion-universal.md</code>.</p></div></div>
  </>}
 </div>;
}

