BEGIN;

CREATE OR REPLACE FUNCTION public.rush_weekly_play_options()
RETURNS TABLE(sport text, day text, period text, regions text[], player_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT w.sport, w.day, w.period,
    coalesce(array_agg(DISTINCT r.region ORDER BY r.region)
      FILTER (WHERE r.region IS NOT NULL), ARRAY[]::text[]),
    count(DISTINCT w.phone)
  FROM public.preferences AS w
  LEFT JOIN LATERAL unnest(w.regions) AS r(region) ON true
  WHERE w.archived_at IS NULL
    AND w.week_start = date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh') + interval '1 day')::date - 1
  GROUP BY w.sport, w.day, w.period;
$$;

REVOKE ALL ON FUNCTION public.rush_weekly_play_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rush_weekly_play_options() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
