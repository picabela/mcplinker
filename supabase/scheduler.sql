-- Optional scheduler for this deployment. Apply after schema.sql.
-- First add the exact Vercel CRON_SECRET to Supabase Vault as
-- mcplinker_cron_secret. Never put its value in this file or Git.
-- Change the URL below when deploying to a different domain.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
-- Request headers contain the worker secret. Keep the net schema out of
-- the Data API's Exposed schemas and GraphQL search path. Supabase owns
-- these extension tables, so postgres cannot change their default grants.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'mcplinker-worker-minute',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://mcplinker.vercel.app/api/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || s.decrypted_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  from vault.decrypted_secrets s
  where s.name = 'mcplinker_cron_secret'
    and (
      exists (select 1 from public.posts
        where status = 'scheduled' and scheduled_at <= now())
      or exists (select 1 from public.posts
        where status = 'processing' and locked_at < now() - interval '10 minutes')
      or exists (select 1 from public.automations
        where enabled and next_run_at <= now()
          and (lease_until is null or lease_until < now()))
    );
  $job$
);

-- Keep job history bounded. HTTP responses expire automatically in pg_net.
select cron.schedule(
  'mcplinker-cron-history-cleanup',
  '17 3 * * *',
  $job$
  delete from cron.job_run_details
  where jobid in (select jobid from cron.job
    where jobname in ('mcplinker-worker-minute', 'mcplinker-cron-history-cleanup'))
    and end_time < now() - interval '7 days';
  $job$
);
