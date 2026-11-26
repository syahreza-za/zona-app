-- ZONA Migration 0002: Storage Bucket, Invite Join RPC, Safety (Block/Report), & Account Deletion

-- 1. Reactions & Read Receipts
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- 2. Safety & Store Compliance (Apple App Store & Google Play Requirement)
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_message_id uuid references public.messages (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table public.message_reactions enable row level security;
alter table public.blocked_users enable row level security;
alter table public.moderation_reports enable row level security;

create policy "reactions_member_read" on public.message_reactions
  for select to authenticated using (true);

create policy "reactions_own_write" on public.message_reactions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "blocked_own_manage" on public.blocked_users
  for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "reports_own_insert" on public.moderation_reports
  for insert to authenticated with check (reporter_id = auth.uid());

-- 3. Join Circle via Invite Code RPC
create or replace function public.join_circle_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_id uuid;
begin
  select id into v_circle_id
  from public.circles
  where upper(invite_code) = upper(trim(p_invite_code))
  limit 1;

  if v_circle_id is null then
    raise exception 'Kode undangan Circle tidak ditemukan';
  end if;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle_id, auth.uid(), 'member')
  on conflict (circle_id, user_id) do nothing;

  return v_circle_id;
end;
$$;

-- 4. Create Circle + Default Channels Atomic RPC
create or replace function public.create_circle_with_defaults(
  p_name text,
  p_short_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_circle_id uuid;
  v_invite text;
  v_default_ch uuid;
begin
  v_invite := 'ZONA-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.circles (name, short_code, invite_code, owner_id)
  values (trim(p_name), upper(left(trim(p_short_code), 2)), v_invite, auth.uid())
  returning id into v_circle_id;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_circle_id, auth.uid(), 'owner');

  insert into public.channels (circle_id, type, name, topic)
  values (v_circle_id, 'text', 'obrolan', 'Obrolan santai harian')
  returning id into v_default_ch;

  insert into public.channels (circle_id, type, name, topic)
  values (v_circle_id, 'text', 'galeri-snap', 'Foto spontan & Quick Snap 24 jam');

  return jsonb_build_object(
    'circle_id', v_circle_id,
    'invite_code', v_invite,
    'default_channel_id', v_default_ch
  );
end;
$$;

-- 5. Storage Bucket for Voice Notes & Quick Snaps
insert into storage.buckets (id, name, public)
values ('zona-media', 'zona-media', false)
on conflict (id) do nothing;

create policy "zona_media_auth_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'zona-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "zona_media_auth_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'zona-media');
