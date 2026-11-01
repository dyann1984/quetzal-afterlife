/**
 * Preferencias propias de Quetzalito (abierto/cerrado y minimizado) en localStorage, como almacén externo para
 * useSyncExternalStore. El idioma y el tema ya NO son suyos: son los de toda la plataforma (lib/i18n/store.ts) y
 * Quetzalito los lee del documento (<html lang> y data-theme). Todo acceso al almacenamiento va en try/catch.
 */
export interface Prefs{open:boolean;min:boolean}
export const PREFS_KEY='quetzalito:v1';
export const DEFAULT_PREFS:Prefs={open:false,min:false};

export function parsePrefs(raw:string|null):Prefs{
 if(!raw)return DEFAULT_PREFS;
 try{const j=JSON.parse(raw) as Partial<Prefs>;return {open:j.open===true,min:j.min===true};}
 catch{return DEFAULT_PREFS;}
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

// ── Señales de la página: idioma (<html lang>) y tema resuelto (<html data-theme>) ───────────────────
export const docSignal=():string=>typeof document==='undefined'?'es|':`${document.documentElement.lang||'es'}|${document.documentElement.dataset.theme??''}`;
export const subscribeDoc=(f:()=>void)=>{
 if(typeof MutationObserver==='undefined'||typeof document==='undefined')return()=>{};
 const o=new MutationObserver(f);o.observe(document.documentElement,{attributes:true,attributeFilter:['lang','data-theme']});
 return()=>o.disconnect();
};
export const serverDocSignal=()=>'es|';
/** El tema ya viene resuelto por la plataforma (claro u oscuro); sin dato se asume oscuro (la apariencia original). */
export function effectiveTheme(signal:string):'light'|'dark'{return signal.split('|')[1]==='light'?'light':'dark';}
