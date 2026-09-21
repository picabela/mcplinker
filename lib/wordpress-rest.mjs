import {AppError,publicUrl} from './security.mjs';

// The admin scope may use any installed REST namespace. Credentials must stay
// inside this connection's wp-json directory, including subdirectory installs.
export function wpPath(value){
 if(typeof value!=='string'||value.length>2048||/^[\/]{2}/.test(value))throw new AppError('Podaj względną ścieżkę WordPress REST API.');
 let path=value.replace(/^\//,'').replace(/\/$/,'');
 if(path==='wp-json')path='';
 else if(path.startsWith('wp-json/'))path=path.slice(8);
 if(!path)return '';
 if(!/^[a-zA-Z0-9_.~-]+(?:\/[a-zA-Z0-9_.~-]*)*$/.test(path)||path.split('/').some(p=>p==='.'||p==='..'))throw new AppError('Nieprawidłowa ścieżka WordPress REST API. Parametry przekaż w query.');
 // WordPress template IDs contain a literal theme//template separator.
 if(path.includes('//')&&!/^wp\/v2\/(templates|template-parts)\/[a-zA-Z0-9_.~-]+\/\/[a-zA-Z0-9_.~-]+(?:\/[a-zA-Z0-9_.~-]+)*$/.test(path))throw new AppError('Nieprawidłowa ścieżka WordPress REST API.');
 if(path.split('/').length<2)throw new AppError('Podaj namespace i zasób, np. rankmath/v1/updateMeta, albo / dla indeksu API.');
 return path;
}

export function wpBase(raw){
 const u=publicUrl(raw);
 const allow=(process.env.WORDPRESS_ALLOWED_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(allow.length&&!allow.includes(u.hostname))throw new AppError('Domena nie jest dozwolona w konfiguracji.');
 if(u.search)throw new AppError('Adres witryny WordPress nie może zawierać parametrów.');
 return u.href.replace(/\/+$/,'')+'/wp-json/';
}

export function wordpressRequestUrl(raw,path,query={}){
 const base=new URL(wpBase(raw)),url=new URL(wpPath(path),base);
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new AppError('Niedozwolony adres WordPress REST API.');
 for(const[k,v]of Object.entries(query)){
  // Route/method overrides defeat the explicit path and method of the tool.
  if(/^(rest_route|_method)(\[|$)/i.test(k))throw new AppError('Przekaż ścieżkę w path, a metodę w method.');
  if(v!==undefined)url.searchParams.set(k,String(v));
 }
 return url;
}

export function wordpressError(status,data={}){
 const code=typeof data?.code==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(data.code)?data.code:'';
 const fields=Object.keys(data?.data?.params||{}).filter(k=>/^[a-zA-Z0-9_.-]{1,80}$/.test(k)).slice(0,12);
 const hint=status===401||status===403?'Sprawdź uprawnienia użytkownika WordPress, hasło aplikacji i uprawnienia wtyczki.':status===404?'Sprawdź ścieżkę, identyfikator zasobu i czy wtyczka jest aktywna. Użyj wordpress_discover.':'Sprawdź parametry endpointu przez wordpress_discover lub metodę OPTIONS.';
 return new AppError(`WordPress odrzucił żądanie (HTTP ${status}${code?', '+code:''}). ${fields.length?'Pola: '+fields.join(', ')+'. ':''}${hint}`,status>=500?502:400,status>=500?'uncertain':'provider_rejected');
}

export function wordpressDiscovery(index,{namespace,search='',include_schema=false,limit=50,offset=0}={}){
 const needle=search.toLowerCase();
 const entries=Object.entries(index.routes||{}).filter(([path,route])=>(!namespace||route.namespace===namespace)&&(!needle||path.toLowerCase().includes(needle)));
 return {namespaces:index.namespaces||[],total:entries.length,offset,next_offset:offset+limit<entries.length?offset+limit:null,routes:entries.slice(offset,offset+limit).map(([path,route])=>({path,namespace:route.namespace,methods:route.methods||[],...(include_schema?{endpoints:route.endpoints||[]}: {})}))};
}

export function rankMathPayload({object_id,object_type='post',focus_keyword,seo_title,meta_description}){
 const meta={};
 // Omitted fields stay untouched. An explicit empty string clears that field.
 if(focus_keyword!==undefined)meta.rank_math_focus_keyword=focus_keyword;
 if(seo_title!==undefined)meta.rank_math_title=seo_title;
 if(meta_description!==undefined)meta.rank_math_description=meta_description;
 if(!Object.keys(meta).length)throw new AppError('Podaj przynajmniej jedno pole Rank Math do zmiany.');
 return {objectID:object_id,objectType:object_type,meta};
}
