/**
 * Integración OPCIONAL con una IA externa, desacoplada y DESACTIVADA por defecto.
 * Hoy no hay ningún proveedor registrado, así que `resolveAnswer` solo usa la base de conocimiento local (sin red, sin costo).
 *
 * Para activar una IA en el futuro (ver docs/quetzalito.md):
 *  1. implementar `AssistantProvider` (idealmente llamando a un endpoint propio del servidor, nunca con la clave en el navegador);
 *  2. registrarlo con `registerAssistantProvider` detrás de un interruptor explícito y con el consentimiento del usuario;
 *  3. enviar solo la pregunta y el contexto mínimo (sección y estado), nunca el contenido de los archivos.
 * La IA se consulta únicamente cuando la base local no sabe responder (`kind==='fallback'`).
 */
import {answer,type Answer,type Ctx} from './engine';
import type {Lang} from './kb';

export interface AssistantProvider{
 id:string;
 /** Debe devolver false mientras no haya configuración y consentimiento explícito del usuario. */
 enabled():boolean;
 /** Texto de respuesta, o null para que se use la respuesta local. */
 ask(query:string,ctx:Pick<Ctx,'section'|'hasData'|'isDemo'>,lang:Lang,signal?:AbortSignal):Promise<string|null>;
}

let provider:AssistantProvider|null=null;
export const registerAssistantProvider=(p:AssistantProvider|null)=>{provider=p;};
export const aiEnabled=()=>!!provider&&provider.enabled();

export async function resolveAnswer(query:string,ctx:Ctx,lang:Lang,signal?:AbortSignal):Promise<Answer>{
 const local=answer(query,ctx,lang);
 if(local.kind!=='fallback'||!provider||!provider.enabled())return local;
 try{
  const text=await provider.ask(query,{section:ctx.section,hasData:ctx.hasData,isDemo:ctx.isDemo},lang,signal);   // metadatos mínimos, nunca contenido de archivos
  return text?{...local,text,kind:'ai'}:local;
 }catch{return local;}
}
