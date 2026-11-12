-- Rush admin wish actions. Run once in Supabase SQL Editor.
-- Keeps all existing data. Requires previous regions migration.
begin;

create or replace function public.update_preference(
  p_id uuid,p_name text,p_phone text,p_sport text,p_day text,p_period text,p_regions text[]
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 70
    or p_phone is null or p_phone !~ '^05[0-9]{8}$'
    or p_sport is null or p_sport not in ('تنس ريشة','بادل','تنس')
    or p_day is null or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
    or p_period is null or p_period not in ('٥–٧ مساءً','٧–٩ مساءً')
    or p_regions is null or cardinality(p_regions) not between 1 and 5
    or (select count(distinct r) from unnest(p_regions) r) <> cardinality(p_regions)
    or exists(select 1 from unnest(p_regions) as r where r is null or r not in ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض'))
  then
    raise exception 'invalid preference' using errcode='22023';
  end if;
  update public.preferences
  set name=trim(p_name),phone=p_phone,sport=p_sport,day=p_day,period=p_period,regions=p_regions
  where id=p_id;
  if not found then raise exception 'preference not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.update_preference(uuid,text,text,text,text,text,text[]) from public,anon;
grant execute on function public.update_preference(uuid,text,text,text,text,text,text[]) to authenticated;

create or replace function public.delete_all_preferences()
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'not authorized' using errcode='42501';
  end if;
  delete from public.preferences;
end;
$$;
revoke all on function public.delete_all_preferences() from public,anon;
grant execute on function public.delete_all_preferences() to authenticated;

commit;
