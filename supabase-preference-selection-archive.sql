-- RUSH / 2026-11-12: select, delete, or archive wishes.
-- Run in the SAME Supabase project used by the website.
-- Safe to rerun. No wishes are deleted by running this migration.
BEGIN;

-- Archived wishes are keyed/grouped by phone, rather than trusting names.
-- An archived wish is NOT proof the player attended a game.
CREATE TABLE IF NOT EXISTS public.archived_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_preference_id uuid NOT NULL UNIQUE,
  phone text NOT NULL CHECK (phone ~ '^05[0-9]{8}$'),
  sport text NOT NULL,
  day text NOT NULL,
  period text NOT NULL,
  regions text[] NOT NULL DEFAULT '{}'::text[],
  week_start date NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archived_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read archived wishes" ON public.archived_preferences;
CREATE POLICY "admin read archived wishes" ON public.archived_preferences
  FOR SELECT TO authenticated USING (public.is_admin());
REVOKE ALL ON public.archived_preferences FROM anon, authenticated;
GRANT SELECT ON public.archived_preferences TO authenticated;

-- A single admin-only RPC for both operations. All-or-nothing transaction.
CREATE OR REPLACE FUNCTION public.manage_preferences(
  p_ids uuid[], p_action text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE affected integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin permission denied (check admin email configured in is_admin)'
      USING errcode='42501';
  END IF;
  IF p_action NOT IN ('archive','delete') OR p_ids IS NULL
     OR cardinality(p_ids) < 1 OR cardinality(p_ids) > 500 THEN
    RAISE EXCEPTION 'invalid action or selection' USING errcode='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(p_ids) v WHERE v IS NULL) THEN
    RAISE EXCEPTION 'invalid id' USING errcode='22023';
  END IF;

  -- Check exactly the selected unique IDs exist before mutating.
  IF (SELECT count(*) FROM public.preferences WHERE id = ANY(p_ids))
      <> (SELECT count(DISTINCT v) FROM unnest(p_ids) v) THEN
    RAISE EXCEPTION 'some preferences no longer exist; refresh and retry'
      USING errcode='P0002';
  END IF;

  IF p_action='archive' THEN
    INSERT INTO public.archived_preferences (
      source_preference_id, phone, sport, day, period, regions, week_start
    )
    SELECT id, phone, sport, day, period, regions, week_start
    FROM public.preferences WHERE id=ANY(p_ids)
    ON CONFLICT (source_preference_id) DO NOTHING;
  END IF;

  DELETE FROM public.preferences WHERE id=ANY(p_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
REVOKE ALL ON FUNCTION public.manage_preferences(uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_preferences(uuid[],text) TO authenticated;

CREATE INDEX IF NOT EXISTS archived_preferences_phone_idx
ON public.archived_preferences(phone,archived_at DESC);

COMMIT;

-- TROUBLESHOOT (optional; read-only):
-- SELECT pg_get_functiondef('public.is_admin()'::regprocedure);
-- Confirm that the email embedded in is_admin matches your Supabase Authentication admin user's email.
