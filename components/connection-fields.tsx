'use client';
import {platformNames} from './types';
export default function ConnectionFields({platform,setPlatform,brand}:{platform:string;setPlatform:(s:string)=>void;brand:string}){const oauth=['facebook','instagram','linkedin'].includes(platform);return <>
 <label>Platforma<select value={platform} onChange={e=>setPlatform(e.target.value)}>{Object.entries(platformNames).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label>
 {platform==='wordpress'?<><label>Adres witryny<input name="url" type="url" required placeholder="https://twoja-strona.pl"/></label><label>Nazwa użytkownika WordPress<input name="username" autoComplete="off" required/></label><label>Hasło aplikacji<input name="password" type="password" autoComplete="new-password" required/></label><p className="hint">WordPress → Użytkownicy → Twój profil → Hasła aplikacji. Wymagany HTTPS i REST API.</p></>:<>
 {oauth&&<><a className="button secondary" href={'/api/connect/'+platform+'/start?brand_id='+encodeURIComponent(brand)}>Połącz przez {platformNames[platform]} ↗</a><p className="hint">Facebook i Instagram korzystają z aplikacji Meta zapisanej w Ustawieniach. Każde kolejne logowanie dodaje konta do wybranej marki. Nie usuwa wcześniejszych połączeń.</p></>}
 {platform==='instagram'&&<p className="hint">Wymagane konto profesjonalne Instagram połączone ze stroną Facebook. W Meta dodaj instagram_basic, instagram_content_publish oraz adres callback opisany w instrukcji.</p>}
 {platform==='telegram'&&<p className="hint">W Telegramie otwórz @BotFather, wpisz /newbot i utwórz bota. Dodaj go jako administratora kanału z prawem publikowania. Poniżej wklej token bota i @nazwę kanału lub ID grupy.</p>}
 {platform==='mastodon'&&<><p className="hint">Na swoim serwerze Mastodon: Preferencje → Programowanie → Nowa aplikacja. Nadaj read:accounts, read:statuses i write:statuses, a następnie skopiuj token dostępu.</p><label>Adres serwera<input name="url" type="url" required placeholder="https://mastodon.social"/></label></>}
 {platform!=='mastodon'&&<label>{platform==='telegram'?'@nazwa kanału lub ID grupy':platform==='instagram'?'ID konta Instagram (połączenie ręczne)':platform==='facebook'?'ID strony (połączenie ręczne)':'URN osoby lub organizacji'}<input key={platform} name="external_id" required/></label>}
 <label>{platform==='telegram'?'Token bota':'Token dostępu (połączenie ręczne)'}<input name="access_token" type="password" autoComplete="new-password" required/></label>
 {['facebook','linkedin'].includes(platform)&&<label>Termin wygaśnięcia (opcjonalnie)<input name="expires_at" type="datetime-local"/></label>}
 </>}
 <p className="hint"><a href="https://github.com/picabela/mcplinker/blob/main/docs/PLATFORMS.md" target="_blank" rel="noreferrer">Instrukcje konfiguracji i dodawania kolejnych profili Facebook ↗</a></p>
 </>;}
