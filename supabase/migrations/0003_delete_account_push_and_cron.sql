-- ZONA Migration 0003: Permanent Account Deletion RPC, Push Tokens, & 24h Ephemeral Cleanup (pg_cron)

-- 1. Push Notification Tokens (FCM Android, APNs iOS, Web Push, Tauri Native)
create table if not exists public.push_tokens (
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android', 'desktop')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens_own_manage" on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Message Edit & Soft Delete Support
alter table public.messages
  add column if not exists edited_at timestamptz,
  add column if not exists is_deleted boolean not null default false;

create policy "messages_update_own" on public.messages
  for update to authenticated using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- 3. Permanent Self-Service Account Deletion (Apple App Store & Google Play Mandatory)
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
end;
$$;

-- 4. Automatic 24-hour Quick Snap & Ephemeral Hangout Cleanup
create or replace function public.cleanup_expired_zona_content()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.messages
  where expires_at is not null and expires_at < now();

  delete from public.hangout_pins
  where expires_at < now();

  delete from public.channels
  where is_ephemeral = true and expires_at is not null and expires_at < now();
end;
$$;

-- Schedule hourly cleanup when pg_cron is enabled on Supabase
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'zona-cleanup-ephemeral-hourly',
      '0 * * * *',
      'select public.cleanup_expired_zona_content();'
    );
  end if;
exception when others then
  -- pg_cron may not be available in local test databases
  null;
end;
$$;
