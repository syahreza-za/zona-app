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
  Coordinates,
  HangoutPin,
  Message,
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
  outbox: OutboxRecord[];
  typingUsersByChannel: Record<string, string[]>;

  // Active UI selection
  activeCircleId: string | null;
  activeChannelId: string;
  activeVoiceLoungeId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  replyToMessageId: string | null;
  selectedMapUserId: string | null;
  searchQuery: string;

  // Auth & Profile Actions
  completeOnboarding: (input: {
    displayName: string;
    username: string;
    avatarColor: string;
    statusEmoji: string;
    statusText: string;
    mode: BackendMode;
    userId?: string;
  }) => void;
  updateMyProfile: (patch: Partial<Pick<Profile, 'displayName' | 'username' | 'avatarColor' | 'statusEmoji' | 'statusText'>>) => void;
  signOutSession: () => void;
  setOnlineStatus: (online: boolean) => void;
  flushOutbox: () => number;

  // Navigation & UI
  selectCircle: (circleId: string | null) => void;
  selectChannel: (channelId: string) => void;
  setReplyToMessage: (messageId: string | null) => void;
  setSelectedMapUser: (userId: string | null) => void;
  setSearchQuery: (q: string) => void;
  setTypingUsers: (channelId: string, names: string[]) => void;

  // Messaging (Offline-First + Real Media)
  sendTextMessage: (channelId: string, content: string) => Message;
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

  // Discord-like Circles & Voice Lounge
  createCircle: (name: string, shortCode?: string) => Circle;
  joinCircleByCode: (inviteCode: string) => { ok: boolean; circle?: Circle; error?: string };
  createChannel: (circleId: string, name: string, topic?: string) => Channel;
  joinVoiceLounge: (loungeId: string) => void;
  leaveVoiceLounge: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;

  // Snapchat-like Map & Magic Bridge ("Ajak Kumpul")
  setMyPrivacyMode: (mode: PrivacyMode) => void;
  updateMyActivity: (emoji: string, text: string) => void;
  updateMyCoordinates: (point: Coordinates, areaLabel?: string) => void;
  createHangoutPin: (input: {
    circleId: string;
    title: string;
    placeName: string;
    startsAtLabel: string;
    point: Coordinates;
  }) => { pin: HangoutPin; channel: Channel };
  respondToHangout: (pinId: string, status: RsvpStatus) => void;

  // Store Compliance (Block & Report)
  blockUser: (userId: string) => void;
  unblockUser: (userId: string) => void;

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
  'linear-gradient(135deg, #1E293B 0%, #0F766E 55%, #22C55E 100%)',
  'linear-gradient(135deg, #27221B 0%, #9A3412 52%, #FACC15 100%)',
  'linear-gradient(135deg, #172554 0%, #0369A1 55%, #38BDF8 100%)',
  'linear-gradient(135deg, #2B181E 0%, #BE185D 55%, #FB7185 100%)',
];

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
  outbox: [],
  typingUsersByChannel: {},

  activeCircleId: 'c-kampus',
  activeChannelId: 'ch-kampus-ngopi',
  activeVoiceLoungeId: null,
  isMuted: false,
  isDeafened: false,
  replyToMessageId: null,
  selectedMapUserId: null,
  searchQuery: '',

  completeOnboarding: ({
    displayName,
    username,
    avatarColor,
    statusEmoji,
    statusText,
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
      replyToMessageId: null,
      searchQuery: '',
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
    const matching = state.channels.filter((ch) => ch.circleId === circleId);
    const nextChannelId = matching[0]?.id ?? state.activeChannelId;
    set({
      activeCircleId: circleId,
      activeChannelId: nextChannelId,
      replyToMessageId: null,
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
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
      ),
    });
  },

  setReplyToMessage: (messageId) => set({ replyToMessageId: messageId }),

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
      outbox: state.isOnline
        ? state.outbox
        : [...state.outbox, { id: createId('ob'), messageId: id, channelId, createdAt }],
    });
    return message;
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
      content: `Voice note (${mins}:${secs})`,
      voiceDurationSec: safeDuration,
      audioUrl,
      waveformPeaks: waveformPeaks && waveformPeaks.length > 0 ? waveformPeaks : [9, 16, 12, 22, 18, 10, 20, 15, 23, 13, 17, 11],
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
      snapCaption: caption.trim() || 'Momen spontan • 24 jam',
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
        if (msg.id !== messageId) return msg;
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

    const circle: Circle = {
      id: circleId,
      name: cleanName,
      shortCode: code,
      accentColor: '#FACC15',
      inviteCode,
      description: 'Circle baru dibuat di ZONA',
      memberIds: [state.currentUserId],
    };

    const defaultChannel: Channel = {
      id: defaultChId,
      circleId,
      type: 'text',
      name: 'obrolan',
      topic: `Selamat datang di ${cleanName}!`,
      unreadCount: 0,
    };

    const voiceLounge: VoiceLounge = {
      id: createId('vl'),
      circleId,
      name: 'Ruang Santai',
      topic: 'Drop-in Voice 1-Tap',
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
          ? { ...c, memberIds: [...c.memberIds, state.currentUserId] }
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
      error: 'Kode tidak ditemukan. Coba ZONA-KAMPUS07, ZONA-MABAR99, atau kode ZONA-XXXXXX.',
    };
  },

  createChannel: (circleId, name, topic) => {
    const state = get();
    const channel: Channel = {
      id: createId('ch'),
      circleId,
      type: 'text',
      name: slugifyChannelName(name),
      topic: topic?.trim() || 'Kanal topik baru',
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

  createHangoutPin: ({ circleId, title, placeName, startsAtLabel, point }) => {
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
      point,
      startsAtLabel: startsAtLabel.trim() || 'Hari ini • Segera',
      rsvps: [{ userId: state.currentUserId, status: 'going', etaMinutes: eta }],
      createdAt: now,
      expiresAt,
    };

    const channel: Channel = {
      id: channelId,
      circleId,
      type: 'hangout',
      name: slugifyChannelName(placeName || title),
      topic: `Pin Ajak Kumpul — ${pin.placeName}`,
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
      ...(snapshot.outbox ? { outbox: snapshot.outbox } : {}),
    }));
  },
}));
