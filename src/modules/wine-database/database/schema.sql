-- PREPARED ONLY. Run in Supabase SQL Editor as postgres after review.
-- The earlier supabase/migrations/202611120001_wine_library.sql was moved here.
-- No team users are enrolled, no sign-in provider is configured by this migration.
begin;
create schema if not exists wine_private;
revoke all on schema wine_private from public, anon, authenticated;
create table if not exists wine_private.team_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  can_write boolean not null default false,
  approved_at timestamptz not null default now()
);
alter table wine_private.team_access enable row level security;
revoke all on wine_private.team_access from public, anon, authenticated;

create or replace function public.wine_can_read() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from wine_private.team_access where user_id = (select auth.uid()));
$$;
create or replace function public.wine_can_write() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from wine_private.team_access where user_id = (select auth.uid()) and can_write);
$$;
revoke all on function public.wine_can_read(), public.wine_can_write() from public, anon, authenticated;
grant execute on function public.wine_can_read(), public.wine_can_write() to authenticated;

create table if not exists public.wines (
  id text primary key check (length(id) between 1 and 160),
  name text not null check (length(trim(name)) > 0),
  producer text not null check (length(trim(producer)) > 0),
  vintage text not null default '', variety text not null default '',
  wine_type text not null default '', country text not null default '', sku text not null default '',
  abv numeric check (abv between 0 and 100),
  bottle_ml numeric check (bottle_ml > 0),
  bottles_per_case integer check (bottles_per_case > 0),
  source_cost numeric check (source_cost >= 0), source_currency text not null default '',
  supplier_discount numeric check (supplier_discount between 0 and 100),
  registered_price numeric check (registered_price >= 0), registered_price_source text,
  sales_price numeric check (sales_price >= 0),
  landed_reference numeric, recommendation_cost numeric check (recommendation_cost >= 0),
  rrp numeric check (rrp >= 0), image_path text,
  source_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  archived_at timestamptz
);
-- Compatible with the original prepared schema if it was applied separately.
alter table public.wines add column if not exists landed_reference numeric;
alter table public.wines add column if not exists recommendation_cost numeric;
alter table public.wines add column if not exists rrp numeric;
alter table public.wines alter column supplier_discount drop not null;
alter table public.wines alter column supplier_discount drop default;
create index if not exists wines_producer_idx on public.wines(producer);
create index if not exists wines_country_idx on public.wines(country);
create index if not exists wines_active_idx on public.wines(id) where archived_at is null;

create table if not exists public.wine_cost_references (
  wine_id text not null references public.wines(id) on delete restrict,
  reference_kind text not null check (reference_kind in ('displayed','historical')),
  source_revision integer not null, cost numeric, basis text not null, detail text,
  captured_at timestamptz not null, source_payload jsonb not null,
  primary key (wine_id, reference_kind, source_revision)
);
create table if not exists public.wine_source_evidence (
  wine_id text not null references public.wines(id) on delete restrict,
  source_revision integer not null, captured_at timestamptz not null,
  workbook_rows jsonb not null default '[]'::jsonb, saved_breakdown jsonb,
  primary key (wine_id, source_revision)
);

create or replace function wine_private.stamp_wine() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1; new.created_at := clock_timestamp(); new.updated_at := new.created_at;
  else
    if old.archived_at is not null then raise exception 'Archived wines are immutable' using errcode = '40001'; end if;
    if new.id is distinct from old.id or new.created_at is distinct from old.created_at
       or new.source_metadata is distinct from old.source_metadata
       or new.image_path is distinct from old.image_path
       or new.landed_reference is distinct from old.landed_reference then
      raise exception 'Immutable wine provenance' using errcode = '42501';
    end if;
    new.version := old.version + 1; new.updated_at := clock_timestamp();
    if new.archived_at is not null then new.archived_at := new.updated_at; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stamp_wine on public.wines;
create trigger stamp_wine before insert or update on public.wines for each row execute function wine_private.stamp_wine();

-- Narrow, authorized RPC is the only authenticated UPDATE path. There is no
-- authenticated table UPDATE grant, so REST cannot bypass expected_version.
create or replace function public.wine_update(wine_id text, expected_version integer, patch jsonb, archive boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.wines; changed public.wines;
begin
  if not public.wine_can_write() then raise exception 'Team write access required' using errcode = '42501'; end if;
  if expected_version < 1 or expected_version is null or archive is null then raise exception 'Invalid version' using errcode = '22023'; end if;
  if archive then
    update public.wines set archived_at = clock_timestamp()
      where id = wine_id and version = expected_version and archived_at is null returning * into changed;
  else
    if jsonb_typeof(patch) is distinct from 'object' or exists (
      select 1 from jsonb_object_keys(patch) as k(key) where key not in (
        'name','producer','vintage','variety','wine_type','country','sku','abv','bottle_ml','bottles_per_case',
        'source_cost','source_currency','supplier_discount','registered_price','registered_price_source','sales_price','rrp','recommendation_cost'
      )
    ) then raise exception 'Invalid editable fields' using errcode = '22023'; end if;
    select * into p from jsonb_populate_record(null::public.wines, patch);
    update public.wines set name=p.name, producer=p.producer, vintage=p.vintage, variety=p.variety,
      wine_type=p.wine_type, country=p.country, sku=p.sku, abv=p.abv, bottle_ml=p.bottle_ml,
      bottles_per_case=p.bottles_per_case, source_cost=p.source_cost, source_currency=p.source_currency,
      supplier_discount=p.supplier_discount, registered_price=p.registered_price,
      registered_price_source=p.registered_price_source, sales_price=p.sales_price, rrp=p.rrp,
      recommendation_cost=p.recommendation_cost
      where id = wine_id and version = expected_version and archived_at is null returning * into changed;
  end if;
  if changed.id is null then raise exception 'Wine changed, missing or archived' using errcode = '40001'; end if;
  return to_jsonb(changed) || jsonb_build_object('wine_cost_references', coalesce((select jsonb_agg(r order by r.source_revision desc) from public.wine_cost_references r where r.wine_id=changed.id),'[]'::jsonb));
end;
$$;
revoke all on function public.wine_update(text,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.wine_update(text,integer,jsonb,boolean) to authenticated;

alter table public.wines enable row level security;
alter table public.wine_cost_references enable row level security;
alter table public.wine_source_evidence enable row level security;
revoke all on public.wines, public.wine_cost_references, public.wine_source_evidence from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on public.wines, public.wine_cost_references, public.wine_source_evidence to authenticated;
grant insert (id,name,producer,vintage,variety,wine_type,country,sku,abv,bottle_ml,bottles_per_case,source_cost,source_currency,supplier_discount,registered_price,registered_price_source,sales_price,rrp,recommendation_cost) on public.wines to authenticated;
grant all on public.wines, public.wine_cost_references, public.wine_source_evidence to service_role;
drop policy if exists wine_team_read on public.wines;
create policy wine_team_read on public.wines for select to authenticated using ((select public.wine_can_read()));
drop policy if exists wine_team_insert on public.wines;
create policy wine_team_insert on public.wines for insert to authenticated with check ((select public.wine_can_write()) and archived_at is null and version=1);
drop policy if exists wine_cost_team_read on public.wine_cost_references;
create policy wine_cost_team_read on public.wine_cost_references for select to authenticated using ((select public.wine_can_read()));
drop policy if exists wine_evidence_team_read on public.wine_source_evidence;
create policy wine_evidence_team_read on public.wine_source_evidence for select to authenticated using ((select public.wine_can_read()));

-- Immutable original filenames, private download; no anonymous or team upload,
-- overwrite or delete policy. Photos are uploaded by the offline migration only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('wine-bottles','wine-bottles',false,1048576,array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists wine_bottles_team_read on storage.objects;
create policy wine_bottles_team_read on storage.objects for select to authenticated
using (bucket_id='wine-bottles' and (select public.wine_can_read()));
commit;
