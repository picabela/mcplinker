-- Add channels without changing existing account permissions or records.
alter table public.connections drop constraint connections_platform_check;
alter table public.connections add constraint connections_platform_check
 check (platform in ('facebook','linkedin','wordpress','instagram','telegram','mastodon'));
