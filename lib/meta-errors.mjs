import {AppError} from './security.mjs';
// Interpret known Meta errors without exposing submitted content or credentials.
export function metaError(status,data){
 const e=data?.error||{},code=Number.isSafeInteger(e.code)?e.code:null,sub=Number.isSafeInteger(e.error_subcode)?e.error_subcode:null;
 let advice='Meta odrzuciła żądanie. Sprawdź Required actions i Alert Inbox w panelu aplikacji Meta.';
 if(code===190||code===102){advice='Token Facebooka wygasł lub został unieważniony. Połącz konto ponownie w MCPLinker. Jeżeli Facebook blokuje logowanie, najpierw sprawdź Required actions, Alert Inbox i role aplikacji w Meta.';
 if(sub===460)advice='Meta unieważniła token po zmianie hasła. Zaloguj Facebook i połącz konto ponownie w MCPLinker.';
 if(sub===463)advice='Token Facebooka wygasł. Połącz konto ponownie w MCPLinker.';
 if(sub===459)advice='Meta wymaga sprawdzenia konta. Zaloguj się bezpośrednio na Facebooku, wykonaj wymagane kroki i dopiero potem połącz MCPLinker ponownie.';
 if(sub===458)advice='Użytkownik nie autoryzuje już tej aplikacji. Nadaj dostęp ponownie przez Połącz konto w MCPLinker.';
 }
 else if(code===10||code===200)advice='Brak wymaganych uprawnień Meta. Sprawdź dostęp profilu do strony, zgody w konfiguracji Facebook Login for Business oraz role lub zatwierdzenie aplikacji.';
 else if(code===100)advice='Meta nie udostępnia wskazanego obiektu lub odrzuciła parametry. Sprawdź ID strony, dostęp profilu i konfigurację aplikacji.';
 else if([4,17,32,613].includes(code))advice='Meta ograniczyła liczbę żądań. Poczekaj przed ponowieniem.';
 else if(code===368)advice='Meta tymczasowo zablokowała operację. Sprawdź ograniczenia konta i Alert Inbox w Meta Developers.';
 else if(code===341)advice='Meta osiągnęła limit operacji aplikacji. Poczekaj przed ponowieniem.';
 // The message is inspected only to classify explicit application disablement.
 if(typeof e.message==='string'&&/application (has been|is) disabled|app (has been|is) disabled/i.test(e.message))advice='Meta wyłączyła aplikację. Otwórz Meta Developers → MCPLinker → Required actions oraz Alert Inbox i wykonaj wskazane tam działania. Ponowne wpisanie tokenu nie usunie tej blokady.';
 const transient=status>=500||e.is_transient===true;
 return new AppError(`${advice} [Meta HTTP ${status}${code!==null?'; kod '+code:''}${sub!==null?'; podkod '+sub:''}]`,transient?502:400,transient?'uncertain':'provider_rejected');
}
