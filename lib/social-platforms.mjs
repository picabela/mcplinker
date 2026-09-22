import {AppError,publicUrl} from './security.mjs';
export const extraPlatforms=['instagram','telegram','mastodon'];
export function mastodonAccountId(c){if(/^\d+$/.test(c.external_id||''))return c.external_id;if(!c.external_id)return '';const u=publicUrl(c.external_id);if(u.origin!==publicUrl(c.base_url).origin||!/^\/accounts\/\d+$/.test(u.pathname)||u.search)throw new AppError('Nieprawidłowe konto Mastodon.');return u.pathname.split('/').pop();}
export const socialText=p=>p.content+(p.payload?.link?'\n\n'+p.payload.link:'');
export function validateSocialPost(c,p){
 if(!extraPlatforms.includes(c.platform))return;
 const v=p.payload||{},text=socialText(p),images=v.image_urls||[];
 const fail=message=>{throw new AppError(message,400,'provider_rejected');};
 if(v.video_url||v.media_urn)fail('Ta integracja nie obsługuje jeszcze filmów ani załączników LinkedIn.');
 if(c.platform==='instagram'&&(images.length!==1||text.length>2200))fail('Instagram wymaga jednego obrazu JPEG i opisu do 2200 znaków.');
 if(c.platform==='telegram'&&(images.length>1||text.length>(images.length?1024:4096)))fail('Telegram: jeden obraz i opis do 1024 znaków lub sam tekst do 4096 znaków.');
 if(c.platform==='mastodon'&&(images.length||text.length>500))fail('Mastodon: tekst z linkiem do 500 znaków, bez załączników.');
 for(const url of images)publicUrl(url);
}
export async function socialTest(c,req){
 if(c.platform==='instagram'){const {data}=await req(c,c.external_id,{query:{fields:'id,username'}});if(String(data.id)!==c.external_id||!data.username)throw new AppError('Token nie udostępnia tego konta Instagram.');return{id:String(data.id),name:data.username};}
 if(c.platform==='mastodon'){const{data}=await req(c,'api/v1/accounts/verify_credentials');if(!/^\d+$/.test(String(data.id))||c.external_id&&mastodonAccountId(c)!==String(data.id))throw new AppError('Token nie odpowiada kontu Mastodon.');return{id:String(data.id),name:data.display_name||data.username};}
 const bot=(await req(c,'getMe')).data.result;
 const chat=(await req(c,'getChat',{method:'POST',body:{chat_id:c.external_id}})).data.result;
 if(!['channel','group','supergroup'].includes(chat?.type))throw new AppError('Wybierz kanał lub grupę Telegram.');
 const member=(await req(c,'getChatMember',{method:'POST',body:{chat_id:chat.id,user_id:bot.id}})).data.result;
 if(!['administrator','creator'].includes(member?.status)||chat.type==='channel'&&member.status!=='creator'&&!member.can_post_messages)throw new AppError('Nadaj botowi rolę administratora i prawo publikowania w kanale.');
 return{id:String(chat.id),name:chat.title||c.name};
}
export async function socialPublish(c,p,req,pause=ms=>new Promise(r=>setTimeout(r,ms))){
 validateSocialPost(c,p);const text=socialText(p),v=p.payload||{};
 if(c.platform==='instagram'){
  const created=(await req(c,c.external_id+'/media',{method:'POST',body:{image_url:v.image_urls[0],caption:text}})).data;
  if(!/^\d+$/.test(String(created.id)))throw new AppError('Instagram nie zwrócił ID obrazu.',502,'provider_rejected');
  let ready=false;for(let i=0;i<4;i++){const {data}=await req(c,created.id,{query:{fields:'status_code'}});if(data.status_code==='FINISHED'){ready=true;break;}if(['ERROR','EXPIRED'].includes(data.status_code))break;await pause(1000);}
  if(!ready)throw new AppError('Instagram nie zakończył przetwarzania obrazu. Publikacja nie została wysłana; spróbuj później.',400,'provider_rejected');
  const {data}=await req(c,c.external_id+'/media_publish',{method:'POST',body:{creation_id:created.id}});
  if(!/^\d+$/.test(String(data.id)))throw new AppError('Sprawdź Instagram przed ponowieniem publikacji.',502,'uncertain');
  let link=null;try{link=(await req(c,data.id,{query:{fields:'permalink'}})).data.permalink||null;}catch{}
  return{external_id:String(data.id),external_url:link};
 }
 if(c.platform==='mastodon'){const{data}=await req(c,'api/v1/statuses',{method:'POST',body:{status:text,visibility:'public'},headers:{'Idempotency-Key':'mcplinker-'+p.id}});if(!data.id)throw new AppError('Sprawdź Mastodon przed ponowieniem.',502,'uncertain');return{external_id:String(data.id),external_url:data.url||null};}
 const photo=v.image_urls?.[0];const {data}=await req(c,photo?'sendPhoto':'sendMessage',{method:'POST',body:{chat_id:c.external_id,allow_paid_broadcast:false,...(photo?{photo,caption:text}:{text})}});
 const msg=data.result;if(!Number.isInteger(msg?.message_id))throw new AppError('Sprawdź Telegram przed ponowieniem.',502,'uncertain');
 return{external_id:String(msg.message_id),external_url:msg.chat?.username?`https://t.me/${msg.chat.username}/${msg.message_id}`:null};
}
export async function mastodonOwned(c,id,req){if(!/^\d+$/.test(id))throw new AppError('Nieprawidłowe ID wpisu.');const{data}=await req(c,'api/v1/statuses/'+id);if(String(data.account?.id)!==mastodonAccountId(c))throw new AppError('Wpis nie należy do tego konta.',403);}
export async function socialRead(c,{resource,external_id,limit=25,page=1},req){
 if(page!==1)throw new AppError('Ta integracja obsługuje na razie pierwszą stronę wyników.');
 if(c.platform==='telegram'){if(resource!=='insights')throw new AppError('Telegram Bot API nie udostępnia historii kanału. Wpisy wysłane z MCPLinker znajdziesz w Publikacjach.');return{members:(await req(c,'getChatMemberCount',{method:'POST',body:{chat_id:c.external_id}})).data.result};}
 if(c.platform==='instagram'){if(resource==='comments')throw new AppError('Obsługa komentarzy Instagram nie jest jeszcze dostępna.');return(await req(c,c.external_id+(resource==='posts'?'/media':''),{query:{fields:resource==='posts'?'id,caption,media_type,permalink,timestamp':'id,username,followers_count,media_count',...(resource==='posts'?{limit}:{})}})).data;}
 if(resource==='comments'){await mastodonOwned(c,external_id||'',req);return(await req(c,'api/v1/statuses/'+external_id+'/context')).data.descendants;}
 return(await req(c,'api/v1/accounts/'+mastodonAccountId(c)+(resource==='posts'?'/statuses':''),{query:resource==='posts'?{limit:Math.min(limit,40)}:{}})).data;
}
