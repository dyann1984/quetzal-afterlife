import {describe,it,expect,beforeEach} from 'vitest';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {EN} from './en';
import {translateMessage} from './msgs';
import {parseUi,resolveTheme,DEFAULT_UI,getUi,setUi,_resetUi,BOOT_SCRIPT,UI_KEY} from './store';
import {t,tf,tm,nf} from './index';
import {buildScenario,SCENARIO_LABEL,SCENARIO_DAMAGE} from '../scenario';
import {ingest} from '../ingest';
import {diagnose} from '../discovery';
import {recoverTable} from '../recovery';
import {inferSchema} from '../schema';
import {reconstruct,DEFAULT_OPTIONS} from '../reconstruct';
import {localAnalyst,runAnalyst} from '../analyst';
import {buildAppModel} from '../studio';
import {buildDossier} from '../vault';
import {analyzeFile,carveImage} from '../filerec';
import {buildFixtures,FIXTURE_DAMAGE} from '../filerec/fixtures';
import {CAPACIDADES,ESTADO_LABEL,AREA_LABEL} from '../capabilities';
import {buildSceneModel} from '../experience';

// ── detector heurístico de español ─────────────────────────────────────────────
const ES_WORDS=/\b(el|la|los|las|del|con|sin|para|por|que|se|una|es|en|y|archivo|archivos|registro|registros|datos|campo|campos|tabla|valor|valores|fila|filas|no|hay|está|están|desde|solo|ni|pero|como|más|menos|uno|dos|todos|cada|tras|hasta|entre|sobre)\b/i;
const looksSpanish=(s:string)=>/[áéíóúñ¿¡]/i.test(s)||ES_WORDS.test(s);

const walk=(d:string,out:string[]=[])=>{for(const e of readdirSync(d)){const p=join(d,e);if(statSync(p).isDirectory()){if(!/node_modules|\.next|quetzalito/.test(p))walk(p,out);}else if(/\.tsx?$/.test(e)&&!/\.test\./.test(e))out.push(p);}return out;};
const sourceKeys=()=>{const keys=new Set<string>();for(const f of walk('app')){const src=readFileSync(f,'utf8');for(const m of src.matchAll(/\b(?:tr|tf)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g))keys.add((m[1]??m[2]).replace(/\\'/g,"'").replace(/\\n/g,'\n').replace(/\\\\/g,'\\'));}return [...keys];};

describe('textos de la interfaz',()=>{
 it('toda clave usada en los componentes tiene traducción al inglés (o no es español)',()=>{
  const missing=sourceKeys().filter(k=>!(k in EN)&&looksSpanish(k));
  expect(missing,`sin traducir:\n${missing.join('\n')}`).toEqual([]);
 });
 it('las traducciones conservan los huecos {n} y no están vacías (salvo fragmentos deliberadamente vacíos)',()=>{
  const holes=(s:string)=>[...s.matchAll(/\{(\d+)\}/g)].map(m=>m[1]).sort().join(',');
  for(const [k,v] of Object.entries(EN)){expect(holes(v),`huecos de «${k}»`).toBe(holes(k));}
  const empties=Object.entries(EN).filter(([,v])=>v==='').map(([k])=>k);expect(empties).toEqual([]);
 });
 it('un texto que cambia de significado al traducirse no puede quedar igual al español',()=>{
  const same=Object.entries(EN).filter(([k,v])=>k===v&&looksSpanish(k)&&!/^(Discovery|Recovery|Reconstruction|Verification|Studio|Vault|ID|SHA-256|Offset|Dashboard|decimal|ms|bytes|Bytes|no)$/.test(k)).map(([k])=>k);
  expect(same,same.join('\n')).toEqual([]);
 });
});

describe('idioma y tema globales',()=>{
 beforeEach(()=>_resetUi());
 it('t/tf/tm/nf siguen el idioma activo; en español devuelven el original',()=>{
  expect(t('Nueva recuperación')).toBe('Nueva recuperación');expect(tm('No hay datos para guardar.')).toBe('No hay datos para guardar.');expect(nf(1234567)).toMatch(/1[.,\s]?234[.,\s]?567/);
  setUi({lang:'en'});expect(t('Nueva recuperación')).toBe('New recovery');expect(tf('Aprobar: {0}','R1')).toBe('Approve: R1');expect(tm('No hay datos para guardar.')).toBe('There is no data to save.');expect(nf(1234567)).toBe('1,234,567');
  expect(t('texto que no existe en el diccionario')).toBe('texto que no existe en el diccionario');   // sin traducción: queda el original, nunca se rompe
 });
 it('preferencias: tolerantes, validadas y con tema Sistema por defecto',()=>{
  expect(parseUi(null)).toEqual(DEFAULT_UI);expect(parseUi('no json')).toEqual(DEFAULT_UI);expect(parseUi('{"lang":"fr","theme":"neón"}')).toEqual(DEFAULT_UI);
  expect(parseUi('{"lang":"en","theme":"light"}')).toEqual({lang:'en',theme:'light'});
  expect(resolveTheme('system',true)).toBe('light');expect(resolveTheme('system',false)).toBe('dark');expect(resolveTheme('dark',true)).toBe('dark');expect(resolveTheme('light',false)).toBe('light');
  expect(()=>setUi({theme:'light'})).not.toThrow();expect(getUi().theme).toBe('light');   // sin localStorage no lanza
 });
 it('el script de arranque aplica idioma y tema antes del primer pintado, con las mismas claves',()=>{
  expect(BOOT_SCRIPT).toContain(UI_KEY);expect(BOOT_SCRIPT).toMatch(/documentElement/);expect(BOOT_SCRIPT).toMatch(/dataset\.theme/);expect(BOOT_SCRIPT).toMatch(/prefers-color-scheme: light/);
 });
});

// ── cobertura de los mensajes que generan los motores sobre los escenarios sintéticos ──────────────────
const KEYS=new Set(['name','preview','message','reason','note','notes','basis','detail','description','evidence','explanation','title','limitations','signals','encodingBasis','issues','warnings','soporta','limitaciones','riesgos','dependencias','formato','narrative','unrecoverable','status','supportLevel','kind','op','step','subject']);
function collect(o:unknown,out:string[],key=''){
 if(typeof o==='string'){if(KEYS.has(key)&&o.trim())out.push(o);return;}
 if(Array.isArray(o)){for(const x of o)collect(x,out,key);return;}
 if(o&&typeof o==='object'){for(const [k,v] of Object.entries(o as Record<string,unknown>)){if(k==='bytes'||k==='values'||k==='rows'||k==='preview')continue;collect(v,out,KEYS.has(k)?k:key==='unrecoverable'?'reason':'');}}
}
async function engineMessages():Promise<string[]>{
 const out:string[]=[SCENARIO_LABEL,...SCENARIO_DAMAGE,...FIXTURE_DAMAGE];
 const items=[];for(const f of buildScenario())items.push(await ingest(f.bytes,f.name,'2026-01-01T00:00:00.000Z'));
 const diagnoses=Object.fromEntries(items.map(i=>[i.evidence.id,diagnose(i.evidence,i.bytes)]));
 const tables=items.flatMap(i=>{const x=recoverTable(i.evidence,i.bytes);return x?[x]:[];});
 const schema=inferSchema(tables);
 const model=reconstruct(tables,schema,{...DEFAULT_OPTIONS,approved:{relations:schema.relations.map(r=>r.id),merges:[]},version:1,parentVersion:null});
 const r=await runAnalyst(localAnalyst,{tables,schema},{granted:false,scope:'metadatos'});
 const app=buildAppModel(model);
 const dossier=await buildDossier({title:'t',synthetic:true,generatedAt:'2026-01-01T00:00:00.000Z',evidences:items.map(i=>i.evidence),diagnoses,tables,schema,model,steps:[],approvals:{relations:[],merges:[]},previousVersions:[]});
 const scene=buildSceneModel({evidences:items.map(i=>i.evidence),diagnoses,tables,schema,model,synthetic:true});
 for(const d of Object.values(diagnoses))for(const [k,v] of Object.entries(d.metadata)){out.push(k);if(typeof v==='string')out.push(v);}
 for(const o of [diagnoses,tables.map(x=>({unrecoverable:x.report.unrecoverable,rows:undefined,issues:x.rows.flatMap(y=>y.issues)})),schema,model.integrity,model.rules,model.excluded,r.valid,app.notice,app.crudRules,dossier.uncertainty,scene.narrative])collect(o,out);
 for(const f of buildFixtures()){
  if(f.expectation==='carving'){const c=await carveImage(f.bytes,f.name);collect({notes:c.notes},out);}
  else{const rep=await analyzeFile(f.bytes,f.name);collect({findings:rep.findings,damaged:rep.damaged,items:rep.items,limitations:rep.limitations,signals:rep.signals,repaired:rep.repaired?{note:rep.repaired.note}:undefined},out);}
 }
 collect(CAPACIDADES,out);out.push(...Object.values(ESTADO_LABEL),...Object.values(AREA_LABEL));
 return [...new Set(out)];
}
describe('mensajes de los motores (escenarios sintéticos y archivos de prueba)',()=>{
 it('no queda español sin traducir al mostrarlos en inglés',async()=>{
  const msgs=await engineMessages();
  const untranslated=msgs.filter(m=>{const e=translateMessage(m);return e===m&&looksSpanish(m);});
  expect(msgs.length).toBeGreaterThan(150);
  expect(untranslated,`${untranslated.length} sin traducir de ${msgs.length}:\n`+untranslated.slice(0,60).join('\n')).toEqual([]);
 },60000);
 it('conserva los datos: nombres, cifras e identificadores no cambian al traducir',()=>{
  const m=translateMessage('Los valores C-099 no existen en CLIENTES, tabla que perdió registros por daño; es coherente con registros perdidos, pero no es una prueba.');
  expect(m).toContain('C-099');expect(m).toContain('CLIENTES');
  expect(translateMessage('✓ Proyecto "Demo Kiroween 2026" guardado.')).toBe('✓ Project "Demo Kiroween 2026" saved.');
  expect(translateMessage('2 valor(es) de DETALLE.folio sin padre en VENTAS: V-0014, V-0015 (podría deberse a registros perdidos por daño en VENTAS).')).toBe('2 value(s) of DETALLE.folio without a parent in VENTAS: V-0014, V-0015 (could be due to records lost to damage in VENTAS).');
  expect(translateMessage('VENTAS.DBF: texto que no está en el diccionario')).toBe('VENTAS.DBF: texto que no está en el diccionario');
  expect(translateMessage('El archivo (5242881 B) supera el límite de 4194304 B: no se analiza.')).toBe('The file (5242881 B) exceeds the limit of 4194304 B: it is not analysed.');
 });
});
