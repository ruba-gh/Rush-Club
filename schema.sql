-- Run in Supabase SQL editor. Admin must be created in Supabase Authentication manually.
create extension if not exists pgcrypto;
create table public.sessions (id uuid primary key default gen_random_uuid(),sport text not null,venue text not null,starts_at timestamptz not null,ends_at timestamptz not null,capacity integer not null check(capacity>0),created_at timestamptz default now(),check(ends_at>starts_at));
create table public.preferences (id uuid primary key default gen_random_uuid(),name text not null,phone text not null check(phone ~ '^05[0-9]{8}$'),sport text not null,day text not null,period text not null,week_start date not null,created_at timestamptz default now(),unique(phone,sport,day,period,week_start));
create table public.registrations (id uuid primary key default gen_random_uuid(),session_id uuid not null references public.sessions(id) on delete cascade,name text not null,phone text not null check(phone ~ '^05[0-9]{8}$'),created_at timestamptz default now(),unique(session_id,phone));
-- Only a pre-provisioned authenticated admin is authorized. Never put the service-role key in frontend.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from auth.users where id=auth.uid() and email='REPLACE_ADMIN_EMAIL')$$;
revoke all on function public.is_admin() from public;grant execute on function public.is_admin() to authenticated;
alter table public.sessions enable row level security;alter table public.preferences enable row level security;alter table public.registrations enable row level security;
create policy "admin sessions" on public.sessions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "admin preferences" on public.preferences for select to authenticated using(public.is_admin());
create policy "admin registrations" on public.registrations for select to authenticated using(public.is_admin());
-- Public reads a privacy-safe view only, not underlying rows.
create view public.session_counts with (security_invoker=false) as select s.id as session_id,count(r.id)::integer as registered_count from public.sessions s left join public.registrations r on r.session_id=s.id group by s.id;
create view public.public_sessions with (security_invoker=false) as select id,sport,venue,starts_at,ends_at,capacity from public.sessions where ends_at>now();
revoke all on public.sessions,public.preferences,public.registrations from anon;
grant select on public.public_sessions,public.session_counts to anon,authenticated;
grant select,insert,update,delete on public.sessions to authenticated;
grant select on public.preferences,public.registrations to authenticated;
-- Public writes are restricted to a single RPC per action; no direct anonymous table access.
create or replace function public.save_preference(p_name text,p_phone text,p_sport text,p_day text,p_period text,p_week_start date) returns void language plpgsql security definer set search_path=public as $$begin
 if length(trim(p_name)) not between 1 and 70 or p_phone !~ '^05[0-9]{8}$' or p_sport not in ('تنس ريشة','بادل','تنس','سكواش') or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت') or p_period not in ('صباحًا','عصرًا','مساءً') or p_week_start <> (current_date-extract(dow from current_date)::integer) then raise exception 'invalid preference';end if;
 insert into public.preferences(name,phone,sport,day,period,week_start) values(trim(p_name),p_phone,p_sport,p_day,p_period,p_week_start) on conflict(phone,sport,day,period,week_start) do nothing;
end$$;
create or replace function public.join_session(p_session_id uuid,p_name text,p_phone text) returns void language plpgsql security definer set search_path=public as $$declare v_capacity integer;v_count integer;begin
 if length(trim(p_name)) not between 1 and 70 or p_phone !~ '^05[0-9]{8}$' then raise exception 'invalid details';end if;
 select capacity into v_capacity from public.sessions where id=p_session_id and ends_at>now() for update;
 if v_capacity is null then raise exception 'session unavailable';end if;
 select count(*) into v_count from public.registrations where session_id=p_session_id;
 if v_count>=v_capacity then raise exception 'session full';end if;
 insert into public.registrations(session_id,name,phone) values(p_session_id,trim(p_name),p_phone);
end$$;
revoke all on function public.save_preference(text,text,text,text,text,date),public.join_session(uuid,text,text) from public;
grant execute on function public.save_preference(text,text,text,text,text,date),public.join_session(uuid,text,text) to anon,authenticated;