-- Rush: optional map URL for each game (safe, additive migration).
-- Run once in the EXISTING Supabase project; does not delete or modify existing bookings.
BEGIN;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS location_url text;

-- Keep existing public_sessions columns, in their current order, and append location_url.
-- In this Rush version the existing view has:
-- id, sport, venue, starts_at, ends_at, capacity, price, region.
CREATE OR REPLACE VIEW public.public_sessions
WITH (security_invoker = false) AS
SELECT id, sport, venue, starts_at, ends_at, capacity, price, region, location_url
FROM public.sessions
WHERE ends_at > now();

GRANT SELECT ON public.public_sessions TO anon, authenticated;
COMMIT;

-- Existing location_url values remain NULL until edited by the admin.
