-- Rush: repair weekly wish submission (safe for existing data).
-- Paste into Supabase SQL Editor and run once. Existing wishes are retained.
create or replace function public.save_preference(
  p_name text, p_phone text, p_sport text, p_day text, p_period text, p_week_start date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_today date := (now() at time zone 'Asia/Riyadh')::date;
  expected_week date;
begin
  expected_week := local_today - extract(dow from local_today)::integer;

  if length(trim(coalesce(p_name,''))) not between 1 and 70
     or p_phone is null or p_phone !~ '^05[0-9]{8}$'
     or p_sport is null or p_sport not in ('تنس ريشة','بادل','تنس')
     or p_day is null or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
     or p_period is null or p_period not in ('٥–٧ مساءً','٧–٩ مساءً')
     or p_week_start is distinct from expected_week then
    raise exception 'invalid preference' using errcode = '22023';
  end if;

  insert into public.preferences(name,phone,sport,day,period,week_start)
  values (trim(p_name),p_phone,p_sport,p_day,p_period,p_week_start)
  on conflict(phone,sport,day,period,week_start) do nothing;
end;
$$;

revoke all on function public.save_preference(text,text,text,text,text,date) from public;
grant execute on function public.save_preference(text,text,text,text,text,date) to anon,authenticated;
