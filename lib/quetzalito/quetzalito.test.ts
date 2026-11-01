import {describe,it,expect,vi} from 'vitest';
import {ENTRIES,SECTIONS,SECTION_IDS,UI,GENERIC_SUGGEST,type Lang} from './kb';
import {answer,answerEntry,nextStep,sectionIntro,suggestionsFor,entryById,normalize,type Ctx} from './engine';
import {resolveAnswer,registerAssistantProvider,aiEnabled} from './ai';
import {parsePrefs,effectiveTheme,DEFAULT_PREFS,getPrefs,setPrefs,_resetPrefsCache} from './prefs';

const ctx=(section:string,o:Partial<Ctx>={}):Ctx=>({section,hasData:false,isDemo:false,fileType:null,hasVerification:false,...o});
const LANGS:Lang[]=['es','en'];

describe('base de conocimiento',()=>{
 it('ids únicos y todo el contenido existe en español e inglés',()=>{
  expect(new Set(ENTRIES.map(e=>e.id)).size).toBe(ENTRIES.length);
  for(const e of ENTRIES)for(const l of LANGS){
   expect(e.q[l].length,`${e.id}.q.${l}`).toBeGreaterThan(8);expect(e.a[l].length,`${e.id}.a.${l}`).toBeGreaterThan(40);expect(e.kw[l].split(' ').length,`${e.id}.kw.${l}`).toBeGreaterThanOrEqual(5);
  }
  for(const e of ENTRIES)expect(e.a.es,e.id).not.toBe(e.a.en);
 });
 it('cubre las 13 secciones con contenido, pasos y sugerencias válidas en ambos idiomas',()=>{
  expect(SECTION_IDS.length).toBe(13);
  for(const s of SECTION_IDS){
   const i=SECTIONS[s];expect(i,s).toBeTruthy();
   for(const l of LANGS){expect(i.title[l].length).toBeGreaterThan(2);expect(i.what[l].length,`${s}.what.${l}`).toBeGreaterThan(30);expect(i.howto[l].length,`${s}.howto.${l}`).toBeGreaterThan(20);}
   expect(i.suggest.length,s).toBeGreaterThanOrEqual(3);for(const id of i.suggest)expect(entryById(id),`${s} → ${id}`).toBeTruthy();
   for(const l of LANGS)expect(suggestionsFor(ctx(s),l).length,`${s}.${l}`).toBeGreaterThanOrEqual(4);
  }
  for(const id of GENERIC_SUGGEST)expect(entryById(id)).toBeTruthy();
 });
 it('los enlaces internos apuntan a entradas y secciones que existen',()=>{
  for(const e of ENTRIES){
   for(const f of e.follow??[])expect(entryById(f),`${e.id} follow ${f}`).toBeTruthy();
   for(const a of e.actions??[]){expect((SECTION_IDS as readonly string[]).includes(a.goto),`${e.id} → ${a.goto}`).toBe(true);expect(a.label.es.length).toBeGreaterThan(3);expect(a.label.en.length).toBeGreaterThan(3);}
   for(const s of e.sections??[])expect((SECTION_IDS as readonly string[]).includes(s),`${e.id} sección ${s}`).toBe(true);
  }
 });
 it('honestidad: no promete recuperación universal ni compatibilidad real, y declara los límites',()=>{
  const all=JSON.stringify(ENTRIES)+JSON.stringify(SECTIONS);
  expect(all).not.toMatch(/recuperaci[oó]n universal garantizada|100 ?% (de )?(recuperaci|recovery)|certificaci[oó]n forense garantizada/i);
  const lim=entryById('limitations')!;
  expect(lim.a.es).toMatch(/no promete recuperaci[oó]n universal/i);expect(lim.a.en).toMatch(/does not promise universal recovery/i);
  expect(lim.a.es).toMatch(/sint[eé]ticos/i);expect(lim.a.en).toMatch(/synthetic/i);
  expect(entryById('software-archaeology')!.a.es).toMatch(/no recupera c[oó]digo fuente/i);
  expect(entryById('language-theme')!.a.es).toMatch(/selector de idioma.*Sistema, Claro, Oscuro/is);   // describe los selectores reales
  expect(entryById('language-theme')!.a.en).toMatch(/language selector.*System, Light, Dark/is);
  expect(UI.role.es).toMatch(/no es IA generativa/i);expect(UI.note.en).toMatch(/not generative AI/i);   // distingue lo guiado de la IA generativa
  expect(entryById('privacy')!.a.es).toMatch(/no se env[ií]a nada/i);
 });
});

describe('respuestas locales (sin IA)',()=>{
 const CASES:Array<[string,Lang,string,string]>=[
  ['¿Cómo cargo un archivo?','es','Dashboard','upload-file'],
  ['how do I upload a file','en','Dashboard','upload-file'],
  ['¿Cuál es la diferencia entre recuperación y reconstrucción?','es','Dashboard','recovery-vs-reconstruction'],
  ['difference between recovery and reconstruction','en','Recovery','recovery-vs-reconstruction'],
  ['¿Cómo guardo mi proyecto?','es','Archivo','save-project'],
  ['how do I save my project','en','Archivo','save-project'],
  ['¿Cómo exporto a CSV?','es','Laboratorio','export'],
  ['how can I export results as json','en','Verificación','export'],
  ['¿Qué significa sintético?','es','Laboratorio','synthetic'],
  ['what does synthetic mean','en','Dashboard','synthetic'],
  ['¿Cómo uso el holograma?','es','Dashboard','hologram'],
  ['how do I rotate the hologram','en','Dashboard','hologram'],
  ['¿Cómo cambio el idioma?','es','Dashboard','language-theme'],
  ['how do I switch to dark mode','en','Archivo','language-theme'],
  ['¿Mis datos salen de mi navegador?','es','Archivo','privacy'],
  ['is my data sent to a server','en','Nueva recuperación','privacy'],
  ['¿Cómo verifico un resultado contra una referencia?','es','Verificación','verification-how'],
  ['¿Qué hace Discovery?','es','Discovery','discovery-what'],
  ['what does the AI analyst do','en','AI Analyst','analyst-what'],
  ['¿Qué es Evidence Vault?','es','Evidence Vault','vault-what'],
  ['¿Qué es el carving?','es','File Recovery','carving'],
  ['which formats are supported','en','File Recovery','formats'],
  ['¿Cuál es el límite de tamaño?','es','Nueva recuperación','file-limits'],
  ['¿Qué significa registros borrados y desconocidos?','es','Laboratorio','deleted-records'],
  ['¿Qué es Software Archaeology?','es','File Recovery','software-archaeology'],
  ['me sale un error al cargar','es','Nueva recuperación','troubleshooting'],
  ['¿puedo usar el teclado?','es','Dashboard','keyboard-a11y'],
  ['are you an AI?','en','Dashboard','about-quetzalito'],
  ['ruta para jueces','es','Dashboard','judges-route'],
  ['¿cuáles son las etapas de la experiencia?','es','Dashboard','hologram-stages'],
 ];
 it.each(CASES)('«%s» (%s, en %s) → %s',(q,lang,section,id)=>{
  const a=answer(q,ctx(section),lang);
  expect(a.kind,q).toBe('kb');expect(a.entryId,q).toBe(id);expect(a.text).toBe(entryById(id)!.a[lang]);
 });
 it('responde en el idioma activo aunque la pregunta esté en el otro',()=>{
  const es=answer('how do I upload a file',ctx('Dashboard'),'es'),en=answer('how do I upload a file',ctx('Dashboard'),'en');
  expect(es.entryId).toBe(en.entryId);expect(es.text).not.toBe(en.text);expect(es.text).toMatch(/Nueva recuperación/);expect(en.text).toMatch(/New recovery/);
 });
 it('adapta las sugerencias a la sección actual',()=>{
  const ids=(s:string)=>suggestionsFor(ctx(s),'es').map(x=>x.id);
  expect(ids('Archivo')).toContain('save-project');expect(ids('File Recovery')).toContain('carving');expect(ids('Verificación')).toContain('verification-how');
  expect(ids('Archivo')).not.toContain('carving');
  expect(suggestionsFor(ctx('Sección rara'),'en').length).toBeGreaterThan(3);   // sección desconocida → Dashboard
 });
 it('«qué hago ahora» depende de la sección y del estado de la sesión',()=>{
  const sin=nextStep(ctx('Dashboard'),'es'),con=nextStep(ctx('Dashboard',{hasData:true,isDemo:true,fileType:'csv'}),'es');
  expect(sin.text).toMatch(/DEMO/);expect(con.text).toMatch(/Ya hay datos cargados \(CSV\) · SINTÉTICOS/);expect(con.text).not.toBe(sin.text);
  expect(nextStep(ctx('Verificación',{hasData:true}),'en').text).toMatch(/upload an independent reference/i);
  expect(nextStep(ctx('Verificación',{hasData:true,hasVerification:true}),'en').text).toMatch(/Export CSV\/JSON/);
  expect(nextStep(ctx('Discovery'),'es').actions.map(a=>a.goto)).toEqual(['Recovery']);
  expect(nextStep(ctx('Evidence Vault'),'es').actions).toEqual([]);
  for(const s of SECTION_IDS)for(const l of LANGS){const n=nextStep(ctx(s),l);expect(n.text.length,`${s}.${l}`).toBeGreaterThan(20);for(const a of n.actions)expect((SECTION_IDS as readonly string[]).includes(a.goto)).toBe(true);}
  expect(answer('¿qué hago ahora?',ctx('Archivo'),'es').kind).toBe('next');expect(answer('what now?',ctx('Archivo'),'en').kind).toBe('next');
 });
 it('saludo, gracias, ayuda contextual y vacío',()=>{
  expect(answer('hola',ctx('Laboratorio'),'es').kind).toBe('greeting');expect(answer('hello',ctx('Laboratorio'),'en').text).toMatch(/Lab/);
  expect(answer('gracias',ctx('Laboratorio'),'es').kind).toBe('thanks');
  expect(answer('ayuda',ctx('Archivo'),'es').kind).toBe('section');expect(answer('',ctx('Archivo'),'es').text).toMatch(/Archivo/);
  expect(sectionIntro(ctx('File Recovery'),'en').text).toMatch(/File Recovery/);
 });
 it('sin coincidencia ofrece alternativas en vez de inventar una respuesta',()=>{
  const a=answer('xyzzy plugh qwerty',ctx('Archivo'),'es');
  expect(a.kind).toBe('fallback');expect(a.text).toBe(UI.fallback.es);expect(a.follow.length).toBeGreaterThanOrEqual(3);
  expect(answerEntry('no-existe',ctx('Archivo'),'en').kind).toBe('fallback');
 });
 it('normaliza acentos y mayúsculas',()=>{expect(normalize('¿Cómo EXPORTÓ?')).toBe('como exporto');expect(answer('COMO CARGO UN ARCHIVO',ctx('Dashboard'),'es').entryId).toBe('upload-file');});
});

describe('integración opcional con IA (desactivada por defecto)',()=>{
 it('sin proveedor solo usa la base local',async()=>{
  registerAssistantProvider(null);expect(aiEnabled()).toBe(false);
  const a=await resolveAnswer('xyzzy plugh',ctx('Archivo'),'es');expect(a.kind).toBe('fallback');
 });
 it('un proveedor desactivado, que falla o que no se necesita nunca sustituye a la respuesta local',async()=>{
  const ask=vi.fn(async()=>'respuesta externa');
  registerAssistantProvider({id:'t',enabled:()=>false,ask});
  expect((await resolveAnswer('xyzzy plugh',ctx('Archivo'),'es')).kind).toBe('fallback');expect(ask).not.toHaveBeenCalled();
  registerAssistantProvider({id:'t',enabled:()=>true,ask});
  expect((await resolveAnswer('¿Cómo guardo mi proyecto?',ctx('Archivo'),'es')).kind).toBe('kb');expect(ask).not.toHaveBeenCalled();   // lo local basta: no se envía nada
  registerAssistantProvider({id:'bad',enabled:()=>true,ask:async()=>{throw new Error('red');}});
  expect((await resolveAnswer('xyzzy plugh',ctx('Archivo'),'es')).kind).toBe('fallback');
  registerAssistantProvider(null);
 });
 it('con un proveedor habilitado solo recibe pregunta y metadatos mínimos cuando la base local no sabe',async()=>{
  const ask=vi.fn(async()=>'texto de IA');
  registerAssistantProvider({id:'t',enabled:()=>true,ask});
  const a=await resolveAnswer('xyzzy plugh',ctx('Laboratorio',{hasData:true,isDemo:true,fileType:'dbf'}),'en');
  expect(a.kind).toBe('ai');expect(a.text).toBe('texto de IA');
  expect(ask).toHaveBeenCalledWith('xyzzy plugh',{section:'Laboratorio',hasData:true,isDemo:true},'en',undefined);
  registerAssistantProvider(null);
 });
});

describe('preferencias',()=>{
 it('parsea con tolerancia y valida cada campo',()=>{
  expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);expect(parsePrefs('no es json')).toEqual(DEFAULT_PREFS);
  expect(parsePrefs(JSON.stringify({open:true,min:true,lang:'en',theme:'light'}))).toEqual({open:true,min:true});   // idioma y tema ya no son suyos
  expect(parsePrefs(JSON.stringify({open:'sí',min:1}))).toEqual(DEFAULT_PREFS);
 });
 it('el tema sale del documento (ya resuelto por la plataforma); sin dato, oscuro',()=>{
  expect(effectiveTheme('es|')).toBe('dark');expect(effectiveTheme('es|light')).toBe('light');expect(effectiveTheme('en|dark')).toBe('dark');
 });
 it('sin localStorage (entorno sin navegador o bloqueado) no lanza y conserva el valor en memoria',()=>{
  _resetPrefsCache();expect(getPrefs()).toEqual(DEFAULT_PREFS);
  expect(()=>setPrefs({open:true,min:true})).not.toThrow();expect(getPrefs().open).toBe(true);expect(getPrefs().min).toBe(true);
  _resetPrefsCache();
 });
});
