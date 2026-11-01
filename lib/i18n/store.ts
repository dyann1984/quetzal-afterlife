/**
 * Idioma (Español / English) y tema (Claro / Oscuro / Sistema) de TODA la plataforma, con persistencia local.
 * Es un almacén externo (useSyncExternalStore): la página raíz se suscribe y, al cambiar, todo se vuelve a pintar.
 * El estado inicial es el valor por defecto (es · sistema) hasta que `initUi()` lee lo guardado tras montar,
 * así el servidor y la hidratación producen el mismo HTML. Un script en <head> (ver layout.tsx) aplica el tema
 * antes del primer pintado para evitar destellos.
 */
export type Lang='es'|'en';
export type ThemePref='system'|'light'|'dark';
export interface UiPrefs{lang:Lang;theme:ThemePref}
export const UI_KEY='quetzal:ui:v1';
export const DEFAULT_UI:UiPrefs={lang:'es',theme:'system'};

export function parseUi(raw:string|null):UiPrefs{
 if(!raw)return DEFAULT_UI;
 try{const j=JSON.parse(raw) as Partial<UiPrefs>;return {lang:j.lang==='en'?'en':'es',theme:j.theme==='light'||j.theme==='dark'?j.theme:'system'};}
 catch{return DEFAULT_UI;}
}
export function resolveTheme(pref:ThemePref,systemLight:boolean):'light'|'dark'{return pref==='system'?(systemLight?'light':'dark'):pref;}

let state:UiPrefs=DEFAULT_UI;
const subs=new Set<()=>void>();
export const getUi=():UiPrefs=>state;
export const getServerUi=():UiPrefs=>DEFAULT_UI;
export const subscribeUi=(f:()=>void)=>{subs.add(f);return()=>{subs.delete(f);};};
const systemLight=()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(prefers-color-scheme: light)').matches;

function applyToDocument(p:UiPrefs){
 if(typeof document==='undefined')return;
 const el=document.documentElement;
 el.lang=p.lang;el.dataset.theme=resolveTheme(p.theme,systemLight());el.dataset.themePref=p.theme;
}
function set(next:UiPrefs){state=next;applyToDocument(next);subs.forEach(f=>f());}

let started=false;
/** Lee las preferencias guardadas (una vez, tras montar), las aplica al documento y sigue los cambios del sistema. */
export function initUi(){
 if(started||typeof window==='undefined')return;
 started=true;
 let raw:string|null=null;try{raw=window.localStorage.getItem(UI_KEY);}catch{raw=null;}
 set(parseUi(raw));
 try{window.matchMedia('(prefers-color-scheme: light)').addEventListener('change',()=>{if(state.theme==='system')applyToDocument(state);});}catch{/* sin matchMedia */}
}
export function setUi(patch:Partial<UiPrefs>){
 const next={...state,...patch};
 try{window.localStorage.setItem(UI_KEY,JSON.stringify(next));}catch{/* sin almacenamiento: vale solo para esta sesión */}
 set(next);
}
export const setLang=(lang:Lang)=>setUi({lang});
export const setTheme=(theme:ThemePref)=>setUi({theme});
/** Solo pruebas. */
export function _resetUi(){state=DEFAULT_UI;started=false;}

/** Script que se inserta en <head> para fijar idioma y tema antes del primer pintado (sin destello). */
export const BOOT_SCRIPT=`(function(){try{var r=localStorage.getItem('${UI_KEY}');var p=r?JSON.parse(r):{};var l=p.lang==='en'?'en':'es';var t=p.theme==='light'||p.theme==='dark'?p.theme:'system';var e=document.documentElement;e.lang=l;e.dataset.themePref=t;e.dataset.theme=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;}catch(x){}})();`;
