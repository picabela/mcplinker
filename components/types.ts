export type Row=Record<string,any>;
export type Data={brand_list:Row[];connection_list:Row[];post_list:Row[];automation_list:Row[];asset_list:Row[];agent_list:Row[];grant_list:Row[];audit_list:Row[]};
export const empty:Data={brand_list:[],connection_list:[],post_list:[],automation_list:[],asset_list:[],agent_list:[],grant_list:[],audit_list:[]};
export const statusNames:Record<string,string>={draft:'Szkic',approval:'Do akceptacji',scheduled:'Zaplanowano',processing:'Publikowanie',published:'Opublikowano',failed:'Błąd',uncertain:'Sprawdź wynik',cancelled:'Anulowano'};
export const platformNames:Record<string,string>={facebook:'Facebook',linkedin:'LinkedIn',wordpress:'WordPress',instagram:'Instagram',telegram:'Telegram',mastodon:'Mastodon'};

export const platformSymbols:Record<string,string>={facebook:'f',linkedin:'in',wordpress:'W',instagram:'IG',telegram:'TG',mastodon:'M'};
