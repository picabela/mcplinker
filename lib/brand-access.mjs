import {z} from 'zod';
import {AppError} from './security.mjs';
import {owned} from './db.mjs';

export const brandAccessShape={
 all_brands:z.boolean().default(false),
 brand_ids:z.array(z.string().uuid()).max(1000).default([])
};

// Called only from an authenticated owner's panel or OAuth consent screen.
export async function brandAccess(input,ctx){
 const selection=z.object(brandAccessShape).parse(input);
 if(selection.all_brands)return {all_brands:true,brand_ids:[]};
 const ids=[...new Set(selection.brand_ids)];
 if(!ids.length)throw new AppError('Wybierz przynajmniej jedną markę lub wszystkie obecne i przyszłe marki.');
 for(const id of ids)await owned('brands',id,ctx);
 return {all_brands:false,brand_ids:ids};
}
