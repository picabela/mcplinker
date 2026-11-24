// Runs once when the Node server starts. Only the self-hosted mode (DATABASE_URL) needs it;
// on Vercel the queue is driven by Supabase Cron and Vercel Cron.
export async function register(){
 if(process.env.NEXT_RUNTIME!=='nodejs'||!process.env.DATABASE_URL||process.env.VERCEL)return;
 const {boot}=await import('./lib/boot.mjs');
 await boot();
}
