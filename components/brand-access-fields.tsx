'use client';

type Brand={id:string;name:string};
type Props={brands:Brand[];allBrands:boolean;selected:string[];onAllChange:(value:boolean)=>void;onSelectedChange:(value:string[])=>void;disabled?:boolean};

export default function BrandAccessFields({brands,allBrands,selected,onAllChange,onSelectedChange,disabled=false}:Props){
 return <fieldset disabled={disabled}>
  <legend>Udostępnij marki</legend>
  <label className="check"><input type="checkbox" checked={allBrands} onChange={e=>onAllChange(e.target.checked)}/><span>Wszystkie obecne i przyszłe marki</span></label>
  <p className="hint">Po włączeniu nowe marki i ich konta będą dostępne automatycznie, bez ponownego łączenia ChatGPT. Dotyczy tylko Twoich marek.</p>
  {allBrands?<p className="hint">Dostęp obejmuje wszystkie Twoje marki ({brands.length}) oraz marki dodane później.</p>:<>
   {brands.map(b=><label className="check" key={b.id}><input type="checkbox" checked={selected.includes(b.id)} onChange={e=>onSelectedChange(e.target.checked?[...selected,b.id]:selected.filter(id=>id!==b.id))}/>{b.name}</label>)}
   {!brands.length&&<p className="hint">Dodaj markę w panelu albo wybierz dostęp do wszystkich obecnych i przyszłych marek.</p>}
  </>}
 </fieldset>;
}
