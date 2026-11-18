BEGIN;

ALTER TABLE public.preferences ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS rush_active_wishes_week_idx
  ON public.preferences (week_start) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  UPDATE public.preferences
  SET archived_at = now()
  WHERE archived_at IS NULL
    AND week_start < date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh') + interval '1 day')::date - 1;
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired_data() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.manage_preferences(p_ids uuid[], p_action text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('archive', 'delete')
     OR p_ids IS NULL OR cardinality(p_ids) NOT BETWEEN 1 AND 500
     OR array_position(p_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid action or selection' USING errcode = '22023';
  END IF;

  IF p_action = 'archive' THEN
    UPDATE public.preferences SET archived_at = now()
    WHERE id = ANY(p_ids) AND archived_at IS NULL;
  ELSE
    DELETE FROM public.preferences WHERE id = ANY(p_ids);
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> (SELECT count(DISTINCT id) FROM unnest(p_ids) AS ids(id)) THEN
    RAISE EXCEPTION 'selection changed; refresh and retry' USING errcode = 'P0002';
  END IF;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.manage_preferences(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_preferences(uuid[], text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rush_valid_wish_period(p_day text, p_period text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT coalesce(p_period IN ('', '٥–٧ مساءً', '٧–٩ مساءً')
    OR (p_day IN ('الجمعة', 'السبت') AND p_period IN ('٨–١٠ صباحًا', '١٠–١٢ صباحًا')), false);
$$;

CREATE OR REPLACE FUNCTION public.rush_public_wishes()
RETURNS TABLE(sport text, day text, period text, region text, votes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT w.sport, w.day, w.period, r.region, count(DISTINCT w.phone)
  FROM public.preferences AS w
  CROSS JOIN LATERAL unnest(w.regions) AS r(region)
  WHERE w.archived_at IS NULL
    AND w.week_start = date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh') + interval '1 day')::date - 1
  GROUP BY w.sport, w.day, w.period, r.region
  ORDER BY count(DISTINCT w.phone) DESC, w.sport, w.day, w.period, r.region;
$$;

CREATE OR REPLACE FUNCTION public.rush_vote_wish(
  p_name text, p_phone text, p_sport text, p_day text, p_period text, p_region text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE current_week date := date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh') + interval '1 day')::date - 1;
BEGIN
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 70
     OR p_phone IS NULL OR p_phone !~ '^05[0-9]{8}$'
     OR p_sport IS NULL OR p_sport NOT IN ('تنس ريشة', 'بادل', 'تنس')
     OR p_day IS NULL OR p_day NOT IN ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
     OR NOT public.rush_valid_wish_period(p_day, p_period)
     OR p_region IS NULL OR p_region NOT IN ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض') THEN
    RAISE EXCEPTION 'invalid wish' USING errcode = '22023';
  END IF;

  INSERT INTO public.preferences AS w (name, phone, sport, day, period, week_start, regions)
  VALUES (trim(p_name), p_phone, p_sport, p_day, p_period, current_week, ARRAY[p_region])
  ON CONFLICT (phone, sport, day, period, week_start) WHERE archived_at IS NULL
  DO UPDATE SET regions = ARRAY(SELECT DISTINCT r FROM unnest(w.regions || excluded.regions) AS r ORDER BY r);
END;
$$;

-- Give active votes their own uniqueness rule so an archived vote can stay intact.
CREATE UNIQUE INDEX IF NOT EXISTS rush_active_voter_idx
  ON public.preferences (phone, sport, day, period, week_start) WHERE archived_at IS NULL;
ALTER TABLE public.preferences DROP CONSTRAINT IF EXISTS preferences_phone_sport_day_period_week_start_key;

-- Keep older cached versions of the signup form compatible with the active index.
CREATE OR REPLACE FUNCTION public.save_preference(
  p_name text, p_phone text, p_sport text, p_day text, p_period text,
  p_week_start date, p_regions text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE region text;
BEGIN
  IF p_week_start IS DISTINCT FROM date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh') + interval '1 day')::date - 1
     OR p_regions IS NULL OR cardinality(p_regions) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'invalid preference' USING errcode = '22023';
  END IF;
  FOREACH region IN ARRAY p_regions LOOP
    PERFORM public.rush_vote_wish(p_name, p_phone, p_sport, p_day, p_period, region);
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.rush_wish_alerts (
  device_id uuid NOT NULL,
  sport text NOT NULL,
  day text NOT NULL,
  period text NOT NULL,
  region text NOT NULL,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, sport, day, period, region)
);
ALTER TABLE public.rush_wish_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rush_wish_alerts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rush_set_wish_alert(
  p_device_id uuid, p_sport text, p_day text, p_period text, p_region text, p_enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_device_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid alert' USING errcode = '22023';
  END IF;
  IF p_enabled THEN
    INSERT INTO public.rush_wish_alerts (device_id, sport, day, period, region)
    SELECT p_device_id, w.sport, w.day, w.period, w.region
    FROM public.rush_public_wishes() AS w
    WHERE (w.sport, w.day, w.period, w.region) = (p_sport, p_day, p_period, p_region)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.rush_wish_alerts
    WHERE (device_id, sport, day, period, region) = (p_device_id, p_sport, p_day, p_period, p_region);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rush_get_wish_alerts(p_device_id uuid)
RETURNS TABLE(sport text, day text, period text, region text, session_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT a.sport, a.day, a.period, a.region,
    ARRAY(
      SELECT s.id FROM public.public_sessions AS s
      CROSS JOIN LATERAL (SELECT s.starts_at AT TIME ZONE 'Asia/Riyadh' AS starts_local) AS local
      WHERE s.sport = a.sport AND s.region = a.region AND s.starts_at >= a.subscribed_at
        AND s.starts_at > now()
        AND a.day = (ARRAY['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from local.starts_local)::integer + 1]
        AND (a.period = '' OR
          CASE a.period
            WHEN '٨–١٠ صباحًا' THEN local.starts_local::time >= time '08:00' AND local.starts_local::time < time '10:00'
            WHEN '١٠–١٢ صباحًا' THEN local.starts_local::time >= time '10:00' AND local.starts_local::time < time '12:00'
            WHEN '٥–٧ مساءً' THEN local.starts_local::time >= time '17:00' AND local.starts_local::time < time '19:00'
            WHEN '٧–٩ مساءً' THEN local.starts_local::time >= time '19:00' AND local.starts_local::time < time '21:00'
            ELSE false
          END)
      ORDER BY s.starts_at
    )
  FROM public.rush_wish_alerts AS a WHERE a.device_id = p_device_id
  ORDER BY a.subscribed_at DESC;
$$;

REVOKE ALL ON FUNCTION public.rush_public_wishes(),
  public.rush_vote_wish(text,text,text,text,text,text),
  public.rush_set_wish_alert(uuid,text,text,text,text,boolean),
  public.rush_get_wish_alerts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_public_wishes(),
  public.rush_vote_wish(text,text,text,text,text,text),
  public.rush_set_wish_alert(uuid,text,text,text,text,boolean),
  public.rush_get_wish_alerts(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_session_registration(p_id uuid, p_name text, p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 70
     OR p_phone IS NULL OR p_phone !~ '^05[0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid player details' USING errcode = '22023';
  END IF;
  UPDATE public.registrations SET name = trim(p_name), phone = p_phone WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration not found' USING errcode = 'P0002'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_session_registration(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'admin only' USING errcode = '42501';
  END IF;
  -- Serialize cancellation with the capacity check in join_session.
  PERFORM 1 FROM public.sessions
  WHERE id = (SELECT session_id FROM public.registrations WHERE id = p_id)
  FOR UPDATE;
  DELETE FROM public.registrations WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration not found' USING errcode = 'P0002'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_session_registration(uuid,text,text),
  public.cancel_session_registration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_session_registration(uuid,text,text),
  public.cancel_session_registration(uuid) TO authenticated;

create or replace function public.update_preference(
  p_id uuid,p_name text,p_phone text,p_sport text,p_day text,p_period text,p_regions text[]
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() IS NOT TRUE then
    raise exception 'not authorized' using errcode='42501';
  end if;
  if length(trim(coalesce(p_name,''))) not between 1 and 70
    or p_phone is null or p_phone !~ '^05[0-9]{8}$'
    or p_sport is null or p_sport not in ('تنس ريشة','بادل','تنس')
    or p_day is null or p_day not in ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
    or not public.rush_valid_wish_period(p_day, p_period)
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

CREATE OR REPLACE FUNCTION public.edit_archived_preference(
 p_id uuid,p_phone text,p_sport text,p_day text,p_period text,p_regions text[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER set search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR public.is_admin() IS NOT TRUE THEN
  RAISE EXCEPTION 'admin only' USING errcode='42501';
 END IF;
 IF p_phone IS NULL OR p_phone !~ '^05[0-9]{8}$'
  OR p_sport IS NULL OR p_sport NOT IN ('تنس ريشة','بادل','تنس')
  OR p_day IS NULL OR p_day NOT IN ('الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت')
  OR not public.rush_valid_wish_period(p_day, p_period)
  OR p_regions IS NULL OR cardinality(p_regions)>5
  OR EXISTS(SELECT 1 FROM unnest(p_regions) AS r
      WHERE r IS NULL OR r NOT IN ('شمال الرياض','جنوب الرياض','شرق الرياض','غرب الرياض','وسط الرياض'))
 THEN RAISE EXCEPTION 'invalid archived preference' USING errcode='22023'; END IF;
 UPDATE public.archived_preferences
 SET phone=p_phone,sport=p_sport,day=p_day,period=p_period,regions=p_regions
 WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'archive record not found' USING errcode='P0002'; END IF;
END; $$;

SELECT public.cleanup_expired_data();
NOTIFY pgrst, 'reload schema';

COMMIT;
