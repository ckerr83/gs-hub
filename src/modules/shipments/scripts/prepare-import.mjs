// Offline only. Never connects to Supabase. One atomic file per shipment.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {legacyShipment} from '../data/legacy.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node src/modules/shipments/scripts/prepare-import.mjs source-shipments.json output-directory');
const source=JSON.parse(await readFile(input,'utf8'));
if(!Array.isArray(source.shipments)||!Number.isInteger(source.revision)||!source.updatedAt)throw Error('Expected shipment-only export with revision and updatedAt.');
if(new Set(source.shipments.map(s=>s.id)).size!==source.shipments.length)throw Error('Duplicate shipment IDs');
await mkdir(output,{recursive:true});
const q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
const files=[];
for(const [index,raw] of source.shipments.entries()){
 const s=legacyShipment(raw);
 const file=`${String(index+1).padStart(3,'0')}-shipment.sql`;
 const sql=`-- PREPARED ONLY. Run as postgres after 202611150001_shipments.sql. Safe to repeat.
-- Existing shipment IDs are skipped in full, preserving newer edits and history.
begin;
do $import$ declare d jsonb := ${q(s)}; sid text := d->>'id'; begin
if not exists(select 1 from public.shipments where id=sid) then
insert into public.shipments(id,data) values(sid,d-array['id','version','updatedAt','pallets','wines','expenses','snapshots','notes']);
insert into public.shipment_pallets select sid,value,ordinality from jsonb_array_elements_text(d->'pallets') with ordinality;
insert into public.shipment_wine_items select sid,x->>'id',w.id,ordinality,x from jsonb_array_elements(d->'wines') with ordinality as item(x,ordinality) left join public.wines w on w.id=x->>'productId';
insert into public.shipment_expenses select sid,x->>'id',ordinality,x from jsonb_array_elements(d->'expenses') with ordinality as item(x,ordinality);
insert into public.shipment_forecast_versions select sid,x->>'id',ordinality,x from jsonb_array_elements(d->'snapshots') with ordinality as item(x,ordinality);
insert into public.shipment_notes select sid,x->>'id',ordinality,x from jsonb_array_elements(d->'notes') with ordinality as item(x,ordinality);
end if;
end $import$;
commit;
`;
 if(Buffer.byteLength(sql)>48*1024)throw Error(`${s.name} exceeds the SQL Editor part bound; use a direct PostgreSQL connection.`);
 await writeFile(path.join(output,file),sql);files.push({file,bytes:Buffer.byteLength(sql),sha256:createHash('sha256').update(sql).digest('hex'),shipment:s.name,id:s.id});
 const evidenceFile=`${String(index+1).padStart(3,'0')}-source-evidence.sql`;
 const evidence={shipment_id:s.id,source_revision:source.revision,source_url:'https://gs-import-costing-review.ckerr83.chatgpt.site/#shipment',source_updated_at:source.updatedAt,payload:raw};
 const evidenceSql=`-- PREPARED ONLY. Run after ${file}. Immutable original source evidence.
begin;
insert into public.shipment_source_evidence select * from jsonb_populate_record(null::public.shipment_source_evidence,${q(evidence)}) on conflict do nothing;
do $verify$ begin if exists(select 1 from public.shipment_source_evidence t join jsonb_populate_record(null::public.shipment_source_evidence,${q(evidence)}) s using(shipment_id,source_revision) where t.payload is distinct from s.payload) then raise exception 'Conflicting source evidence'; end if; end $verify$;
commit;
`;
 if(Buffer.byteLength(evidenceSql)>48*1024)throw Error('Source evidence exceeds editor limit');
 await writeFile(path.join(output,evidenceFile),evidenceSql);files.push({file:evidenceFile,bytes:Buffer.byteLength(evidenceSql),sha256:createHash('sha256').update(evidenceSql).digest('hex'),shipment:s.name,id:s.id});
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify({status:'prepared-only',revision:source.revision,shipments:source.shipments.length,snapshots:source.shipments.reduce((n,s)=>n+s.snapshots.length,0),files},null,2)+'\n');
await writeFile(path.join(output,'README.md'),`# Prepared shipment import — not applied\n\nRun the module's 202611150001_shipments.sql first. In Supabase SQL Editor, open a new query, paste one ENTIRE file below and run as postgres. Continue in this order. Do not combine files. Existing shipment IDs are skipped in full. No catalogue rows are created or changed.\n\n${files.map(f=>`- [${f.file}](${f.file}) — ${f.shipment} (${f.bytes} bytes)`).join('\n')}\n\nRun ../verify.sql afterward. These files were generated from source revision ${source.revision}; they are not evidence of a live import.\n`);
console.log(JSON.stringify({shipments:source.shipments.length,files:files.length,writesToSupabase:0}));
