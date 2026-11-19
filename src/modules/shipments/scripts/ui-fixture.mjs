// Explicit local QA only. Uses local PostgreSQL; never contacts Supabase.
// Run with --import ./src/modules/shipments/tests/resolve.mjs
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const {applyAction}=await import('../data/model.ts');
const {withShipmentCosts}=await import('../data/wine-costs.ts');
const {validShipment}=await import('../data/validation.ts');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create table public.wines(id text primary key);create function public.wine_can_read() returns boolean language sql stable as $$ select true $$;create function public.wine_can_write() returns boolean language sql stable as $$ select true $$;`);
await db.exec(await readFile(new URL('../database/202611150001_shipments.sql',import.meta.url),'utf8'));
const catalogue=JSON.parse(await readFile(new URL('../../wine-database/data/catalogue.json',import.meta.url),'utf8'));
for(const w of catalogue.wines)await db.query('insert into public.wines(id) values($1)',[w.id]);
const manifest=JSON.parse(await readFile(new URL('../database/import/manifest.json',import.meta.url),'utf8'));
for(const f of manifest.files)await db.exec(await readFile(new URL('../database/import/'+f.file,import.meta.url),'utf8'));
const target=process.env.SHIPMENT_QA_TARGET||'http://127.0.0.1:3003';
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1:3111');
 const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(url.pathname==='/api/shipments'&&req.method==='GET'){const rows=await db.query('select public.shipment_get(id) as value from public.shipments order by id');send({shipments:rows.rows.map(r=>r.value),canWrite:true});return;}
 if(url.pathname.startsWith('/api/shipments')&&['PUT','POST'].includes(req.method)){
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const value=JSON.parse(Buffer.concat(chunks));
  if(!validShipment(value.shipment))return send({error:'validation'},400);
  const stored=value.shipment.version?(await db.query('select public.shipment_get($1) as value',[value.shipment.id])).rows[0].value:null;
  const next=applyAction(stored,value.shipment,value.action,{date:value.date,note:value.note,author:'Local QA'});
  const result=await db.query('select public.shipment_commit($1,$2) as value',[next,stored?.version??0]);send(result.rows[0].value);return;
 }
 if(url.pathname==='/api/wine-database'){const rows=await db.query('select public.shipment_get(id) as value from public.shipments order by id');send({wines:withShipmentCosts(catalogue.wines,rows.rows.map(r=>r.value)),canWrite:true});return;}
 if(url.pathname.startsWith('/api/wine-database/')){send(null,404);return;}
 if(url.pathname.startsWith('/wine-database/images/')){const filename=url.pathname.split('/').at(-1);if(!/^[a-f0-9-]{36}\.png$/.test(filename)){res.writeHead(404);res.end();return;}const bytes=await readFile(new URL('../../wine-database/assets/images/'+filename,import.meta.url));res.writeHead(200,{'Content-Type':'image/png'});res.end(bytes);return;}
 const headers={...req.headers,host:new URL(target).host};delete headers['accept-encoding'];const response=await fetch(target+req.url,{method:req.method,headers,redirect:'manual'});const bytes=Buffer.from(await response.arrayBuffer());
 const outgoing=Object.fromEntries(response.headers);delete outgoing['content-length'];delete outgoing['content-encoding'];delete outgoing['transfer-encoding'];
 res.writeHead(response.status,outgoing);res.end(bytes);
 }catch(error){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message==='conflict'?'conflict':error.message}));}
});server.listen(3111,'127.0.0.1',()=>console.log('LOCAL POSTGRESQL FIXTURE ONLY http://127.0.0.1:3111/shipments'));
