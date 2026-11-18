BEGIN;

ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS payment_instructions_en text;

CREATE OR REPLACE VIEW public.public_site_settings AS
SELECT id, group_url, payment_instructions, payment_instructions_en
FROM public.site_settings WHERE id = 1;

CREATE OR REPLACE VIEW public.session_counts AS
SELECT s.id AS session_id, count(r.id)::integer AS registered_count
FROM public.sessions AS s
LEFT JOIN public.registrations AS r ON r.session_id = s.id
WHERE s.ends_at > now()
GROUP BY s.id;

NOTIFY pgrst, 'reload schema';

COMMIT;
