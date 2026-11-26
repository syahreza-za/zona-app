import { create } from 'zustand';
import {
  CURRENT_USER_ID,
  DEMO_CHANNELS,
  DEMO_CIRCLES,
  DEMO_HANGOUT_PINS,
  DEMO_LOCATIONS,
  DEMO_MESSAGES,
  DEMO_PROFILES,
  DEMO_VOICE_LOUNGES,
} from '../demo/seedData';
import { estimateEtaMinutes } from '../map/fuzzyLocation';
import type {
  BackendMode,
  Channel,
  Circle,
  CircleRole,
  Coordinates,
  HangoutPin,
  Message,
  ModerationReport,
  OutboxRecord,
  PrivacyMode,
  Profile,
  RsvpStatus,
  UserLocation,
  VoiceLounge,
} from '../types';

export interface ZonaState {
  isAuthenticated: boolean;
  backendMode: BackendMode;
  isOnline: boolean;
  currentUserId: string;
  isDemoMode: boolean;
  profiles: Record<string, Profile>;
  circles: Circle[];
  channels: Channel[];
  messages: Message[];
  locations: Record<string, UserLocation>;
  hangoutPins: HangoutPin[];
  voiceLounges: VoiceLounge[];
  blockedUserIds: string[];
  reports: ModerationReport[];
  outbox: OutboxRecord[];
  typingUsersByChannel: Record<string, string[]>;

  // Active UI selection
  chatTheme: import('../types').ChatWallpaperTheme;
  activeCircleId: string | null;
  activeChannelId: string;
  activeVoiceLoungeId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  replyToMessageId: string | null;
  editingMessageId: string | null;
  selectedMapUserId: string | null;
  searchQuery: string;

  setChatTheme: (theme: import('../types').ChatWallpaperTheme) => void;

  // Auth & Profile Actions
  completeOnboarding: (input: {
    displayName: string;
    username: string;
    avatarColor: string;
    avatarVariant?: number;
    statusEmoji?: string;
    statusText?: string;
    avatarUrl?: string;
    mode: BackendMode;
    userId?: string;
  }) => void;
  updateMyProfile: (
    patch: Partial<
      Pick<
        Profile,
        | 'displayName'
        | 'username'
        | 'avatarColor'
        | 'avatarVariant'
        | 'avatarUrl'
        | 'statusEmoji'
        | 'statusText'
      >
    >
  ) => void;
  signOutSession: () => void;
  deleteMyAccount: () => void;
  setOnlineStatus: (online: boolean) => void;
  flushOutbox: () => number;

  // Navigation & UI
  selectCircle: (circleId: string | null) => void;
  selectChannel: (channelId: string) => void;
  startDirectMessage: (targetUserId: string) => Channel | null;
  togglePinChannel: (channelId: string) => void;
  toggleArchiveChannel: (channelId: string) => void;
  setReplyToMessage: (messageId: string | null) => void;
  setEditingMessage: (messageId: string | null) => void;
  setSelectedMapUser: (userId: string | null) => void;
  setSearchQuery: (q: string) => void;
  setTypingUsers: (channelId: string, names: string[]) => void;

  // Messaging (Offline-First + Real Media)
  sendTextMessage: (channelId: string, content: string) => Message;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  sendVoiceNote: (
    channelId: string,
    durationSec: number,
    audioUrl?: string,
    waveformPeaks?: number[]
  ) => Message;
  sendQuickSnap: (
    channelId: string,
    caption: string,
    viewOnce?: boolean,
    mediaUrl?: string
  ) => Message;
  toggleReaction: (messageId: string, emoji: string) => void;
  markSnapViewed: (messageId: string) => void;

  // Circles & Voice Lounge
  createCircle: (name: string, shortCode?: string) => Circle;
  joinCircleByCode: (inviteCode: string) => { ok: boolean; circle?: Circle; error?: string };
  setCircleMemberRole: (circleId: string, userId: string, role: CircleRole) => void;
  createChannel: (circleId: string, name: string, topic?: string) => Channel;
  joinVoiceLounge: (loungeId: string) => void;
  leaveVoiceLounge: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleScreenShare: () => void;

  // Live Social Map & Bridge ("Ajak Kumpul")
  setMyPrivacyMode: (mode: PrivacyMode) => void;
  updateMyActivity: (emoji: string, text: string) => void;
  updateMyCoordinates: (point: Coordinates, areaLabel?: string) => void;
  createHangoutPin: (input: {
    circleId: string;
    title: string;
    placeName: string;
    startsAtLabel: string;
    category?: import('../types').HangoutCategory;
    point: Coordinates;
  }) => { pin: HangoutPin; channel: Channel };
  respondToHangout: (pinId: string, status: RsvpStatus) => void;

  // Safety & Store Compliance (Block & Report)
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;
  reportContent: (input: {
    targetUserId?: string;
    targetMessageId?: string;
    reason: string;
  }) => ModerationReport;

  hydrateSnapshot: (
    snapshot: Partial<
      Pick<
        ZonaState,
        | 'isAuthenticated'
        | 'profiles'
        | 'circles'
        | 'channels'
        | 'messages'
        | 'hangoutPins'
        | 'locations'
        | 'blockedUserIds'
        | 'reports'
        | 'outbox'
      >
    >
  ) => void;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ZN';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function slugifyChannelName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 24);
  return cleaned || 'kumpul-baru';
}

const SNAP_GRADIENTS = [
  'linear-gradient(150deg, #1E293B 0%, #334155 50%, #0F766E 100%)',
  'linear-gradient(150deg, #1F2937 0%, #374151 50%, #059669 100%)',
  'linear-gradient(150deg, #172554 0%, #1E3A8A 55%, #0284C7 100%)',
  'linear-gradient(150deg, #27272A 0%, #52525B 55%, #EA580C 100%)',
];

const CIRCLE_PALETTES: Array<{ accentColor: string; bannerStyle: import('../types').CircleBannerStyle }> = [
  { accentColor: '#10B981', bannerStyle: 'emerald' },
  { accentColor: '#0EA5E9', bannerStyle: 'sky' },
  { accentColor: '#D97706', bannerStyle: 'amber' },
  { accentColor: '#EA580C', bannerStyle: 'coral' },
  { accentColor: '#0D9488', bannerStyle: 'teal' },
];

function inferHangoutCategory(
  text: string
): import('../types').HangoutCategory {
  const lower = text.toLowerCase();
  if (/kopi|coffee|cafe|kafe|matcha|tuku/.test(lower)) return 'coffee';
  if (/makan|gultik|ramen|bakmi|dinner|kuliner|sate|sushi/.test(lower)) return 'food';
  if (/lari|padel|futsal|gym|badminton|sepeda|olahraga|gbk/.test(lower)) return 'sport';
  if (/mabar|game|rank|ps|billiard|bioskop|nonton/.test(lower)) return 'gaming';
  return 'coffee';
}

export const useZonaStore = create<ZonaState>((set, get) => ({
  isAuthenticated: false,
  backendMode: 'demo',
  isOnline: true,
  currentUserId: CURRENT_USER_ID,
  isDemoMode: true,
  profiles: DEMO_PROFILES,
  circles: DEMO_CIRCLES,
  channels: DEMO_CHANNELS,
  messages: DEMO_MESSAGES,
  locations: DEMO_LOCATIONS,
  hangoutPins: DEMO_HANGOUT_PINS,
  voiceLounges: DEMO_VOICE_LOUNGES,
  blockedUserIds: [],
  reports: [],
  outbox: [],
  typingUsersByChannel: {},

  chatTheme: 'warm-sand',
  activeCircleId: 'c-kampus',
  activeChannelId: 'ch-kampus-ngopi',
  activeVoiceLoungeId: null,
  isMuted: false,
  isDeafened: false,
  isScreenSharing: false,
  replyToMessageId: null,
  editingMessageId: null,
  selectedMapUserId: null,
  searchQuery: '',

  setChatTheme: (chatTheme) => set({ chatTheme }),

  completeOnboarding: ({
    displayName,
    username,
    avatarColor,
    avatarVariant = 0,
    statusEmoji = '☕',
    statusText = 'Lagi santai di Blok M',
    avatarUrl,
    mode,
    userId,
  }) => {
    const uid = userId || get().currentUserId;
    const cleanName = displayName.trim() || 'Reza';
    const cleanUser =
      username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'syahreza';

    set((state) => {
      const existingLoc = state.locations[uid] ?? state.locations[CURRENT_USER_ID];
      return {
        isAuthenticated: true,
        backendMode: mode,
        isDemoMode: mode === 'demo',
        currentUserId: uid,
        profiles: {
          ...state.profiles,
          [uid]: {
            id: uid,
            username: cleanUser,
            displayName: cleanName,
            initials: makeInitials(cleanName),
            avatarColor,
            avatarVariant,
            avatarUrl,
            statusEmoji,
            statusText,
            isOnline: true,
            lastSeenAt: new Date().toISOString(),
          },
        },
        locations: {
          ...state.locations,
          [uid]: {
            ...(existingLoc ?? {
              userId: uid,
              point: { lat: -6.2442, lng: 106.8006 },
              privacyMode: 'exact' as PrivacyMode,
              areaLabel: 'Blok M, Jaksel',
              batteryPct: 86,
              isMoving: false,
            }),
            userId: uid,
            activityEmoji: statusEmoji,
            activityText: statusText,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  updateMyProfile: (patch) => {
    const { currentUserId, profiles, locations } = get();
    const cur = profiles[currentUserId];
    if (!cur) return;
    const nextName = patch.displayName?.trim() || cur.displayName;
    const nextProfile: Profile = {
      ...cur,
      ...patch,
      displayName: nextName,
      initials: makeInitials(nextName),
    };
    const curLoc = locations[currentUserId];
    set({
      profiles: { ...profiles, [currentUserId]: nextProfile },
      locations: curLoc
        ? {
            ...locations,
            [currentUserId]: {
              ...curLoc,
              activityEmoji: nextProfile.statusEmoji,
              activityText: nextProfile.statusText,
            },
          }
        : locations,
    });
  },

  signOutSession: () => {
    set({
      isAuthenticated: false,
      activeVoiceLoungeId: null,
      isScreenSharing: false,
      replyToMessageId: null,
      editingMessageId: null,
      searchQuery: '',
    });
  },

  deleteMyAccount: () => {
    set({
      isAuthenticated: false,
      activeVoiceLoungeId: null,
      isScreenSharing: false,
      replyToMessageId: null,
      editingMessageId: null,
      searchQuery: '',
      blockedUserIds: [],
      reports: [],
      outbox: [],
      profiles: DEMO_PROFILES,
      circles: DEMO_CIRCLES,
      channels: DEMO_CHANNELS,
      messages: DEMO_MESSAGES,
      locations: DEMO_LOCATIONS,
      hangoutPins: DEMO_HANGOUT_PINS,
      voiceLounges: DEMO_VOICE_LOUNGES,
    });
  },

  setOnlineStatus: (online) => {
    set({ isOnline: online });
    if (online) {
      get().flushOutbox();
    }
  },

  flushOutbox: () => {
    const { outbox, messages } = get();
    if (outbox.length === 0) return 0;
    const pendingIds = new Set(outbox.map((o) => o.messageId));
    set({
      outbox: [],
      messages: messages.map((m) =>
        pendingIds.has(m.id) ? { ...m, status: 'sent' } : m
      ),
    });
    return outbox.length;
  },

  selectCircle: (circleId) => {
    const state = get();
    const matching = state.channels.filter(
      (ch) => ch.circleId === circleId && !ch.isArchived
    );
    const nextChannelId = matching[0]?.id ?? state.activeChannelId;
    set({
      activeCircleId: circleId,
      activeChannelId: nextChannelId,
      replyToMessageId: null,
      editingMessageId: null,
      channels: state.channels.map((ch) =>
        ch.id === nextChannelId ? { ...ch, unreadCount: 0 } : ch
      ),
    });
  },

  selectChannel: (channelId) => {
    const state = get();
    const target = state.channels.find((ch) => ch.id === channelId);
    if (!target) return;
    set({
      activeCircleId: target.circleId,
      activeChannelId: channelId,
      replyToMessageId: null,
      editingMessageId: null,
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
      ),
    });
  },

  startDirectMessage: (targetUserId) => {
    const state = get();
    if (targetUserId === state.currentUserId) return null;
    const target = state.profiles[targetUserId];
    if (!target) return null;

    const existing = state.channels.find(
      (ch) =>
        ch.type === 'dm' &&
        ch.participantIds?.includes(state.currentUserId) &&
        ch.participantIds?.includes(targetUserId)
    );
    if (existing) {
      state.selectChannel(existing.id);
      return existing;
    }

    const dmChannel: Channel = {
      id: createId('dm'),
      circleId: null,
      type: 'dm',
      name: target.displayName,
      participantIds: [state.currentUserId, targetUserId],
      unreadCount: 0,
    };

    set({
      channels: [dmChannel, ...state.channels],
      activeCircleId: null,
      activeChannelId: dmChannel.id,
      replyToMessageId: null,
      editingMessageId: null,
    });
    return dmChannel;
  },

  togglePinChannel: (channelId) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isPinned: !ch.isPinned } : ch
      ),
    }));
  },

  toggleArchiveChannel: (channelId) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isArchived: !ch.isArchived } : ch
      ),
    }));
  },

  setReplyToMessage: (messageId) =>
    set({ replyToMessageId: messageId, editingMessageId: null }),

  setEditingMessage: (messageId) =>
    set({ editingMessageId: messageId, replyToMessageId: null }),

  setSelectedMapUser: (userId) => set({ selectedMapUserId: userId }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setTypingUsers: (channelId, names) =>
    set((state) => ({
      typingUsersByChannel: {
        ...state.typingUsersByChannel,
        [channelId]: names,
      },
    })),

  sendTextMessage: (channelId, rawContent) => {
    const content = rawContent.trim();
    const state = get();
    const id = createId('msg');
    const createdAt = new Date().toISOString();
    const status = state.isOnline ? 'sent' : 'sending';
    const message: Message = {
      id,
      channelId,
      senderId: state.currentUserId,
      type: 'text',
      content,
      replyToId: state.replyToMessageId ?? undefined,
      reactions: [],
      status,
      createdAt,
    };
    set({
      messages: [...state.messages, message],
      replyToMessageId: null,
      editingMessageId: null,
      outbox: state.isOnline
        ? state.outbox
        : [...state.outbox, { id: createId('ob'), messageId: id, channelId, createdAt }],
    });
    return message;
  },

  editMessage: (messageId, rawContent) => {
    const content = rawContent.trim();
    if (!content) return;
    const { currentUserId, messages } = get();
    set({
      editingMessageId: null,
      messages: messages.map((m) =>
        m.id === messageId && m.senderId === currentUserId
          ? { ...m, content, editedAt: new Date().toISOString() }
          : m
      ),
    });
  },

  deleteMessage: (messageId) => {
    const { currentUserId, messages } = get();
    set({
      messages: messages.map((m) =>
        m.id === messageId && m.senderId === currentUserId
          ? {
              ...m,
              content: 'Pesan ini telah dihapus',
              isDeleted: true,
              reactions: [],
            }
          : m
      ),
    });
  },

  sendVoiceNote: (channelId, durationSec, audioUrl, waveformPeaks) => {
    const state = get();
    const safeDuration = Math.max(1, Math.round(durationSec));
    const mins = Math.floor(safeDuration / 60);
    const secs = String(safeDuration % 60).padStart(2, '0');
    const id = createId('vn');
    const createdAt = new Date().toISOString();
    const message: Message = {
      id,
      channelId,
      senderId: state.currentUserId,
      type: 'voice_note',
      content: `Pesan suara (${mins}:${secs})`,
      voiceDurationSec: safeDuration,
      audioUrl,
      waveformPeaks:
        waveformPeaks && waveformPeaks.length > 0
          ? waveformPeaks
          : [9, 16, 12, 22, 18, 10, 20, 15, 23, 13, 17, 11, 15, 10, 14, 9],
      reactions: [],
      status: state.isOnline ? 'sent' : 'sending',
      createdAt,
    };
    set({
      messages: [...state.messages, message],
      outbox: state.isOnline
        ? state.outbox
        : [...state.outbox, { id: createId('ob'), messageId: id, channelId, createdAt }],
    });
    return message;
  },

  sendQuickSnap: (channelId, caption, viewOnce = false, mediaUrl) => {
    const state = get();
    const gradient =
      SNAP_GRADIENTS[state.messages.length % SNAP_GRADIENTS.length];
    const id = createId('snap');
    const createdAt = new Date().toISOString();
    const message: Message = {
      id,
      channelId,
      senderId: state.currentUserId,
      type: 'quick_snap',
      content: caption.trim() || 'Quick Snap 24 jam',
      mediaUrl,
      snapCaption: caption.trim() || 'Momen spontan · 24 jam',
      snapGradient: gradient,
      snapViewOnce: viewOnce,
      snapViewedBy: [],
      reactions: [],
      status: state.isOnline ? 'sent' : 'sending',
      createdAt,
      expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    };
    set({
      messages: [...state.messages, message],
      outbox: state.isOnline
        ? state.outbox
        : [...state.outbox, { id: createId('ob'), messageId: id, channelId, createdAt }],
    });
    return message;
  },

  toggleReaction: (messageId, emoji) => {
    const { currentUserId, messages } = get();
    set({
      messages: messages.map((msg) => {
        if (msg.id !== messageId || msg.isDeleted) return msg;
        const existing = msg.reactions.find((r) => r.emoji === emoji);
        if (!existing) {
          return {
            ...msg,
            reactions: [...msg.reactions, { emoji, userIds: [currentUserId] }],
          };
        }
        const hasReacted = existing.userIds.includes(currentUserId);
        const nextUsers = hasReacted
          ? existing.userIds.filter((id) => id !== currentUserId)
          : [...existing.userIds, currentUserId];
        return {
          ...msg,
          reactions:
            nextUsers.length === 0
              ? msg.reactions.filter((r) => r.emoji !== emoji)
              : msg.reactions.map((r) =>
                  r.emoji === emoji ? { ...r, userIds: nextUsers } : r
                ),
        };
      }),
    });
  },

  markSnapViewed: (messageId) => {
    const { currentUserId, messages } = get();
    set({
      messages: messages.map((msg) => {
        if (msg.id !== messageId || msg.type !== 'quick_snap') return msg;
        const viewed = msg.snapViewedBy ?? [];
        if (viewed.includes(currentUserId)) return msg;
        return { ...msg, snapViewedBy: [...viewed, currentUserId] };
      }),
    });
  },

  createCircle: (name, shortCode) => {
    const state = get();
    const cleanName = name.trim() || 'Circle Baru';
    const code = (shortCode?.trim() || makeInitials(cleanName)).slice(0, 2).toUpperCase();
    const inviteCode = `ZONA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const circleId = createId('circle');
    const defaultChId = createId('ch');

    const palette = CIRCLE_PALETTES[state.circles.length % CIRCLE_PALETTES.length];
    const circle: Circle = {
      id: circleId,
      name: cleanName,
      shortCode: code,
      accentColor: palette.accentColor,
      bannerStyle: palette.bannerStyle,
      inviteCode,
      description: 'Circle pertemanan dekat',
      memberIds: [state.currentUserId],
      memberRoles: { [state.currentUserId]: 'owner' },
    };

    const defaultChannel: Channel = {
      id: defaultChId,
      circleId,
      type: 'text',
      name: 'umum',
      topic: `Obrolan utama ${cleanName}`,
      unreadCount: 0,
    };

    const voiceLounge: VoiceLounge = {
      id: createId('vl'),
      circleId,
      name: 'Ruang Santai',
      topic: 'Ngobrol suara bersama',
      participantIds: [],
      speakingUserIds: [],
    };

    set({
      circles: [...state.circles, circle],
      channels: [...state.channels, defaultChannel],
      voiceLounges: [...state.voiceLounges, voiceLounge],
      activeCircleId: circleId,
      activeChannelId: defaultChId,
    });

    return circle;
  },

  joinCircleByCode: (rawCode) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      return { ok: false, error: 'Masukkan kode undangan Circle.' };
    }
    const state = get();
    const found = state.circles.find((c) => c.inviteCode.toUpperCase() === code);
    if (found) {
      const updated = state.circles.map((c) =>
        c.id === found.id && !c.memberIds.includes(state.currentUserId)
          ? {
              ...c,
              memberIds: [...c.memberIds, state.currentUserId],
              memberRoles: {
                ...(c.memberRoles ?? {}),
                [state.currentUserId]: 'member' as CircleRole,
              },
            }
          : c
      );
      const firstCh = state.channels.find((ch) => ch.circleId === found.id);
      set({
        circles: updated,
        activeCircleId: found.id,
        activeChannelId: firstCh?.id ?? state.activeChannelId,
      });
      return { ok: true, circle: found };
    }

    if (code.startsWith('ZONA-') && code.length >= 8) {
      const created = state.createCircle(`Circle ${code.slice(5)}`, code.slice(5, 7));
      return { ok: true, circle: created };
    }

    return {
      ok: false,
      error: 'Kode tidak ditemukan. Periksa kembali kode undangan Circle.',
    };
  },

  setCircleMemberRole: (circleId, userId, role) => {
    set((state) => ({
      circles: state.circles.map((c) =>
        c.id === circleId
          ? {
              ...c,
              memberRoles: { ...(c.memberRoles ?? {}), [userId]: role },
            }
          : c
      ),
    }));
  },

  createChannel: (circleId, name, topic) => {
    const state = get();
    const channel: Channel = {
      id: createId('ch'),
      circleId,
      type: 'text',
      name: slugifyChannelName(name),
      topic: topic?.trim() || 'Diskusi topik',
      unreadCount: 0,
    };
    set({
      channels: [...state.channels, channel],
      activeCircleId: circleId,
      activeChannelId: channel.id,
    });
    return channel;
  },

  joinVoiceLounge: (loungeId) => {
    const { currentUserId, voiceLounges } = get();
    set({
      activeVoiceLoungeId: loungeId,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      voiceLounges: voiceLounges.map((vl) => {
        const cleaned = vl.participantIds.filter((id) => id !== currentUserId);
        const cleanedSpeaking = vl.speakingUserIds.filter(
          (id) => id !== currentUserId
        );
        if (vl.id !== loungeId) {
          return {
            ...vl,
            participantIds: cleaned,
            speakingUserIds: cleanedSpeaking,
          };
        }
        return {
          ...vl,
          participantIds: [...cleaned, currentUserId],
          speakingUserIds: [...cleanedSpeaking, currentUserId],
        };
      }),
    });
  },

  leaveVoiceLounge: () => {
    const { currentUserId, voiceLounges } = get();
    set({
      activeVoiceLoungeId: null,
      isMuted: false,
      isDeafened: false,
      isScreenSharing: false,
      voiceLounges: voiceLounges.map((vl) => ({
        ...vl,
        participantIds: vl.participantIds.filter((id) => id !== currentUserId),
        speakingUserIds: vl.speakingUserIds.filter(
          (id) => id !== currentUserId
        ),
      })),
    });
  },

  toggleMute: () => {
    const { isMuted, currentUserId, activeVoiceLoungeId, voiceLounges } = get();
    const nextMuted = !isMuted;
    set({
      isMuted: nextMuted,
      voiceLounges: voiceLounges.map((vl) => {
        if (vl.id !== activeVoiceLoungeId) return vl;
        return {
          ...vl,
          speakingUserIds: nextMuted
            ? vl.speakingUserIds.filter((id) => id !== currentUserId)
            : Array.from(new Set([...vl.speakingUserIds, currentUserId])),
        };
      }),
    });
  },

  toggleDeafen: () => {
    const { isDeafened } = get();
    const nextDeafened = !isDeafened;
    set({
      isDeafened: nextDeafened,
      isMuted: nextDeafened ? true : get().isMuted,
    });
  },

  toggleScreenShare: () => {
    set((state) => ({ isScreenSharing: !state.isScreenSharing }));
  },

  setMyPrivacyMode: (mode) => {
    const { currentUserId, locations } = get();
    const current = locations[currentUserId];
    if (!current) return;
    set({
      locations: {
        ...locations,
        [currentUserId]: {
          ...current,
          privacyMode: mode,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  },

  updateMyActivity: (emoji, text) => {
    const { currentUserId, locations, profiles } = get();
    const currentLoc = locations[currentUserId];
    const currentProfile = profiles[currentUserId];
    set({
      profiles: currentProfile
        ? {
            ...profiles,
            [currentUserId]: {
              ...currentProfile,
              statusEmoji: emoji,
              statusText: text,
            },
          }
        : profiles,
      locations: currentLoc
        ? {
            ...locations,
            [currentUserId]: {
              ...currentLoc,
              activityEmoji: emoji,
              activityText: text,
              updatedAt: new Date().toISOString(),
            },
          }
        : locations,
    });
  },

  updateMyCoordinates: (point, areaLabel) => {
    const { currentUserId, locations } = get();
    const cur = locations[currentUserId];
    if (!cur) return;
    set({
      locations: {
        ...locations,
        [currentUserId]: {
          ...cur,
          point,
          areaLabel: areaLabel ?? cur.areaLabel,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  },

  createHangoutPin: ({ circleId, title, placeName, startsAtLabel, category, point }) => {
    const state = get();
    const pinId = createId('pin');
    const channelId = createId('ch-hangout');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 12 * 3_600_000).toISOString();

    const myLoc = state.locations[state.currentUserId];
    const eta = myLoc ? estimateEtaMinutes(myLoc.point, point) : 10;

    const pin: HangoutPin = {
      id: pinId,
      circleId,
      channelId,
      creatorId: state.currentUserId,
      title: title.trim() || 'Ajak Kumpul',
      placeName: placeName.trim() || 'Titik Kumpul',
      category: category ?? inferHangoutCategory(`${title} ${placeName}`),
      point,
      startsAtLabel: startsAtLabel.trim() || 'Hari ini · Segera',
      rsvps: [{ userId: state.currentUserId, status: 'going', etaMinutes: eta }],
      createdAt: now,
      expiresAt,
    };

    const channel: Channel = {
      id: channelId,
      circleId,
      type: 'hangout',
      name: slugifyChannelName(placeName || title),
      topic: `${pin.placeName} · ${pin.startsAtLabel}`,
      unreadCount: 0,
      isEphemeral: true,
      hangoutPinId: pinId,
      expiresAt,
    };

    const cardMessage: Message = {
      id: createId('msg'),
      channelId,
      senderId: state.currentUserId,
      type: 'hangout_card',
      content: `Ajak Kumpul di ${pin.placeName} — ${pin.title}`,
      hangoutPinId: pinId,
      reactions: [],
      status: state.isOnline ? 'sent' : 'sending',
      createdAt: now,
    };

    set({
      hangoutPins: [pin, ...state.hangoutPins],
      channels: [...state.channels, channel],
      messages: [...state.messages, cardMessage],
      activeCircleId: circleId,
      activeChannelId: channelId,
    });

    return { pin, channel };
  },

  respondToHangout: (pinId, status) => {
    const { currentUserId, hangoutPins, locations } = get();
    const myLoc = locations[currentUserId];
    set({
      hangoutPins: hangoutPins.map((pin) => {
        if (pin.id !== pinId) return pin;
        const eta = myLoc ? estimateEtaMinutes(myLoc.point, pin.point) : 12;
        const others = pin.rsvps.filter((r) => r.userId !== currentUserId);
        return {
          ...pin,
          rsvps: [...others, { userId: currentUserId, status, etaMinutes: eta }],
        };
      }),
    });
  },

  blockUser: (userId) => {
    const { blockedUserIds, currentUserId } = get();
    if (userId === currentUserId || blockedUserIds.includes(userId)) return;
    set({ blockedUserIds: [...blockedUserIds, userId] });
  },

  unblockUser: (userId) => {
    set((state) => ({
      blockedUserIds: state.blockedUserIds.filter((id) => id !== userId),
    }));
  },

  reportContent: ({ targetUserId, targetMessageId, reason }) => {
    const report: ModerationReport = {
      id: createId('rep'),
      reporterId: get().currentUserId,
      targetUserId,
      targetMessageId,
      reason: reason.trim() || 'Konten tidak pantas',
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ reports: [report, ...state.reports] }));
    return report;
  },

  hydrateSnapshot: (snapshot) => {
    set((state) => ({
      ...state,
      ...(typeof snapshot.isAuthenticated === 'boolean'
        ? { isAuthenticated: snapshot.isAuthenticated }
        : {}),
      ...(snapshot.profiles ? { profiles: { ...state.profiles, ...snapshot.profiles } } : {}),
      ...(snapshot.circles ? { circles: snapshot.circles } : {}),
      ...(snapshot.channels ? { channels: snapshot.channels } : {}),
      ...(snapshot.messages ? { messages: snapshot.messages } : {}),
      ...(snapshot.hangoutPins ? { hangoutPins: snapshot.hangoutPins } : {}),
      ...(snapshot.locations ? { locations: { ...state.locations, ...snapshot.locations } } : {}),
      ...(snapshot.blockedUserIds ? { blockedUserIds: snapshot.blockedUserIds } : {}),
      ...(snapshot.reports ? { reports: snapshot.reports } : {}),
      ...(snapshot.outbox ? { outbox: snapshot.outbox } : {}),
    }));
  },
}));
