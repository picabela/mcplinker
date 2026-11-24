import {ensureSchema} from './pg.mjs';
import {runWorker} from './worker.mjs';
import {cleanError} from './security.mjs';
import {autoImport} from './import-supabase.mjs';

// Self-hosted startup (DATABASE_URL, long-running Node server): apply migrations, copy
// data from the previous Supabase deployment if configured, and run the publishing queue
// every minute in-process instead of Supabase Cron. Set SCHEDULER_DISABLED=1 to turn it off.
export async function boot(){
 if(globalThis.__mcplinkerBooted)return;globalThis.__mcplinkerBooted=true;
 try{await ensureSchema();}catch(e){console.error('MCPLinker migrations failed:',cleanError(e));}
 autoImport().catch(e=>console.error('MCPLinker import failed:',cleanError(e)));
 if(process.env.SCHEDULER_DISABLED==='1')return;
 let busy=false;
 const tick=async()=>{if(busy)return;busy=true;try{const r=await runWorker();if(r.results.length)console.log('MCPLinker scheduler',JSON.stringify(r.results));}catch(e){console.error('MCPLinker scheduler failed:',cleanError(e));}finally{busy=false;}};
 setTimeout(tick,20000).unref?.();
 setInterval(tick,60000).unref?.();
}
