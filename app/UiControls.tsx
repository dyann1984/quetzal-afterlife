'use client';
/** Selector de idioma (ES/EN) y de tema (Sistema/Claro/Oscuro) de toda la plataforma. Se recuerda en este navegador. */
import {useUi,tr} from '../lib/i18n';
import {setLang,setTheme,type ThemePref} from '../lib/i18n/store';

export default function UiControls(){
 const ui=useUi();
 return <div className="ui-controls">
  <div className="ui-seg" role="group" aria-label={tr('Idioma')}>
   {(['es','en'] as const).map(l=><button key={l} type="button" aria-pressed={ui.lang===l} aria-label={l==='es'?'Español':'English'} lang={l} onClick={()=>setLang(l)}>{l.toUpperCase()}</button>)}
  </div>
  <label className="ui-theme"><span className="sr-only">{tr('Tema')}</span>
   <select value={ui.theme} onChange={e=>setTheme(e.target.value as ThemePref)} aria-label={tr('Tema')}>
    <option value="system">{tr('Sistema')}</option><option value="light">{tr('Claro')}</option><option value="dark">{tr('Oscuro')}</option>
   </select>
  </label>
 </div>;
}
