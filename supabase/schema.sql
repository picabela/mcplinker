-- SocialPilot MCP: service-mediated access plus defense-in-depth RLS.
create extension if not exists pgcrypto;
create table public.brands (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120), color text not null default '#c9fa75',
 website text, voice text not null default '', timezone text not null default 'Europe/Warsaw',
 publish_policy text not null default 'approval' check(publish_policy in ('approval','automatic')),
 created_at timestamptz not null default now(), unique(id,owner_id)
);
create table public.connections (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id uuid not null, platform text not null check(platform in ('facebook','linkedin','wordpress')),
 name text not null, external_id text not null, base_url text, credentials text not null,
 scopes text[] not null default '{}', status text not null default 'connected', expires_at timestamptz,
 last_checked_at timestamptz, created_at timestamptz not null default now(),
 unique(id,brand_id,owner_id), unique(owner_id,brand_id,platform,external_id),
 foreign key(brand_id,owner_id) references public.brands(id,owner_id) on delete cascade
);
create table public.posts (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id uuid not null, connection_id uuid not null, title text not null default '', content text not null default '',
 payload jsonb not null default '{}', status text not null default 'draft' check(status in ('draft','approval','scheduled','processing','published','failed','uncertain','cancelled')),
 scheduled_at timestamptz, approved_at timestamptz, approved_by uuid references auth.users(id),
 external_id text, external_url text, error text, attempts integer not null default 0,
 lock_token uuid, locked_at timestamptz, dedupe_key text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,dedupe_key), unique(id,owner_id),
 foreign key(connection_id,brand_id,owner_id) references public.connections(id,brand_id,owner_id) on delete cascade,
 foreign key(brand_id,owner_id) references public.brands(id,owner_id) on delete cascade
);
create index posts_due on public.posts(scheduled_at) where status='scheduled';
create index posts_owner on public.posts(owner_id,created_at desc);
create index connections_owner on public.connections(owner_id,brand_id);
create table public.assets (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id uuid not null, name text not null, url text not null, mime_type text not null default 'image/jpeg', alt text not null default '',
 created_at timestamptz not null default now(), foreign key(brand_id,owner_id) references public.brands(id,owner_id) on delete cascade
);
create table public.automations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id uuid not null, name text not null, kind text not null check(kind in ('rss_to_draft','wordpress_to_social')),
 config jsonb not null, enabled boolean not null default false, last_run_at timestamptz, next_run_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, last_error text, created_at timestamptz not null default now(),
 foreign key(brand_id,owner_id) references public.brands(id,owner_id) on delete cascade
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 brand_id uuid, actor text not null, action text not null, result text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_owner on public.audit_log(owner_id,created_at desc);
create table public.api_keys (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null, token_hash text not null unique, prefix text not null, scopes text[] not null,
 brand_ids uuid[] not null, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.provider_apps (
 owner_id uuid not null references auth.users(id) on delete cascade, platform text not null, encrypted_config text not null,
 primary key(owner_id,platform)
);
create table public.oauth_states (
 state_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade, brand_id uuid not null,
 platform text not null, expires_at timestamptz not null, consumed_at timestamptz,
 foreign key(brand_id,owner_id) references public.brands(id,owner_id) on delete cascade
);
create table public.oauth_clients (
 client_id uuid primary key default gen_random_uuid(), client_name text not null, redirect_uris text[] not null, created_at timestamptz not null default now()
);
create table public.oauth_codes (
 code_hash text primary key, client_id uuid not null references public.oauth_clients(client_id),
 owner_id uuid not null references auth.users(id) on delete cascade, redirect_uri text not null, challenge text not null, resource text not null,
 scopes text[] not null, brand_ids uuid[] not null, all_brands boolean not null default false, expires_at timestamptz not null, consumed_at timestamptz
);
create table public.oauth_grants (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 client_id uuid not null references public.oauth_clients(client_id), access_hash text not null unique, refresh_hash text not null unique,
 resource text not null, scopes text[] not null, brand_ids uuid[] not null, all_brands boolean not null default false, expires_at timestamptz not null, refresh_expires_at timestamptz not null,
 revoked_at timestamptz, created_at timestamptz not null default now()
);
create table public.rate_buckets (key text primary key, hits integer not null, reset_at timestamptz not null);
-- User-scoped read policies. Writes go through validated server operations.
do $$ declare t text; begin
 foreach t in array array['brands','connections','posts','assets','automations','audit_log','api_keys','provider_apps','oauth_states','oauth_codes','oauth_grants','oauth_clients','rate_buckets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['brands','posts','assets','automations','audit_log'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy owner_select on public.%I for select to authenticated using ((select auth.uid())=owner_id)',t);
 end loop;
end $$;
-- These invoker functions are executable only by the server role.
create function public.claim_posts(batch_size integer default 10) returns setof public.posts language plpgsql set search_path=public,pg_temp as $$
begin
 update public.posts set status='uncertain', error='Przerwane wykonanie. Sprawdź platformę przed ponowieniem.' where status='processing' and locked_at < now()-interval '10 minutes';
 return query with due as (select id from public.posts where status='scheduled' and scheduled_at<=now() order by scheduled_at for update skip locked limit least(greatest(batch_size,1),20))
 update public.posts p set status='processing', lock_token=gen_random_uuid(), locked_at=now(), attempts=attempts+1, updated_at=now() from due where p.id=due.id returning p.*;
end $$;
create function public.consume_oauth_code(p_hash text,p_client uuid,p_redirect text,p_challenge text,p_resource text) returns setof public.oauth_codes language sql set search_path=public,pg_temp as $$
 update public.oauth_codes set consumed_at=now() where code_hash=p_hash and client_id=p_client and redirect_uri=p_redirect and challenge=p_challenge and resource=p_resource and consumed_at is null and expires_at>now() returning *;
$$;
create function public.rotate_oauth_token(p_hash text,p_client uuid,p_resource text,p_access text,p_refresh text) returns setof public.oauth_grants language sql set search_path=public,pg_temp as $$
 update public.oauth_grants set access_hash=p_access,refresh_hash=p_refresh,expires_at=now()+interval '1 hour' where refresh_hash=p_hash and client_id=p_client and resource=p_resource and revoked_at is null and refresh_expires_at>now() returning *;
$$;
create function public.consume_provider_state(p_hash text,p_owner uuid,p_platform text) returns setof public.oauth_states language sql set search_path=public,pg_temp as $$
 update public.oauth_states set consumed_at=now() where state_hash=p_hash and owner_id=p_owner and platform=p_platform and consumed_at is null and expires_at>now() returning *;
$$;
create function public.take_rate(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql set search_path=public,pg_temp as $$
declare c integer; begin
 insert into public.rate_buckets(key,hits,reset_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when rate_buckets.reset_at<=now() then 1 else rate_buckets.hits+1 end,reset_at=case when rate_buckets.reset_at<=now() then now()+make_interval(secs=>p_seconds) else rate_buckets.reset_at end returning hits into c;
 return c<=p_limit;
end $$;
create function public.claim_automations() returns setof public.automations language sql set search_path=public,pg_temp as $$
 with due as (select id from public.automations where enabled and next_run_at<=now() and (lease_until is null or lease_until<now()) for update skip locked limit 5)
 update public.automations a set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' from due where a.id=due.id returning a.*;
$$;
revoke all on function public.claim_posts(integer),public.consume_oauth_code(text,uuid,text,text,text),public.rotate_oauth_token(text,uuid,text,text,text),public.consume_provider_state(text,uuid,text),public.take_rate(text,integer,integer),public.claim_automations() from public,anon,authenticated;
grant execute on function public.claim_posts(integer),public.consume_oauth_code(text,uuid,text,text,text),public.rotate_oauth_token(text,uuid,text,text,text),public.consume_provider_state(text,uuid,text),public.take_rate(text,integer,integer),public.claim_automations() to service_role;

