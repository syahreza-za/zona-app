-- ZONA Migration 0004: Fix Circle RLS Infinite Recursion, Missing Insert/RSVP Policies,
-- Auto-Profile Trigger for Google/Apple OAuth, & Idempotent Supabase Realtime Publication

-- =============================================================================
-- 1. SECURITY DEFINER Helper to Prevent RLS Infinite Recursion on circle_members
-- =============================================================================
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.circle_members
    where circle_id = p_circle_id
      and user_id = auth.uid()
  );
$$;

grant execute on function public.is_circle_member(uuid) to authenticated;

-- Replace recursive circle_members SELECT policy
drop policy if exists "circle_members_read_peer" on public.circle_members;
create policy "circle_members_read_peer" on public.circle_members
  for select to authenticated
  using (public.is_circle_member(circle_id));

-- =============================================================================
-- 2. Profiles Insert Policy + Auto-Profile Trigger for Google / Apple OAuth Users
-- =============================================================================
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text;
  v_base_user text;
  v_username text;
  v_avatar text;
begin
  v_display := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna ZONA'
  );

  v_base_user := regexp_replace(
    lower(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      v_display
    )),
    '[^a-z0-9._-]',
    '',
    'g'
  );
  if char_length(v_base_user) < 3 then
    v_base_user := 'zona' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  v_base_user := left(v_base_user, 17);
  v_username := v_base_user;

  -- Guarantee uniqueness within 3..24 char constraint
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := left(v_base_user, 17) || '_' || substr(replace(new.id::text, '-', ''), 1, 5);
  end if;

  v_avatar := nullif(trim(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture',
    ''
  )), '');

  insert into public.profiles (id, username, display_name, avatar_url, avatar_color, status_emoji, status_text)
  values (new.id, v_username, v_display, v_avatar, '#10B981', '☕', '')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- =============================================================================
-- 3. Missing Channels INSERT Policy & Hangout RSVPs SELECT / INSERT / UPDATE Policies
-- =============================================================================
drop policy if exists "channels_insert_member" on public.channels;
create policy "channels_insert_member" on public.channels
  for insert to authenticated
  with check (circle_id is not null and public.is_circle_member(circle_id));

drop policy if exists "hangout_rsvps_read_member" on public.hangout_rsvps;
create policy "hangout_rsvps_read_member" on public.hangout_rsvps
  for select to authenticated
  using (
    exists (
      select 1 from public.hangout_pins hp
      where hp.id = hangout_rsvps.pin_id
        and public.is_circle_member(hp.circle_id)
    )
  );

drop policy if exists "hangout_rsvps_write_own" on public.hangout_rsvps;
drop policy if exists "hangout_rsvps_insert_own" on public.hangout_rsvps;
drop policy if exists "hangout_rsvps_update_own" on public.hangout_rsvps;

create policy "hangout_rsvps_write_own" on public.hangout_rsvps
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.hangout_pins hp
      where hp.id = hangout_rsvps.pin_id
        and public.is_circle_member(hp.circle_id)
    )
  );

create policy "hangout_rsvps_update_own" on public.hangout_rsvps
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.hangout_pins hp
      where hp.id = hangout_rsvps.pin_id
        and public.is_circle_member(hp.circle_id)
    )
  );

-- =============================================================================
-- 4. Enable Supabase Realtime Publication Idempotently
-- =============================================================================
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.channels;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.hangout_pins;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.hangout_rsvps;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
