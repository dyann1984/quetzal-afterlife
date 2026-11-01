'use client';
/**
 * Quetzalito: asistente flotante bilingüe (ES/EN). Primera fase 100 % local: base de conocimiento, respuestas guiadas y
 * sugerencias por sección (lib/quetzalito). No toca los motores ni el holograma; solo recibe la sección actual y un resumen
 * del estado de la sesión, y puede pedir al Dashboard que cambie de sección. Recuerda abierto/minimizado, idioma y tema.
 */
import {useCallback,useEffect,useId,useRef,useState,useSyncExternalStore} from 'react';
import Avatar from './Avatar';
import './quetzalito.css';
import {SECTION_IDS,UI,SECTIONS,type Lang} from '../../lib/quetzalito/kb';
import {isSection,sectionIntro,suggestionsFor,answerEntry,type Answer,type Ctx} from '../../lib/quetzalito/engine';
import {resolveAnswer} from '../../lib/quetzalito/ai';
import {docSignal,effectiveTheme,getPrefs,getServerPrefs,serverDocSignal,setPrefs,subscribeDoc,subscribePrefs} from '../../lib/quetzalito/prefs';
import {useUi,type ThemePref} from '../../lib/i18n';
import {setLang,setTheme} from '../../lib/i18n/store';

interface Msg{id:number;lang:Lang;role:'user'|'bot';text:string;actions?:Answer['actions'];kind?:Answer['kind']}
const THEME_ORDER:ThemePref[]=['system','light','dark'];
const THEME_ICON:Record<ThemePref,string>={system:'◐',light:'☀',dark:'☾'};
const THEME_KEY:Record<ThemePref,'themeAuto'|'themeLight'|'themeDark'>={system:'themeAuto',light:'themeLight',dark:'themeDark'};

export default function Quetzalito({section,context,onNavigate}:{section:string;context:Omit<Ctx,'section'>;onNavigate:(section:string)=>void}){
 const prefs=useSyncExternalStore(subscribePrefs,getPrefs,getServerPrefs);
 const sig=useSyncExternalStore(subscribeDoc,docSignal,serverDocSignal);
 const ui=useUi();   // idioma y tema son los de TODA la plataforma
 const lang:Lang=ui.lang,theme=effectiveTheme(sig);
 const [msgs,setMsgs]=useState<Msg[]>([]);
 const [text,setText]=useState('');
 const ctx:Ctx={section,...context};
 const idRef=useRef(1);
 const logRef=useRef<HTMLDivElement>(null),inputRef=useRef<HTMLInputElement>(null),fabRef=useRef<HTMLButtonElement>(null);
 const wasOpen=useRef(false);
 const uid=useId();
 const open=prefs.open,min=prefs.min;
 const t=(k:keyof typeof UI)=>UI[k][lang];

 // Foco: al abrir va al campo de texto; al cerrar vuelve al botón flotante.
 useEffect(()=>{
  if(open&&!min){inputRef.current?.focus();wasOpen.current=true;}
  else if(!open&&wasOpen.current){fabRef.current?.focus();wasOpen.current=false;}
 },[open,min]);
 useEffect(()=>{const el=logRef.current;if(el)el.scrollTop=el.scrollHeight;},[msgs,open,min,lang]);

 const push=useCallback((m:Omit<Msg,'id'|'lang'>)=>setMsgs(prev=>[...prev,{...m,lang,id:idRef.current++}]),[lang]);
 const reply=useCallback((a:Answer)=>push({role:'bot',text:a.text,actions:a.actions,kind:a.kind}),[push]);

 const askText=useCallback(async(q:string)=>{
  const clean=q.trim().slice(0,300);if(!clean)return;
  push({role:'user',text:clean});setText('');
  reply(await resolveAnswer(clean,ctx,lang));
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[push,reply,lang,section,context.hasData,context.isDemo,context.fileType,context.hasVerification,context.fileRun?.headline]);
 const askId=useCallback((id:string,label:string)=>{
  push({role:'user',text:label});reply(answerEntry(id,ctx,lang));
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[push,reply,lang,section,context.hasData,context.isDemo,context.fileType,context.hasVerification,context.fileRun?.headline]);
 const go=useCallback((goto:string)=>{
  if(!(SECTION_IDS as readonly string[]).includes(goto))return;
  onNavigate(goto);
  if(typeof window!=='undefined'&&window.matchMedia('(max-width:600px)').matches)setPrefs({min:true});   // en móvil se aparta para no tapar el contenido
 },[onNavigate]);

 const sug=suggestionsFor(ctx,lang);
 const intro=sectionIntro(ctx,lang);
 const mine=msgs.filter(m=>m.lang===lang);   // al cambiar de idioma no se mezclan respuestas de otro idioma
 const shown:Msg[]=mine.length?mine:[{id:0,lang,role:'bot',text:intro.text,kind:'section'}];
 const title=isSection(section)?SECTIONS[section].title[lang]:section;

 const root=(children:React.ReactNode)=><div className="qz-root" data-qz-theme={theme} lang={lang}>{children}</div>;

 if(!open)return root(<button ref={fabRef} className="qz-fab" aria-label={t('open')} aria-expanded={false} aria-controls={`${uid}-panel`} onClick={()=>setPrefs({open:true,min:false})}>
  <Avatar size={62}/><span className="qz-tip" aria-hidden="true">{lang==='es'?'¿Dudas? Pregúntale a Quetzalito':'Questions? Ask Quetzalito'}</span>
 </button>);

 return root(<section id={`${uid}-panel`} className={`qz-panel${min?' qz-min':''}`} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}
   onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setPrefs({open:false});}}}>
  <div className="qz-head">
   <Avatar size={40}/>
   <div className="qz-title"><h2 id={`${uid}-title`}>{t('name')}</h2><p>{min?`${t('inSection')}: ${title}`:t('role')}</p></div>
   <div className="qz-ctl">
    {!min&&<div className="qz-seg" role="group" aria-label={t('langLabel')}>
     {(['es','en'] as Lang[]).map(l=><button key={l} type="button" aria-pressed={lang===l} aria-label={l==='es'?'Español':'English'} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}
    </div>}
    {!min&&<button type="button" aria-label={`${t('themeLabel')}: ${t(THEME_KEY[ui.theme])}`} title={`${t('themeLabel')}: ${t(THEME_KEY[ui.theme])}`}
     onClick={()=>setTheme(THEME_ORDER[(THEME_ORDER.indexOf(ui.theme)+1)%3])}><span aria-hidden="true">{THEME_ICON[ui.theme]}</span></button>}
    <button type="button" aria-label={min?(lang==='es'?'Restaurar asistente':'Restore assistant'):t('minimize')} aria-expanded={!min} onClick={()=>setPrefs({min:!min})}><span aria-hidden="true">{min?'▢':'–'}</span></button>
    <button type="button" aria-label={t('close')} onClick={()=>setPrefs({open:false})}><span aria-hidden="true">✕</span></button>
   </div>
  </div>
  {!min&&<div className="qz-body">
   <div className="qz-ctx">{t('inSection')}: <b>{title}</b></div>
   <div className="qz-log" ref={logRef} role="log" aria-live="polite" aria-relevant="additions" tabIndex={0} aria-label={lang==='es'?'Conversación con Quetzalito':'Conversation with Quetzalito'}>
    {shown.map(m=><div key={m.id} className={`qz-msg ${m.role==='bot'?'qz-bot':'qz-user'}`}>
     <span className="qz-who">{m.role==='bot'?`${t('name')} · ${m.kind==='ai'?t('aiTag'):t('guidedTag')}`:t('you')}</span>{m.text}
     {m.actions&&m.actions.length>0&&<div className="qz-acts">{m.actions.map(a=><button key={a.goto+a.label} type="button" onClick={()=>go(a.goto)}>{a.label} →</button>)}</div>}
    </div>)}
   </div>
   <div className="qz-sug"><h3 id={`${uid}-sug`}>{t('suggested')}</h3>
    <div className="qz-chips" role="group" aria-labelledby={`${uid}-sug`}>{sug.map(s=><button key={s.id} type="button" onClick={()=>askId(s.id,s.text)}>{s.text}</button>)}</div>
   </div>
   <form className="qz-form" onSubmit={e=>{e.preventDefault();void askText(text);}}>
    <label className="qz-sr" htmlFor={`${uid}-in`}>{t('placeholder')}</label>
    <input id={`${uid}-in`} ref={inputRef} value={text} maxLength={300} onChange={e=>setText(e.target.value)} placeholder={t('placeholder')} autoComplete="off" enterKeyHint="send"/>
    <button type="submit" disabled={!text.trim()}>{t('send')}</button>
   </form>
   <p className="qz-note">{t('note')}{mine.length>0&&<> · <button type="button" style={{all:'unset',cursor:'pointer',textDecoration:'underline',color:'inherit'}} onClick={()=>setMsgs([])}>{t('clear')}</button></>}</p>
  </div>}
 </section>);
}
