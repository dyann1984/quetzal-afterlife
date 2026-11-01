/**
 * Preferencias de Quetzalito (abierto/cerrado, minimizado, idioma, tema) en localStorage, como almacén externo
 * para useSyncExternalStore. Todo acceso al almacenamiento va en try/catch (modo privado, bloqueado, etc.).
 */
import type {Lang} from './kb';

export type ThemePref='auto'|'light'|'dark';
export interface Prefs{open:boolean;min:boolean;lang:Lang|null;theme:ThemePref}
export const PREFS_KEY='quetzalito:v1';
export const DEFAULT_PREFS:Prefs={open:false,min:false,lang:null,theme:'auto'};

export function parsePrefs(raw:string|null):Prefs{
 if(!raw)return DEFAULT_PREFS;
 try{
  const j=JSON.parse(raw) as Partial<Prefs>;
  return {open:j.open===true,min:j.min===true,lang:j.lang==='es'||j.lang==='en'?j.lang:null,theme:j.theme==='light'||j.theme==='dark'?j.theme:'auto'};
 }catch{return DEFAULT_PREFS;}
}

let cache:Prefs|null=null;
const subs=new Set<()=>void>();
export const getPrefs=():Prefs=>{
 if(cache)return cache;
 let raw:string|null=null;
 try{raw=typeof window!=='undefined'?window.localStorage.getItem(PREFS_KEY):null;}catch{raw=null;}
 return cache=parsePrefs(raw);
};
export const getServerPrefs=():Prefs=>DEFAULT_PREFS;
export function setPrefs(patch:Partial<Prefs>){
 cache={...getPrefs(),...patch};
 try{window.localStorage.setItem(PREFS_KEY,JSON.stringify(cache));}catch{/* sin almacenamiento: la preferencia vive solo en esta sesión */}
 subs.forEach(f=>f());
}
export const subscribePrefs=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
/** Solo para pruebas: olvida la copia en memoria. */
export const _resetPrefsCache=()=>{cache=null;};

// ── Señales de la página: idioma (<html lang>) y tema (<html data-theme>) ─────────────────────────────
export const docSignal=():string=>typeof document==='undefined'?'es|':`${document.documentElement.lang||'es'}|${document.documentElement.dataset.theme??''}`;
export const subscribeDoc=(f:()=>void)=>{
 if(typeof MutationObserver==='undefined'||typeof document==='undefined')return()=>{};
 const o=new MutationObserver(f);o.observe(document.documentElement,{attributes:true,attributeFilter:['lang','data-theme']});
 return()=>o.disconnect();
};
export const serverDocSignal=()=>'es|';
export function effectiveLang(p:Prefs,signal:string):Lang{return p.lang??(signal.split('|')[0].toLowerCase().startsWith('en')?'en':'es');}
/** «auto» sigue el tema de la página si lo define; la plataforma actual es oscura, así que por defecto es oscuro. */
export function effectiveTheme(p:Prefs,signal:string):'light'|'dark'{return p.theme==='auto'?(signal.split('|')[1]==='light'?'light':'dark'):p.theme;}
