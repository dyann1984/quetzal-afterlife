'use client';
/**
 * Panel del Dashboard con estadísticas REALES: salen del historial local de resurrecciones (solo metadatos) y del
 * archivo de proyectos. Sin datos, muestra un estado vacío que explica cómo empezar; nunca cifras de relleno.
 * Las ejecuciones con fixtures se cuentan aparte y se rotulan como SINTÉTICAS.
 */
import {useEffect,useSyncExternalStore} from 'react';
import {getSession,getServerSession,subscribeSession,loadHistory,computeStats,clearHistory} from '../lib/filerec/session';
import {OUTCOME_LABEL,type Outcome} from '../lib/filerec/protocol';
import {tr,tm,nf,tf} from '../lib/i18n';

const kb=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MiB`:n>=1024?`${(n/1024).toFixed(1)} KiB`:`${n} B`;
const ORDER:Outcome[]=['integro','reparado-validado','recuperacion-parcial','reparacion-sin-verificar','solo-diagnostico','irrecuperable','no-analizado'];
const TONE:Partial<Record<Outcome,string>>={integro:'good','reparado-validado':'good','recuperacion-parcial':'mid','reparacion-sin-verificar':'mid','solo-diagnostico':'bad',irrecuperable:'bad'};

export default function DashboardStats({projects,goto}:{projects:number;goto:(s:string)=>void}){
 const ses=useSyncExternalStore(subscribeSession,getSession,getServerSession);
 useEffect(()=>{loadHistory();},[]);
 const st=computeStats(ses.history);
 const max=Math.max(1,...ORDER.map(o=>st.byOutcome[o]));
 return <section className="ds" aria-label={tr('Estadísticas reales de este navegador')}>
  <div className="sectionhead">
   <div><span className="eyebrow">{tr('TU ACTIVIDAD · SOLO EN ESTE NAVEGADOR')}</span><h2>{tr('Resurrecciones registradas')}</h2></div>
   {st.total>0&&<button className="link-btn" onClick={()=>{if(window.confirm(tr('¿Borrar el historial de este navegador? Los archivos nunca se guardaron; solo se borran los metadatos.')))clearHistory();}}>{tr('Borrar historial')}</button>}
  </div>
  {st.total===0?<div className="rz-empty"><div className="rz-empty-orb" aria-hidden="true"/><div>
    <strong>{tr('Todavía no hay operaciones registradas.')}</strong>
    <p>{tr('Este panel solo muestra lo que de verdad ocurrió en este navegador: no hay cifras de ejemplo. Resucita un archivo y aquí aparecerán el veredicto, los formatos y las reparaciones validadas.')}</p>
    <button className="primary" style={{marginTop:6}} onClick={()=>goto('File Recovery')}>{tr('Resucitar un archivo')} <span>↗</span></button>
   </div></div>
  :<>
   <div className="ds-kpis">
    <div><b>{nf(st.total)}</b><span>{tr('archivos analizados')}</span><small>{tf('{0} reales · {1} sintéticos',nf(st.real),nf(st.synthetic))}</small></div>
    <div><b>{nf(st.validatedRepairs)}</b><span>{tr('reparaciones validadas')}</span><small>{tr('superaron un re-análisis completo')}</small></div>
    <div><b>{nf(st.verifiedItems)}</b><span>{tr('elementos verificados')}</span><small>{tr('con CRC, Adler-32 o estructura')}</small></div>
    <div><b>{kb(st.bytes)}</b><span>{tr('procesados en local')}</span><small>{tf('{0} proyecto(s) en Archivo',nf(projects))}</small></div>
   </div>
   <div className="ds-grid">
    <div className="ds-card"><h3>{tr('Veredictos')}</h3>
     <ul className="ds-bars">{ORDER.filter(o=>st.byOutcome[o]>0).map(o=><li key={o} className={`ds-${TONE[o]??'neutral'}`}><span>{tm(OUTCOME_LABEL[o])}</span><i style={{width:`${(st.byOutcome[o]/max)*100}%`}}/><b>{nf(st.byOutcome[o])}</b></li>)}</ul>
    </div>
    <div className="ds-card"><h3>{tr('Formatos')}</h3>
     <div className="ds-formats">{st.byFormat.slice(0,10).map(([f,n])=><span key={f}>{f.toUpperCase()} <b>{nf(n)}</b></span>)}</div>
     <h3 style={{marginTop:16}}>{tr('Últimas operaciones')}</h3>
     <ul className="ds-recent">{ses.history.slice(0,5).map(h=><li key={h.id}><span className={`ds-dot ds-${TONE[h.outcome]??'neutral'}`}/><span className="ds-name">{h.name}</span>{h.synthetic&&<span className="demo-badge">{tr('SINTÉTICO')}</span>}<time dateTime={h.at}>{new Date(h.at).toLocaleString()}</time></li>)}</ul>
    </div>
   </div>
   {ses.storage!=='ok'&&<p className="error" role="alert">{tr('El almacenamiento local no está disponible: el historial solo dura mientras la pestaña siga abierta.')}</p>}
  </>}
 </section>;
}
