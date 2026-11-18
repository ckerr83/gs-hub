-- PREPARED ONLY. Run manually in Supabase SQL Editor as postgres.
-- Requires the existing wine-database schema and approved team access helpers.
begin;
create table if not exists public.shipments (
  id text primary key check (length(id) between 1 and 160),
  data jsonb not null check (jsonb_typeof(data)='object'),
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (data->>'stage' in ('proposed','ordered','actuals','closed')),
  check (length(trim(data->>'name'))>0)
);
create table if not exists public.shipment_pallets (
  shipment_id text references public.shipments(id) on delete restrict,
  name text not null, position integer not null,
  primary key(shipment_id,name)
);
create table if not exists public.shipment_wine_items (
  shipment_id text references public.shipments(id) on delete restrict,
  id text not null, wine_id text references public.wines(id) on delete restrict,
  position integer not null, data jsonb not null,
  primary key(shipment_id,id)
);
create table if not exists public.shipment_expenses (
  shipment_id text references public.shipments(id) on delete restrict,
  id text not null, position integer not null, data jsonb not null,
  primary key(shipment_id,id), check(data->>'status' in ('estimate','actual'))
);
create table if not exists public.shipment_forecast_versions (
  shipment_id text references public.shipments(id) on delete restrict,
  id text not null, position integer not null, data jsonb not null,
  primary key(shipment_id,id), check(data->>'kind' in ('Forecast','Actual (partial)','Actual (complete)'))
);
create table if not exists public.shipment_notes (
  shipment_id text references public.shipments(id) on delete restrict,
  id text not null, position integer not null, data jsonb not null,
  primary key(shipment_id,id)
);
create index if not exists shipments_arrival_idx on public.shipments((data->>'arrivalDate'));
-- Reuse the existing team roster; no new enrollment or public access.
do $policies$ declare t text; begin
  foreach t in array array['shipments','shipment_pallets','shipment_wine_items','shipment_expenses','shipment_forecast_versions','shipment_notes'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('drop policy if exists shipment_team_read on public.%I',t);
    execute format('create policy shipment_team_read on public.%I for select to authenticated using ((select public.wine_can_read()))',t);
  end loop;
end $policies$;

create or replace function public.shipment_get(shipment_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; begin
  if not public.wine_can_read() then raise exception 'Team access required' using errcode='42501'; end if;
  select s.data || jsonb_build_object('id',s.id,'version',s.version,'updatedAt',s.updated_at,
    'pallets',coalesce((select jsonb_agg(p.name order by p.position) from public.shipment_pallets p where p.shipment_id=s.id),'[]'),
    'wines',coalesce((select jsonb_agg(w.data order by w.position) from public.shipment_wine_items w where w.shipment_id=s.id),'[]'),
    'expenses',coalesce((select jsonb_agg(e.data order by e.position) from public.shipment_expenses e where e.shipment_id=s.id),'[]'),
    'snapshots',coalesce((select jsonb_agg(v.data order by v.position) from public.shipment_forecast_versions v where v.shipment_id=s.id),'[]'),
    'notes',coalesce((select jsonb_agg(n.data order by n.position) from public.shipment_notes n where n.shipment_id=s.id),'[]'))
  into result from public.shipments s where s.id=shipment_get.shipment_id;
  return result;
end $$;

create or replace function public.shipment_commit(document jsonb, expected_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid text:=document->>'id'; prior public.shipments; payload jsonb;
begin
  if not public.wine_can_write() then raise exception 'Team write access required' using errcode='42501'; end if;
  if sid is null or length(sid)>160 or coalesce(trim(document->>'name'),'')='' or expected_version is null
    or jsonb_typeof(document->'wines') is distinct from 'array'
    or jsonb_typeof(document->'expenses') is distinct from 'array'
    or jsonb_typeof(document->'pallets') is distinct from 'array'
    or jsonb_typeof(document->'snapshots') is distinct from 'array'
    or jsonb_typeof(document->'notes') is distinct from 'array'
    or jsonb_array_length(document->'wines')>1000
    or jsonb_array_length(document->'expenses')>500
    or jsonb_array_length(document->'pallets') not between 1 and 100
    then raise exception 'Invalid shipment' using errcode='22023'; end if;
  select * into prior from public.shipments where id=sid for update;
  if (prior.id is null and expected_version<>0) or (prior.id is not null and prior.version<>expected_version)
    then raise exception 'Shipment changed; reload before saving' using errcode='40001'; end if;
  if prior.id is not null then
    if coalesce(prior.data->>'forecastId','')<>'' and document->>'forecastId' is distinct from prior.data->>'forecastId'
      then raise exception 'Original forecast is immutable' using errcode='22023'; end if;
    if coalesce(prior.data->>'arrivalDate','')<>'' and document->>'arrivalDate' is distinct from prior.data->>'arrivalDate'
      then raise exception 'Arrival record is immutable' using errcode='22023'; end if;
  end if;
  if exists(select 1 from public.shipment_forecast_versions v where v.shipment_id=sid
    and not exists(select 1 from jsonb_array_elements(document->'snapshots') x where x->>'id'=v.id and x=v.data))
    then raise exception 'Saved versions are immutable' using errcode='22023'; end if;
  if exists(select 1 from public.shipment_notes n where n.shipment_id=sid
    and not exists(select 1 from jsonb_array_elements(document->'notes') x where x->>'id'=n.id and x=n.data))
    then raise exception 'Notes are append-only' using errcode='22023'; end if;
  if coalesce(document->>'forecastId','')<>'' and not exists(select 1 from jsonb_array_elements(document->'snapshots') x where x->>'id'=document->>'forecastId' and x->>'kind'='Forecast')
    then raise exception 'Forecast reference missing' using errcode='22023'; end if;
  if (coalesce(document->>'arrivalDate','')<>'' or document->>'stage'<>'proposed') and coalesce(document->>'forecastId','')=''
    then raise exception 'Confirm a forecast first' using errcode='22023'; end if;
  payload:=document-array['id','version','updatedAt','pallets','wines','expenses','snapshots','notes'];
  if prior.id is null then
    insert into public.shipments(id,data) values(sid,payload);
  else
    update public.shipments set data=payload,version=version+1,updated_at=clock_timestamp() where id=sid;
  end if;
  delete from public.shipment_wine_items where shipment_id=sid;
  delete from public.shipment_expenses where shipment_id=sid;
  delete from public.shipment_pallets where shipment_id=sid;
  insert into public.shipment_pallets select sid,value,ordinality from jsonb_array_elements_text(document->'pallets') with ordinality;
  insert into public.shipment_wine_items
    select sid,x->>'id',w.id,ordinality,x from jsonb_array_elements(document->'wines') with ordinality as item(x,ordinality)
    left join public.wines w on w.id=x->>'productId';
  insert into public.shipment_expenses select sid,x->>'id',ordinality,x from jsonb_array_elements(document->'expenses') with ordinality as item(x,ordinality);
  insert into public.shipment_forecast_versions select sid,x->>'id',ordinality,x from jsonb_array_elements(document->'snapshots') with ordinality as item(x,ordinality) on conflict do nothing;
  insert into public.shipment_notes select sid,x->>'id',ordinality,x from jsonb_array_elements(document->'notes') with ordinality as item(x,ordinality) on conflict do nothing;
  return public.shipment_get(sid);
end $$;
revoke all on function public.shipment_get(text),public.shipment_commit(jsonb,integer) from public,anon,authenticated;
grant execute on function public.shipment_get(text),public.shipment_commit(jsonb,integer) to authenticated;
commit;

-- Original source records are append-only evidence; kept separate from edits.
begin;
create table if not exists public.shipment_source_evidence (
  shipment_id text not null references public.shipments(id) on delete restrict,
  source_revision integer not null,
  source_url text not null,
  source_updated_at timestamptz not null,
  payload jsonb not null,
  primary key(shipment_id,source_revision)
);
alter table public.shipment_source_evidence enable row level security;
revoke all on public.shipment_source_evidence from public,anon,authenticated;
grant select on public.shipment_source_evidence to authenticated;
drop policy if exists shipment_team_read on public.shipment_source_evidence;
create policy shipment_team_read on public.shipment_source_evidence for select to authenticated using ((select public.wine_can_read()));
commit;
