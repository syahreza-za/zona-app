import type {
  Channel,
  Circle,
  CircleBannerStyle,
  CircleRole,
  Coordinates,
  HangoutCategory,
  HangoutPin,
  Message,
  MessageReaction,
  OutboxRecord,
  PrivacyMode,
  Profile,
  RsvpStatus,
  UserLocation,
} from '../types';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string | undefined | null): boolean {
  return Boolean(value && UUID_REGEX.test(value));
}

export function createClientUuid(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ZN';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const CIRCLE_PALETTES: Array<{ accentColor: string; bannerStyle: CircleBannerStyle }> = [
  { accentColor: '#10B981', bannerStyle: 'emerald' },
  { accentColor: '#0EA5E9', bannerStyle: 'sky' },
  { accentColor: '#D97706', bannerStyle: 'amber' },
  { accentColor: '#EA580C', bannerStyle: 'coral' },
  { accentColor: '#0D9488', bannerStyle: 'teal' },
];

export function inferHangoutCategoryFromText(text: string): HangoutCategory {
  const lower = text.toLowerCase();
  if (/kopi|coffee|cafe|kafe|matcha|tuku/.test(lower)) return 'coffee';
  if (/makan|gultik|ramen|bakmi|dinner|kuliner|sate|sushi/.test(lower)) return 'food';
  if (/lari|padel|futsal|gym|badminton|sepeda|olahraga|gbk/.test(lower)) return 'sport';
  if (/mabar|game|rank|ps|billiard|bioskop|nonton/.test(lower)) return 'gaming';
  return 'coffee';
}

/**
 * Converts a browser/mobile `data:<mime>;base64,...` URL into a real Blob + file extension
 * ready for upload to the Supabase `zona-media` Storage bucket.
 */
function decodeBase64Pure(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/=]/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  const bytes = new Uint8Array(outLen);
  let outIdx = 0;

  for (let i = 0; i < clean.length; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = clean[i + 2] === '=' ? 0 : chars.indexOf(clean[i + 2]);
    const d = clean[i + 3] === '=' ? 0 : chars.indexOf(clean[i + 3]);
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    if (outIdx < outLen) bytes[outIdx++] = (triple >> 16) & 255;
    if (outIdx < outLen) bytes[outIdx++] = (triple >> 8) & 255;
    if (outIdx < outLen) bytes[outIdx++] = triple & 255;
  }
  return bytes;
}

export function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  if (!dataUrl.startsWith('data:')) return null;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;

  const header = dataUrl.slice(5, commaIdx);
  const payload = dataUrl.slice(commaIdx + 1);
  const mime = header.split(';')[0] || 'application/octet-stream';
  const isBase64 = header.includes(';base64');

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
  };
  const ext = extMap[mime] || mime.split('/')[1]?.split('+')[0] || 'bin';

  try {
    let bytes: Uint8Array;
    if (isBase64) {
      if (typeof atob === 'function') {
        const binary = atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
      } else {
        bytes = decodeBase64Pure(payload);
      }
    } else {
      const decoded = decodeURIComponent(payload);
      bytes = new TextEncoder().encode(decoded);
    }
    return { blob: new Blob([bytes as unknown as BlobPart], { type: mime }), ext };
  } catch {
    return null;
  }
}

export function mapDbProfileToProfile(row: Record<string, unknown>, idx = 0): Profile {
  const displayName = String(row.display_name ?? row.username ?? 'Anggota');
  const lastSeenAt = String(row.last_seen_at ?? new Date().toISOString());
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();

  return {
    id: String(row.id),
    username: String(row.username ?? 'anggota'),
    displayName,
    initials: makeInitials(displayName),
    avatarColor: String(row.avatar_color ?? '#10B981'),
    avatarVariant: idx % 6,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    statusEmoji: String(row.status_emoji ?? '☕'),
    statusText: String(row.status_text ?? ''),
    isOnline: Number.isFinite(ageMs) ? ageMs < 5 * 60_000 : true,
    lastSeenAt,
  };
}

export function mapDbCircleToCircle(
  row: Record<string, unknown>,
  members: Array<{ user_id: string; role: string }>,
  idx = 0
): Circle {
  const palette = CIRCLE_PALETTES[idx % CIRCLE_PALETTES.length];
  const memberIds = members.map((m) => String(m.user_id));
  const memberRoles: Record<string, CircleRole> = {};
  members.forEach((m) => {
    const role = m.role === 'owner' || m.role === 'admin' ? m.role : 'member';
    memberRoles[String(m.user_id)] = role;
  });

  return {
    id: String(row.id),
    name: String(row.name ?? 'Circle'),
    shortCode: String(row.short_code ?? makeInitials(String(row.name ?? 'ZN'))).slice(0, 2).toUpperCase(),
    accentColor: palette.accentColor,
    bannerStyle: palette.bannerStyle,
    inviteCode: String(row.invite_code ?? ''),
    description: 'Circle pertemanan dekat',
    memberIds,
    memberRoles,
  };
}

export function mapDbChannelToChannel(row: Record<string, unknown>): Channel {
  const typeRaw = String(row.type ?? 'text');
  const type: Channel['type'] =
    typeRaw === 'dm' || typeRaw === 'hangout' ? typeRaw : 'text';

  return {
    id: String(row.id),
    circleId: row.circle_id ? String(row.circle_id) : null,
    type,
    name: String(row.name ?? 'obrolan'),
    topic: row.topic ? String(row.topic) : undefined,
    unreadCount: 0,
    isEphemeral: Boolean(row.is_ephemeral),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
  };
}

export function mapDbMessageToMessage(
  row: Record<string, unknown>,
  reactions: MessageReaction[] = [],
  hangoutPinId?: string
): Message {
  const typeRaw = String(row.msg_type ?? 'text');
  const type: Message['type'] =
    typeRaw === 'voice_note' || typeRaw === 'quick_snap' || typeRaw === 'hangout_card'
      ? typeRaw
      : 'text';
  const mediaUrl = row.media_url ? String(row.media_url) : undefined;
  const content = String(row.content ?? '');

  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    senderId: String(row.sender_id),
    type,
    content,
    replyToId: row.reply_to_id ? String(row.reply_to_id) : undefined,
    editedAt: row.edited_at ? String(row.edited_at) : undefined,
    isDeleted: Boolean(row.is_deleted),
    voiceDurationSec:
      typeof row.voice_duration_sec === 'number' ? row.voice_duration_sec : undefined,
    audioUrl: type === 'voice_note' ? mediaUrl : undefined,
    mediaUrl: type === 'quick_snap' ? mediaUrl : undefined,
    snapCaption: type === 'quick_snap' ? content : undefined,
    snapGradient:
      type === 'quick_snap'
        ? 'linear-gradient(150deg, #1E293B 0%, #334155 50%, #0F766E 100%)'
        : undefined,
    snapViewOnce: Boolean(row.snap_view_once),
    snapViewedBy: [],
    hangoutPinId,
    reactions,
    status: 'delivered',
    createdAt: String(row.created_at ?? new Date().toISOString()),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
  };
}

export function parsePostgisPoint(raw: unknown): Coordinates {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      return { lat: Number(obj.coordinates[1]), lng: Number(obj.coordinates[0]) };
    }
    if (typeof obj.lat === 'number' && typeof obj.lng === 'number') {
      return { lat: obj.lat, lng: obj.lng };
    }
  }
  if (typeof raw === 'string') {
    const match = raw.match(/POINT\s*\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/i);
    if (match) {
      return { lng: Number(match[1]), lat: Number(match[2]) };
    }
  }
  return { lat: -6.2442, lng: 106.8006 };
}

export function mapDbPinToHangoutPin(
  row: Record<string, unknown>,
  rsvps: Array<{ userId: string; status: RsvpStatus; etaMinutes?: number }> = []
): HangoutPin {
  const title = String(row.title ?? 'Ajak Kumpul');
  const placeName = String(row.place_name ?? 'Titik Kumpul');
  const startsAt = row.starts_at ? new Date(String(row.starts_at)) : new Date();
  const startsAtLabel = Number.isNaN(startsAt.getTime())
    ? 'Hari ini · Segera'
    : `Hari ini · ${startsAt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      })} WIB`;

  return {
    id: String(row.id),
    circleId: String(row.circle_id),
    channelId: String(row.channel_id),
    creatorId: String(row.creator_id),
    title,
    placeName,
    category: inferHangoutCategoryFromText(`${title} ${placeName}`),
    point: parsePostgisPoint(row.point),
    startsAtLabel,
    rsvps,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    expiresAt: String(row.expires_at ?? new Date(Date.now() + 12 * 3_600_000).toISOString()),
  };
}

export function mapMapMemberToLocation(row: Record<string, unknown>): UserLocation {
  const modeRaw = String(row.privacy_mode ?? 'fuzzy');
  const privacyMode: PrivacyMode =
    modeRaw === 'exact' || modeRaw === 'ghost' ? modeRaw : 'fuzzy';

  return {
    userId: String(row.user_id),
    point: {
      lat: Number(row.lat ?? -6.2442),
      lng: Number(row.lng ?? 106.8006),
    },
    privacyMode,
    areaLabel: String(row.area_label ?? ''),
    activityEmoji: String(row.activity_emoji ?? '☕'),
    activityText: String(row.activity_text ?? ''),
    batteryPct: typeof row.battery_pct === 'number' ? row.battery_pct : 85,
    isMoving: false,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export interface CloudOutboxAdapter {
  uploadMediaBlob: (userId: string, blob: Blob, ext: string) => Promise<string>;
  sendMessage: (msg: Message) => Promise<void>;
}

export interface OutboxFlushResult {
  syncedIds: string[];
  failedIds: string[];
  updatedMediaUrls: Record<string, { mediaUrl?: string; audioUrl?: string }>;
}

/**
 * Flushes offline-queued outbox messages to Supabase Cloud with media upload & retry isolation.
 * Failed records remain safely queued so the next online event retries them without data loss.
 */
export async function flushCloudOutbox(options: {
  outbox: OutboxRecord[];
  messages: Message[];
  adapter: CloudOutboxAdapter;
  maxRetriesPerItem?: number;
}): Promise<OutboxFlushResult> {
  const { outbox, messages, adapter, maxRetriesPerItem = 2 } = options;
  const msgById = new Map(messages.map((m) => [m.id, m]));
  const syncedIds: string[] = [];
  const failedIds: string[] = [];
  const updatedMediaUrls: Record<string, { mediaUrl?: string; audioUrl?: string }> = {};

  for (const record of outbox) {
    const original = msgById.get(record.messageId);
    if (!original) {
      syncedIds.push(record.messageId);
      continue;
    }

    let delivered = false;
    let payload: Message = original;

    for (let attempt = 0; attempt <= maxRetriesPerItem; attempt += 1) {
      try {
        // Upload embedded data URLs (Quick Snap / Voice Note) to Supabase Storage `zona-media`
        if (payload.type === 'quick_snap' && payload.mediaUrl?.startsWith('data:')) {
          const converted = dataUrlToBlob(payload.mediaUrl);
          if (converted) {
            const signedUrl = await adapter.uploadMediaBlob(
              payload.senderId,
              converted.blob,
              converted.ext
            );
            payload = { ...payload, mediaUrl: signedUrl };
            updatedMediaUrls[payload.id] = { mediaUrl: signedUrl };
          }
        } else if (payload.type === 'voice_note' && payload.audioUrl?.startsWith('data:')) {
          const converted = dataUrlToBlob(payload.audioUrl);
          if (converted) {
            const signedUrl = await adapter.uploadMediaBlob(
              payload.senderId,
              converted.blob,
              converted.ext
            );
            payload = { ...payload, audioUrl: signedUrl };
            updatedMediaUrls[payload.id] = { audioUrl: signedUrl };
          }
        }

        await adapter.sendMessage(payload);
        delivered = true;
        break;
      } catch {
        // Retry up to maxRetriesPerItem before leaving item safely in outbox
      }
    }

    if (delivered) {
      syncedIds.push(record.messageId);
    } else {
      failedIds.push(record.messageId);
    }
  }

  return { syncedIds, failedIds, updatedMediaUrls };
}
