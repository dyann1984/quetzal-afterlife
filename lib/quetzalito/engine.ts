/**
 * Motor de respuestas local de Quetzalito: funciones puras (sin red, sin IA, sin DOM).
 * Entiende la pregunta por palabras clave sobre la base de conocimiento (kb.ts), da prioridad a lo relevante para la
 * sección actual y adapta los pasos siguientes al estado real de la sesión (datos cargados, demo, verificación).
 */
import {ENTRIES,SECTIONS,SECTION_IDS,GENERIC_SUGGEST,UI,type Entry,type Lang,type SectionId} from './kb';

export interface Ctx{section:string;hasData:boolean;isDemo:boolean;fileType:'csv'|'dbf'|null;hasVerification:boolean;
 /** Resumen del último archivo resucitado (titular y siguiente paso salen de explainRun, es decir, del informe real). */
 fileRun?:{headline:string;next:string}|null}
export interface Suggestion{id:string;text:string}
export interface ActionOut{label:string;goto:string}
export interface Answer{text:string;actions:ActionOut[];follow:Suggestion[];kind:'kb'|'section'|'next'|'greeting'|'thanks'|'fallback'|'ai';entryId?:string}

const STOP=new Set(('el la los las un una unos unas de del al y o u en a por para con sin que es son se me mi mis tu tus lo le les como cual cuales donde cuando '+
 'the a an of to in on for and or with without is are be do does i my me you your it its how what which where when can could should would').split(' '));
export const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9_ ]+/g,' ').replace(/\s+/g,' ').trim();
export const tokens=(s:string)=>normalize(s).split(' ').filter(t=>t.length>1&&!STOP.has(t));

const byId=new Map(ENTRIES.map(e=>[e.id,e]));
export const entryById=(id:string)=>byId.get(id);
export const isSection=(s:string):s is SectionId=>(SECTION_IDS as readonly string[]).includes(s);
const sectionOf=(ctx:Ctx):SectionId=>isSection(ctx.section)?ctx.section:'Dashboard';

const idx=ENTRIES.map(e=>({e,kw:new Set(tokens(`${e.kw.es} ${e.kw.en}`)),q:new Set(tokens(`${e.q.es} ${e.q.en}`))}));
const MIN_SCORE=3;

export function scoreEntries(query:string,ctx:Ctx){
 const qt=[...new Set(tokens(query))];
 return idx.map(({e,kw,q})=>{
  let s=0;
  for(const t of qt){
   if(kw.has(t))s+=3;
   else if(t.length>=5){const p=t.slice(0,5);if([...kw].some(k=>k.startsWith(p)))s+=1.2;}
   if(q.has(t))s+=1.5;   // la palabra también está en el título de la pregunta: desempata a favor de la entrada más específica
  }
  if(s>0&&e.sections?.includes(ctx.section))s+=1;
  return {id:e.id,score:s};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
}

const toSuggestion=(id:string,lang:Lang):Suggestion|null=>{const e=byId.get(id);return e?{id,text:e.q[lang]}:null;};
const uniq=<T,>(a:T[])=>[...new Set(a)];

/** Preguntas sugeridas para la sección actual (+ genéricas), sin repetir las ya excluidas. */
export function suggestionsFor(ctx:Ctx,lang:Lang,exclude:string[]=[]):Suggestion[]{
 const ids=uniq([...SECTIONS[sectionOf(ctx)].suggest,...GENERIC_SUGGEST]).filter(i=>!exclude.includes(i));
 return ids.map(i=>toSuggestion(i,lang)).filter((x):x is Suggestion=>!!x).slice(0,6);
}

const actionsOf=(e:Entry,lang:Lang):ActionOut[]=>(e.actions??[]).map(a=>({label:a.label[lang],goto:a.goto}));

/** Texto y acciones de «¿qué hago ahora?», según la sección y lo que ya se ha cargado. */
export function nextStep(ctx:Ctx,lang:Lang):Answer{
 const s=sectionOf(ctx),es=lang==='es';
 const A=(label:string,goto:string):ActionOut=>({label:`${UI.goTo[lang]} ${label}`,goto});
 const data=ctx.hasData?(es?`Ya hay datos cargados${ctx.fileType?` (${ctx.fileType.toUpperCase()})`:''}${ctx.isDemo?' · SINTÉTICOS':''}.`:`Data is already loaded${ctx.fileType?` (${ctx.fileType.toUpperCase()})`:''}${ctx.isDemo?' · SYNTHETIC':''}.`):(es?'Todavía no hay datos cargados.':'No data is loaded yet.');
 let t='',acts:ActionOut[]=[];
 const NEXT:Partial<Record<SectionId,SectionId>>={Discovery:'Recovery',Recovery:'Schema Intelligence','Schema Intelligence':'AI Analyst','AI Analyst':'Reconstruction',Reconstruction:'Resurrection Studio','Resurrection Studio':'Evidence Vault'};
 if(s==='Dashboard'||s==='Nueva recuperación'||s==='Laboratorio'||s==='Verificación'||s==='Archivo'){
  if(!ctx.hasData){
   t=es?`${data} Lo más rápido es pulsar ▶ DEMO (arriba a la derecha) para abrir el Laboratorio con datos SINTÉTICOS. Si prefieres lo tuyo, sube un CSV o DBF en «Nueva recuperación». Para el motor completo, usa Discovery → «Cargar escenario SINTÉTICO».`
      :`${data} The quickest way is to press ▶ DEMO (top right) to open the Lab with SYNTHETIC data. If you prefer your own, upload a CSV or DBF in “Nueva recuperación”. For the full engine use Discovery → “Cargar escenario SINTÉTICO”.`;
   acts=[A(es?'Nueva recuperación':'New recovery','Nueva recuperación'),A('Discovery','Discovery')];
  }else if(s==='Verificación'&&!ctx.hasVerification){
   t=es?`${data} Sube ahora un archivo de referencia independiente para ver coincidencias y discrepancias.`:`${data} Now upload an independent reference file to see matches and discrepancies.`;
  }else if(s==='Laboratorio'||s==='Nueva recuperación'||s==='Dashboard'){
   t=es?`${data} Revisa los campos y totales en el Laboratorio, contrasta con una referencia en Verificación y guarda el proyecto en Archivo.`:`${data} Review fields and totals in the Lab, cross-check with a reference in Verification and save the project in Archive.`;
   acts=[A(es?'Laboratorio':'Lab','Laboratorio'),A(es?'Verificación':'Verification','Verificación'),A(es?'Archivo':'Archive','Archivo')].filter(a=>a.goto!==s);
  }else{
   t=es?`${data} Exporta CSV/JSON si quieres conservar los resultados y guarda el proyecto en Archivo.`:`${data} Export CSV/JSON to keep the results and save the project in Archive.`;
   acts=s==='Archivo'?[]:[A(es?'Archivo':'Archive','Archivo')];
  }
 }else if(s==='File Recovery'){
  if(ctx.fileRun)t=`${ctx.fileRun.headline} ${ctx.fileRun.next}`;
  else t=es?'Importa un archivo dañado (JSON, XML, CSV, SQLite, PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT) o pulsa «Cargar fixtures SINTÉTICOS». Verás las seis etapas avanzar y, al final, el veredicto, el comparador y mi explicación.':'Import a damaged file (JSON, XML, CSV, SQLite, PNG, JPEG, PDF, ZIP/DOCX/XLSX, TXT) or press “Cargar fixtures SINTÉTICOS”. You will see the six stages advance and, at the end, the verdict, the comparator and my explanation.';
 }else{
  const n=NEXT[s];
  t=`${SECTIONS[s].howto[lang]}`;
  if(n)acts=[A(n,n)];else t+=es?' Es el último paso del motor: aquí obtienes el expediente verificable.':' It is the last step of the engine: here you get the verifiable dossier.';
 }
 return {text:t,actions:acts,follow:suggestionsFor(ctx,lang),kind:'next'};
}

/** Introducción a la sección actual (saludo contextual). */
export function sectionIntro(ctx:Ctx,lang:Lang):Answer{
 const s=sectionOf(ctx),info=SECTIONS[s];
 return {text:`${UI.greeting[lang]}\n${UI.sectionTitle[lang]} «${info.title[lang]}». ${info.what[lang]}\n${info.howto[lang]}`,actions:[],follow:suggestionsFor(ctx,lang),kind:'section'};
}

export function answerEntry(id:string,ctx:Ctx,lang:Lang):Answer{
 const e=byId.get(id);
 if(!e)return fallback(ctx,lang,[]);
 const follow=(e.follow&&e.follow.length?[...e.follow,...suggestionsFor(ctx,lang).map(s=>s.id)]:suggestionsFor(ctx,lang).map(s=>s.id)).filter(i=>i!==id);
 return {text:e.a[lang],actions:actionsOf(e,lang),follow:uniq(follow).map(i=>toSuggestion(i,lang)).filter((x):x is Suggestion=>!!x).slice(0,4),kind:'kb',entryId:id};
}

function fallback(ctx:Ctx,lang:Lang,near:string[]):Answer{
 const ids=uniq([...near,...SECTIONS[sectionOf(ctx)].suggest]).slice(0,4);
 return {text:UI.fallback[lang],actions:[],follow:ids.map(i=>toSuggestion(i,lang)).filter((x):x is Suggestion=>!!x),kind:'fallback'};
}

const RE_GREET=/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|hello|hi|good morning|good afternoon|good evening|saludos)\b/;
const RE_THANKS=/\b(gracias|muchas gracias|thanks|thank you|thx|genial gracias)\b/;
const RE_NEXT=/\b(que hago ahora|que sigue|siguiente paso|como sigo|y ahora|por donde empiezo|por donde empiezo|por donde comienzo|what now|what next|next step|what should i do|where do i start|where should i start|what do i do)\b/;
const RE_HERE=/\b(que es esta seccion|que es esta pantalla|esta seccion|esta pantalla|donde estoy|ayuda|help|what is this section|what is this page|where am i|this section|this page)\b/;

/** Respuesta local a un texto libre. */
export function answer(query:string,ctx:Ctx,lang:Lang):Answer{
 const n=normalize(query);
 if(!n)return sectionIntro(ctx,lang);
 if(RE_NEXT.test(n))return nextStep(ctx,lang);
 if(RE_THANKS.test(n)&&n.split(' ').length<=5)return {text:UI.thanks[lang],actions:[],follow:suggestionsFor(ctx,lang),kind:'thanks'};
 if(RE_GREET.test(n)&&n.split(' ').length<=4)return {...sectionIntro(ctx,lang),kind:'greeting'};
 const scored=scoreEntries(query,ctx);
 if(scored.length&&scored[0].score>=MIN_SCORE&&!(RE_HERE.test(n)&&scored[0].score<6))return answerEntry(scored[0].id,ctx,lang);
 if(RE_HERE.test(n))return sectionIntro(ctx,lang);
 return fallback(ctx,lang,scored.slice(0,3).map(s=>s.id));
}
