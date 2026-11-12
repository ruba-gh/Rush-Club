-- Rush: regions, session-specific prices, delete wishes, and expired games.
-- Run in Supabase SQL Editor on the EXISTING project (do not rerun schema.sql).
-- No existing sessions or preferences are deleted during this migration.

begin;

alter table public.sessions
  add column if not exists region text,
  add column if not exists price numeric(10,2) not null default 0;

alter table public.preferences
  add column if not exists regions text[] not null default '{}'::text[];

-- Existing sessions keep an unspecified area until edited by the admin.
-- Existing sessions get 0 SAR so the owner can set each actual price.
alter table public.sessions drop constraint if exists rush_price_nonnegative;
alter table public.sessions add constraint rush_price_nonnegative check(price >= 0);
alter table public.sessions drop constraint if exists rush_region_valid;
alter table public.sessions add constraint rush_region_valid check(
  region is null or region in ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض')
);

create or replace function public.save_preference(
  p_name text, p_phone text, p_sport text, p_day text,
  p_period text, p_week_start date, p_regions text[]
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  today_riyadh date := (now() at time zone 'Asia/Riyadh')::date;
  week_riyadh date;
begin
  week_riyadh := today_riyadh - extract(dow from today_riyadh)::integer;
  if length(trim(coalesce(p_name,''))) not between 1 and 70
    or p_phone is null or p_phone !~ '^05[0-9]{8}$'
    or p_sport is null or p_sport not in ('تنس ريشة','بادل','تنس')
    or p_day is null or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
    or p_period is null or p_period not in ('٥–٧ مساءً','٧–٩ مساءً')
    or p_week_start is distinct from week_riyadh
    or p_regions is null or cardinality(p_regions) not between 1 and 5
    or (select count(distinct r) from unnest(p_regions) r) <> cardinality(p_regions)
    or exists (select 1 from unnest(p_regions) as r where r is null or r not in
       ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض'))
  then
    raise exception 'invalid preference' using errcode='22023';
  end if;

  insert into public.preferences(name,phone,sport,day,period,week_start,regions)
  values(trim(p_name),p_phone,p_sport,p_day,p_period,p_week_start,p_regions)
  on conflict(phone,sport,day,period,week_start)
  do update set regions = excluded.regions, name = excluded.name;
end;
$$;

-- Remove old 6-argument RPC, so only the version validating regions can be used.
drop function if exists public.save_preference(text,text,text,text,text,date);
revoke all on function public.save_preference(text,text,text,text,text,date,text[]) from public;
grant execute on function public.save_preference(text,text,text,text,text,date,text[]) to anon,authenticated;

-- Delete only for authenticated admin. Explicit RPC used by admin UI.
create or replace function public.delete_preference(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;
  delete from public.preferences where id=p_id;
end;
$$;
revoke all on function public.delete_preference(uuid) from public;
grant execute on function public.delete_preference(uuid) to authenticated;

-- Append columns to existing view in the same original order, so CREATE OR REPLACE is safe.
create or replace view public.public_sessions with (security_invoker=false) as
select id,sport,venue,starts_at,ends_at,capacity,price,region
from public.sessions where ends_at > now();
grant select on public.public_sessions to anon,authenticated;

-- Scheduled function: deletes only after the Riyadh calendar date of the game ends.
-- Cascade removes registrations associated with the expired game.
-- Removes wishes only when their calendar week has ended.
create or replace function public.cleanup_expired_data()
returns void language plpgsql security definer set search_path = public
as $$
declare
  today_riyadh date := (now() at time zone 'Asia/Riyadh')::date;
begin
  if session_user not in ('postgres') and current_user not in ('postgres','supabase_admin') then
    raise exception 'cleanup is restricted' using errcode='42501';
  end if;
  delete from public.sessions
    where (ends_at at time zone 'Asia/Riyadh')::date < today_riyadh;
  delete from public.preferences
    where week_start < today_riyadh - extract(dow from today_riyadh)::integer;
end;
$$;
revoke all on function public.cleanup_expired_data() from public,anon,authenticated;

create index if not exists rush_sessions_end_idx on public.sessions(ends_at);
create index if not exists rush_preferences_week_idx on public.preferences(week_start);

commit;
