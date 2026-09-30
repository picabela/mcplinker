'use client';

export const scopeLabels:Record<string,string>={read:'Odczyt danych',draft:'Szkice i media',publish:'Publikowanie i planowanie',engage:'Publiczne komentarze',manage:'Automatyzacje',admin:'WordPress, wtyczki i SEO oraz usuwanie wpisów'};
const allScopes=Object.keys(scopeLabels);
type Props={selected:string[];onChange:(value:string[])=>void;disabled?:boolean};

export default function ScopeFields({selected,onChange,disabled=false}:Props){
 return <fieldset disabled={disabled}>
  <legend>Uprawnienia</legend>
  <label className="check"><input type="checkbox" checked={allScopes.every(s=>selected.includes(s))} onChange={e=>onChange(e.target.checked?allScopes:[])}/><span>Pełny dostęp: wszystkie uprawnienia</span></label>
  {allScopes.map(s=><label className="check" key={s}><input type="checkbox" checked={selected.includes(s)} onChange={e=>onChange(allScopes.filter(x=>x===s?e.target.checked:selected.includes(x)))}/>{scopeLabels[s]}<small>{s}</small></label>)}
  {!selected.length&&<p className="hint">Wybierz przynajmniej jedno uprawnienie.</p>}
  {selected.includes('admin')&&<div className="callout">Zakres admin pozwala na natychmiastowe zmiany w WordPress i usuwanie wpisów poza kolejką akceptacji.</div>}
 </fieldset>;
}
