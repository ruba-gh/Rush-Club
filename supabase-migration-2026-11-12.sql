-- Rush update: run this once in Supabase SQL Editor (existing project).
-- Admin email is determined by the existing public.is_admin() function.
create table if not exists public.site_settings (
  id integer primary key default 1 check (id = 1),
  group_url text not null default '',
  payment_instructions text not null default ''
);
alter table public.site_settings enable row level security;
drop policy if exists "admin manage site settings" on public.site_settings;
create policy "admin manage site settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.site_settings from anon, authenticated;
grant select, insert, update on public.site_settings to authenticated;

-- Publish only non-sensitive copy; visitors don't have access to private registrations.
create or replace view public.public_site_settings with (security_invoker=false) as
select id, group_url, payment_instructions from public.site_settings where id=1;
grant select on public.public_site_settings to anon, authenticated;
insert into public.site_settings(id, group_url, payment_instructions)
values (1, '', 'يرجى التواصل مع إدارة Rush للحصول على بيانات الدفع. الحجز يتأكد بعد الدفع.')
on conflict (id) do nothing;

-- Time slots for this week: 5–7 PM and 7–9 PM.
create or replace function public.save_preference(
  p_name text, p_phone text, p_sport text, p_day text, p_period text, p_week_start date
) returns void
language plpgsql security definer set search_path=public as $$
begin
 if length(trim(p_name)) not between 1 and 70
    or p_phone !~ '^05[0-9]{8}$'
    or p_sport not in ('تنس ريشة','بادل','تنس','سكواش')
    or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
    or p_period not in ('٥–٧ مساءً','٧–٩ مساءً')
    or p_week_start <> (current_date-extract(dow from current_date)::integer)
 then raise exception 'invalid preference';
 end if;
 insert into public.preferences(name,phone,sport,day,period,week_start)
 values(trim(p_name),p_phone,p_sport,p_day,p_period,p_week_start)
 on conflict(phone,sport,day,period,week_start) do nothing;
end$$;
revoke all on function public.save_preference(text,text,text,text,text,date) from public;
grant execute on function public.save_preference(text,text,text,text,text,date) to anon,authenticated;
