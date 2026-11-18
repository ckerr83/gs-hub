-- PREPARED ONLY. Read-only verification in SQL Editor after import.
select count(*) as all_wines, count(*) filter (where archived_at is null) as active_wines,
 count(*) filter (where image_path is not null) as wines_with_photos from public.wines;
select count(*) as references from public.wine_cost_references where source_revision=1392;
select count(*) as evidence_records from public.wine_source_evidence where source_revision=1392;
select count(*) as photos from storage.objects where bucket_id='wine-bottles';
select id from public.wines where id in ('workbook-4','workbook-5');
select id, public from storage.buckets where id='wine-bottles';
select tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename in ('wines','wine_cost_references','wine_source_evidence');
-- Empty team roster is intentional until a real sign-in/access model is approved.
select count(*) as approved_users from wine_private.team_access;
-- anon may not read/write tables; authenticated may not update/delete directly.
select has_table_privilege('anon','public.wines','select') as anon_read,
 has_table_privilege('anon','public.wines','insert') as anon_write,
 has_table_privilege('authenticated','public.wines','update') as direct_update,
 has_table_privilege('authenticated','public.wines','delete') as hard_delete;
-- As anon, even helpers and update RPCs are inaccessible. These must be false.
select has_function_privilege('anon','public.wine_can_read()','execute') as anon_helper,
 has_function_privilege('anon','public.wine_update(text,integer,jsonb,boolean)','execute') as anon_update;
-- Audit any pre-existing storage/public policies before allowing real users.
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where (schemaname='storage' and tablename='objects')
 or (schemaname='public' and tablename in ('wines','wine_cost_references','wine_source_evidence'));
