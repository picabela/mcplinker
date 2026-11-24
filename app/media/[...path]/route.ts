import {serveMedia} from '@/lib/media-storage.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Files hosted by a self-hosted deployment (DATABASE_URL). Instagram downloads them from here.
async function handle(req:Request,{params}:{params:Promise<{path:string[]}>}){return serveMedia(req,(await params).path.join('/'));}
export const GET=handle;
export const HEAD=handle;
