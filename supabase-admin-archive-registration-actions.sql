-- Rush admin: edit/delete archived wishes and manage session registrations.
-- Run AFTER supabase-preference-selection-archive.sql. Safe to rerun.
-- Running this file does not delete or change existing registrations or archived wishes.
BEGIN;

CREATE OR REPLACE FUNCTION public.edit_archived_preference(
 p_id uuid,p_phone text,p_sport text,p_day text,p_period text,p_regions text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'admin only' USING errcode='42501';
 END IF;
 IF p_phone IS NULL OR p_phone !~ '^05[0-9]{8}$'
  OR p_sport IS NULL OR p_sport NOT IN ('تنس ريشة','بادل','تنس')
  OR p_day IS NULL OR p_day NOT IN ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
  OR p_period IS NULL OR p_period NOT IN ('٥–٧ مساءً','٧–٩ مساءً')
  OR p_regions IS NULL OR cardinality(p_regions)>5
  OR EXISTS(SELECT 1 FROM unnest(p_regions) AS r
      WHERE r IS NULL OR r NOT IN ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض'))
 THEN RAISE EXCEPTION 'invalid archived preference' USING errcode='22023'; END IF;
 UPDATE public.archived_preferences
 SET phone=p_phone,sport=p_sport,day=p_day,period=p_period,regions=p_regions
 WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'archive record not found' USING errcode='P0002'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.edit_archived_preference(uuid,text,text,text,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_archived_preference(uuid,text,text,text,text,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_archived_preference(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'admin only' USING errcode='42501';
 END IF;
 DELETE FROM public.archived_preferences WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'archive record not found' USING errcode='P0002'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.delete_archived_preference(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_archived_preference(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.edit_session_registration(p_id uuid,p_name text,p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'admin only' USING errcode='42501';
 END IF;
 IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 70
 OR p_phone IS NULL OR p_phone !~ '^05[0-9]{8}$'
 THEN RAISE EXCEPTION 'invalid player details' USING errcode='22023'; END IF;
 UPDATE public.registrations SET name=trim(p_name),phone=p_phone WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'registration not found' USING errcode='P0002'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.edit_session_registration(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_session_registration(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_session_registration(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN
  RAISE EXCEPTION 'admin only' USING errcode='42501';
 END IF;
 DELETE FROM public.registrations WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'registration not found' USING errcode='P0002'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_session_registration(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_session_registration(uuid) TO authenticated;
COMMIT;
