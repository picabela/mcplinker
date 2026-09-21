-- Existing grants retain selected-brand access. Apply before deploying the app.
alter table public.oauth_codes add column if not exists all_brands boolean not null default false;
alter table public.oauth_grants add column if not exists all_brands boolean not null default false;
notify pgrst, 'reload schema';
