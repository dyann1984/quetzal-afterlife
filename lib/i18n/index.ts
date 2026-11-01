/**
 * Traducción de la interfaz. El español es el idioma de origen: la clave de cada texto ES el texto en español, así que
 * `t('Nueva recuperación')` devuelve lo mismo en español y la traducción de `en.ts` en inglés. Lo que no tiene traducción
 * se muestra en español (nunca se rompe la interfaz). Los DATOS (nombres de archivo, hashes, identificadores, valores
 * recuperados) nunca pasan por aquí.
 */
import {getUi,type Lang} from './store';
import {EN} from './en';
import {translateMessage} from './msgs';

export {useUi,type Lang,type ThemePref} from './hooks';
export const curLang=():Lang=>getUi().lang;
/** Texto fijo de la interfaz. */
export const t=(es:string):string=>curLang()==='en'?(EN[es]??es):es;
/** Texto con huecos {0}, {1}… (los valores se insertan tal cual, sin traducir). */
export const tr=t;
/** Número con el separador del idioma activo. */
export const nf=(n:number):string=>n.toLocaleString(curLang()==='en'?'en-US':'es-MX');
export const tf=(es:string,...args:Array<string|number>):string=>t(es).replace(/\{(\d+)\}/g,(_,i)=>String(args[Number(i)]??''));
/** Mensajes generados por los motores (advertencias, hallazgos, validaciones): coincidencia exacta o por patrón; si no hay, queda el original. */
export const tm=(msg:string):string=>curLang()==='en'?translateMessage(msg):msg;
