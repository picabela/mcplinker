import {AppError,safeFetch,encrypt,decrypt,publicUrl} from './security.mjs';
import {randomUUID} from 'node:crypto';
const aad=c=>`facebook-photo:${c.owner_id}:${c.brand_id}:${c.id}:${c.external_id}`;
export function facebookPhotoIds(c,refs=[]){try{return refs.map(ref=>{const d=decrypt(ref,aad(c));if(!/^\d+$/.test(d.id))throw Error();return d.id;});}catch{throw new AppError('Zdjęcie nie należy do tego połączenia Facebook lub jego referencja jest nieprawidłowa.',400,'provider_rejected');}}
export function validateFacebookMedia(c,p){const v=p.payload||{};if(c.platform!=='facebook'){if(v.facebook_media?.length)throw new AppError('Załączniki Facebook wymagają konta Facebook.',400,'provider_rejected');return;}
 if([Boolean(v.image_urls?.length),Boolean(v.facebook_media?.length),Boolean(v.video_url),Boolean(v.media_urn)].filter(Boolean).length>1||v.media_urn)throw new AppError('Facebook: wybierz zdjęcia URL, przesłane zdjęcia lub film. Nie łącz tych formatów.',400,'provider_rejected');for(const url of [...(v.image_urls||[]),...(v.video_url?[v.video_url]:[]),...(v.link?[v.link]:[])])publicUrl(url);facebookPhotoIds(c,v.facebook_media);}
function imageType(bytes){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return['image/jpeg','jpg'];if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return['image/png','png'];throw new AppError('Wymagany rzeczywisty plik JPEG lub PNG.',400,'provider_rejected');}
export async function uploadFacebookImage(c,{url,data_base64},req){
 if(c.platform!=='facebook')throw new AppError('Wybierz stronę Facebook.');if(Boolean(url)===Boolean(data_base64))throw new AppError('Podaj dokładnie jedno źródło: url albo data_base64.');
 let bytes;if(url){const r=await safeFetch(url);if(!r.ok)throw new AppError('Nie udało się pobrać obrazu.',400,'provider_rejected');bytes=r.bytes;}else{if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data_base64))throw new AppError('Nieprawidłowy base64.');bytes=Buffer.from(data_base64,'base64');if(bytes.length>1024*1024)throw new AppError('Plik base64 może mieć do 1 MB. Dla większego obrazu użyj publicznego URL.');}
 const[mime,ext]=imageType(bytes),boundary='mcplinker-'+randomUUID();
 const binary=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="published"\r\n\r\nfalse\r\n--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="image.${ext}"\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
 const{data}=await req(c,encodeURIComponent(c.external_id)+'/photos',{method:'POST',binary,headers:{'Content-Type':'multipart/form-data; boundary='+boundary}});
 if(!/^\d+$/.test(String(data.id)))throw new AppError('Meta nie potwierdziła zapisu zdjęcia. Post nie został opublikowany.',502,'uncertain');
 const reference=encrypt({id:String(data.id)},aad(c));return{photo_id:String(data.id),facebook_media:[reference],published:false,note:'Zdjęcie zapisano w Meta jako nieopublikowane. Dodaj facebook_media do payload szkicu lub użyj post_id, aby dołączyć je automatycznie.'};
}
export async function publishFacebook(c,p,req){validateFacebookMedia(c,p);const v=p.payload||{},page=encodeURIComponent(c.external_id);let r;
 if(v.video_url){r=await req(c,page+'/videos',{method:'POST',body:{description:p.content,file_url:v.video_url}});}else{
 const ids=facebookPhotoIds(c,v.facebook_media);for(const url of v.image_urls||[]){const uploaded=await uploadFacebookImage(c,{url},req);ids.push(uploaded.photo_id);}
 const message=p.content+(ids.length&&v.link?'\n\n'+v.link:'');
 r=await req(c,page+'/feed',{method:'POST',body:{message,...(ids.length?{attached_media:ids.map(media_fbid=>({media_fbid}))}:v.link?{link:v.link}:{})}});
 }
 const id=r.data.post_id||r.data.id;if(!/^\d+(?:_\d+)?$/.test(String(id)))throw new AppError('Meta nie zwróciła ID publikacji. Sprawdź stronę przed ponowieniem.',502,'uncertain');return{external_id:String(id),external_url:'https://www.facebook.com/'+id};
}
