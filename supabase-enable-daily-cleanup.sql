-- Rush automatic cleanup (run AFTER supabase-migration-regions-prices-cleanup.sql).
-- Requires pg_cron enabled in Supabase. Job is scheduled daily at 00:10 Riyadh (21:10 UTC).
-- Runs under the SQL Editor / cron owner (typically postgres).
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'rush-cleanup-after-riyadh-midnight',
  '10 21 * * *',
  'select public.cleanup_expired_data();'
);
-- Optional: check it was scheduled:
select jobid, jobname, schedule, active from cron.job
where jobname='rush-cleanup-after-riyadh-midnight';
