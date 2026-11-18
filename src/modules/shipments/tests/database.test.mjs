import './resolve.mjs';
import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {newShipment,applyAction}=await import('../data/model.ts');
const root=new URL('../',import.meta.url);
export async function testDatabase(){const db=new PGlite();await db.exec(`create role anon; create role authenticated;
create table public.wines(id text primary key);
create function public.wine_can_read() returns boolean language sql stable as $$ select coalesce(current_setting('request.test_access',true),'') in ('writer','reader') $$;
create function public.wine_can_write() returns boolean language sql stable as $$ select coalesce(current_setting('request.test_access',true),'')='writer' $$;
revoke all on function public.wine_can_read(), public.wine_can_write() from public,anon;
grant execute on function public.wine_can_read(), public.wine_can_write() to authenticated;`);return db;}
test('shipment SQL imports atomically and preserves saves, archives, history and access rules',async()=>{
 const db=await testDatabase();try{
 const schema=readFileSync(new URL('database/202611150001_shipments.sql',root),'utf8');await db.exec(schema);await db.exec(schema);
 const manifest=JSON.parse(readFileSync(new URL('database/import/manifest.json',root),'utf8'));
 for(const f of manifest.files){const sql=readFileSync(new URL('database/import/'+f.file,root),'utf8');assert.ok(Buffer.byteLength(sql)<=48*1024);await db.exec(sql);}
 assert.equal((await db.query('select count(*)::int as n from public.shipments')).rows[0].n,12);
 await db.exec("select set_config('request.test_access','writer',false); set role authenticated;");
 const imported=(await db.query('select public.shipment_get(id) as value from public.shipments order by id limit 1')).rows[0].value;
 const draft=newShipment();draft.name='SQL persistence test';draft.currency='USD';draft.fx=33;
 let saved=(await db.query('select public.shipment_commit($1,0) as value',[draft])).rows[0].value;
 assert.equal(saved.version,1);assert.equal((await db.query('select public.shipment_get($1) as value',[draft.id])).rows[0].value.name,draft.name);
 saved.name='Saved in session A';saved=(await db.query('select public.shipment_commit($1,1) as value',[saved])).rows[0].value;assert.equal(saved.version,2);
 await assert.rejects(db.query('select public.shipment_commit($1,1)',[saved]),e=>e.code==='40001');
 await assert.rejects(db.query('update public.shipments set version=99'),e=>e.code==='42501');
 await assert.rejects(db.query('delete from public.shipments'),e=>e.code==='42501');
 await assert.rejects(db.query('select public.shipment_commit($1,$2)',[{...imported,snapshots:[]},imported.version]),/immutable|Forecast/);
 await db.exec("select set_config('request.test_access','reader',false);");
 assert.equal((await db.query('select public.shipment_get($1) as value',[saved.id])).rows[0].value.name,'Saved in session A');
 await assert.rejects(db.query('select public.shipment_commit($1,2)',[saved]),e=>e.code==='42501');
 await db.exec("select set_config('request.test_access','outsider',false);");
 assert.equal((await db.query('select count(*)::int as n from public.shipments')).rows[0].n,0);
 await assert.rejects(db.query('select public.shipment_get($1)',[saved.id]),e=>e.code==='42501');
 await db.exec('reset role; set role anon;');
 await assert.rejects(db.query('select * from public.shipments'),e=>e.code==='42501');
 await assert.rejects(db.query('select public.shipment_commit($1,2)',[saved]),e=>e.code==='42501');
 await db.exec("reset role; select set_config('request.test_access','writer',false);");
 const modified={...imported,name:'Newer remote edit'};const remote=(await db.query('select public.shipment_commit($1,$2) as value',[modified,imported.version])).rows[0].value;
 for(const f of manifest.files)await db.exec(readFileSync(new URL('database/import/'+f.file,root),'utf8'));
 assert.equal((await db.query('select public.shipment_get($1) as value',[remote.id])).rows[0].value.name,'Newer remote edit');
 assert.equal((await db.query('select count(*)::int as n from public.shipment_source_evidence')).rows[0].n,12);
 // Arrival after confirmation changes classification, never discards a snapshot.
 const ordered=(await db.query("select public.shipment_get(id) as value from public.shipments where data->>'stage'='ordered' limit 1")).rows[0].value;
 const landed=applyAction(ordered,ordered,'land',{date:'2026-11-16'});const result=(await db.query('select public.shipment_commit($1,$2) as value',[landed,ordered.version])).rows[0].value;
 assert.equal(result.arrivalDate,'2026-11-16');assert.equal(result.stage,'actuals');assert.deepEqual(result.snapshots,ordered.snapshots);
 }finally{await db.close();}
});
