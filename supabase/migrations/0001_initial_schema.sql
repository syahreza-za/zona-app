-- ZONA Initial Schema: WhatsApp Fast Chat × Discord Circles & Voice × Snapchat Live Map
-- Requires PostgreSQL 15+ with PostGIS enabled.

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- 1. Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  display_name text not null,
  avatar_url text,
  avatar_color text not null default '#FACC15',
  status_emoji text not null default '⚡',
  status_text text not null default '',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 2. Circles (Discord Lite Spaces)
create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null check (char_length(short_code) between 1 and 3),
  invite_code text unique not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  share_map_here boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

-- 3. Channels (DM, Text Topic, Ephemeral Hangout)
create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid references public.circles (id) on delete cascade,
  type text not null check (type in ('dm', 'text', 'hangout')),
  name text not null,
  topic text,
  is_ephemeral boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- 4. Messages (Text, Voice Note, Quick Snap 24h, Hangout RSVP Card)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  reply_to_id uuid references public.messages (id) on delete set null,
  msg_type text not null default 'text' check (msg_type in ('text', 'voice_note', 'quick_snap', 'hangout_card')),
  content text not null,
  media_url text,
  voice_duration_sec integer,
  snap_view_once boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_channel_created on public.messages (channel_id, created_at desc);

-- 5. User Locations (PostGIS + Server-Enforced Privacy Modes)
create table if not exists public.user_locations (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  point geography(Point, 4326) not null,
  privacy_mode text not null default 'fuzzy' check (privacy_mode in ('exact', 'fuzzy', 'ghost')),
  area_label text not null default '',
  activity_emoji text not null default '⚡',
  activity_text text not null default '',
  battery_pct smallint not null default 100 check (battery_pct between 0 and 100),
  is_moving boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_locations_geo on public.user_locations using gist (point);

-- 6. Hangout Pins ("Ajak Kumpul" Map-to-Channel Bridge)
create table if not exists public.hangout_pins (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  place_name text not null,
  point geography(Point, 4326) not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now()
);

create table if not exists public.hangout_rsvps (
  pin_id uuid not null references public.hangout_pins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('going', 'otw', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (pin_id, user_id)
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;
alter table public.user_locations enable row level security;
alter table public.hangout_pins enable row level security;
alter table public.hangout_rsvps enable row level security;

create policy "profiles_read_authenticated" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id);

create policy "circles_read_member" on public.circles
  for select to authenticated using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_id = circles.id and cm.user_id = auth.uid()
    )
  );

create policy "circle_members_read_peer" on public.circle_members
  for select to authenticated using (
    exists (
      select 1 from public.circle_members self_cm
      where self_cm.circle_id = circle_members.circle_id and self_cm.user_id = auth.uid()
    )
  );

create policy "channels_read_member" on public.channels
  for select to authenticated using (
    circle_id is not null and exists (
      select 1 from public.circle_members cm
      where cm.circle_id = channels.circle_id and cm.user_id = auth.uid()
    )
  );

create policy "messages_read_member" on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.channels ch
      join public.circle_members cm on cm.circle_id = ch.circle_id
      where ch.id = messages.channel_id and cm.user_id = auth.uid()
    )
  );

create policy "messages_insert_member" on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid() and exists (
      select 1 from public.channels ch
      join public.circle_members cm on cm.circle_id = ch.circle_id
      where ch.id = messages.channel_id and cm.user_id = auth.uid()
    )
  );

-- Direct reads of user_locations are restricted to own row ONLY.
-- Peers MUST read via get_circle_map_members() RPC so ghost/fuzzy rules are enforced server-side.
create policy "locations_own_only" on public.user_locations
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "hangout_pins_read_member" on public.hangout_pins
  for select to authenticated using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_id = hangout_pins.circle_id and cm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- SERVER-SIDE PRIVACY RPC: get_circle_map_members
-- =============================================================================
create or replace function public.get_circle_map_members(p_circle_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_color text,
  privacy_mode text,
  lat double precision,
  lng double precision,
  area_label text,
  activity_emoji text,
  activity_text text,
  battery_pct smallint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hour_bucket bigint := floor(extract(epoch from now()) / 3600);
begin
  if not exists (
    select 1 from public.circle_members cm
    where cm.circle_id = p_circle_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this circle';
  end if;

  return query
  select
    ul.user_id,
    p.display_name,
    p.avatar_color,
    ul.privacy_mode,
    case
      when ul.privacy_mode = 'exact' then st_y(ul.point::geometry)
      else st_y(
        st_project(
          ul.point,
          300 + (abs(hashtext(ul.user_id::text || ':' || v_hour_bucket::text)) % 251),
          radians(abs(hashtext(ul.user_id::text || ':az:' || v_hour_bucket::text)) % 360)
        )::geometry
      )
    end as lat,
    case
      when ul.privacy_mode = 'exact' then st_x(ul.point::geometry)
      else st_x(
        st_project(
          ul.point,
          300 + (abs(hashtext(ul.user_id::text || ':' || v_hour_bucket::text)) % 251),
          radians(abs(hashtext(ul.user_id::text || ':az:' || v_hour_bucket::text)) % 360)
        )::geometry
      )
    end as lng,
    ul.area_label,
    ul.activity_emoji,
    ul.activity_text,
    ul.battery_pct,
    ul.updated_at
  from public.user_locations ul
  join public.circle_members cm on cm.user_id = ul.user_id and cm.circle_id = p_circle_id
  join public.profiles p on p.id = ul.user_id
  where cm.share_map_here = true
    and ul.privacy_mode <> 'ghost';
end;
$$;

-- =============================================================================
-- ATOMIC MAP-TO-CHANNEL RPC: create_hangout_pin
-- =============================================================================
create or replace function public.create_hangout_pin(
  p_circle_id uuid,
  p_title text,
  p_place_name text,
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  v_pin_id uuid;
  v_slug text;
begin
  if not exists (
    select 1 from public.circle_members cm
    where cm.circle_id = p_circle_id and cm.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this circle';
  end if;

  v_slug := regexp_replace(lower(trim(p_place_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := left(coalesce(nullif(v_slug, ''), 'kumpul-baru'), 24);

  insert into public.channels (circle_id, type, name, topic, is_ephemeral, expires_at)
  values (p_circle_id, 'hangout', v_slug, 'Pin Ajak Kumpul — ' || p_place_name, true, now() + interval '12 hours')
  returning id into v_channel_id;

  insert into public.hangout_pins (circle_id, channel_id, creator_id, title, place_name, point)
  values (
    p_circle_id,
    v_channel_id,
    auth.uid(),
    p_title,
    p_place_name,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
  )
  returning id into v_pin_id;

  insert into public.hangout_rsvps (pin_id, user_id, status)
  values (v_pin_id, auth.uid(), 'going');

  insert into public.messages (channel_id, sender_id, msg_type, content)
  values (v_channel_id, auth.uid(), 'hangout_card', 'Ajak Kumpul di ' || p_place_name || ' — ' || p_title);

  return jsonb_build_object('pin_id', v_pin_id, 'channel_id', v_channel_id);
end;
$$;
