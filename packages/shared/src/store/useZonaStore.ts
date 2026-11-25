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
  Channel,
  Circle,
  Coordinates,
  HangoutPin,
  Message,
  PrivacyMode,
  Profile,
  RsvpStatus,
  UserLocation,
  VoiceLounge,
} from '../types';

export interface ZonaState {
  currentUserId: string;
  isDemoMode: boolean;
  profiles: Record<string, Profile>;
  circles: Circle[];
  channels: Channel[];
  messages: Message[];
  locations: Record<string, UserLocation>;
  hangoutPins: HangoutPin[];
  voiceLounges: VoiceLounge[];

  // Active UI selection
  activeCircleId: string | null; // null = Direct Messages view
  activeChannelId: string;
  activeVoiceLoungeId: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  replyToMessageId: string | null;
  selectedMapUserId: string | null;

  // Actions
  selectCircle: (circleId: string | null) => void;
  selectChannel: (channelId: string) => void;
  setReplyToMessage: (messageId: string | null) => void;
  setSelectedMapUser: (userId: string | null) => void;

  sendTextMessage: (channelId: string, content: string) => Message;
  sendVoiceNote: (channelId: string, durationSec: number) => Message;
  sendQuickSnap: (
    channelId: string,
    caption: string,
    viewOnce?: boolean
  ) => Message;
  toggleReaction: (messageId: string, emoji: string) => void;
  markSnapViewed: (messageId: string) => void;

  // Discord-like Circles & Voice Lounge
  createChannel: (circleId: string, name: string, topic?: string) => Channel;
  joinVoiceLounge: (loungeId: string) => void;
  leaveVoiceLounge: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;

  // Snapchat-like Map & Magic Bridge ("Ajak Kumpul")
  setMyPrivacyMode: (mode: PrivacyMode) => void;
  updateMyActivity: (emoji: string, text: string) => void;
  createHangoutPin: (input: {
    circleId: string;
    title: string;
    placeName: string;
    startsAtLabel: string;
    point: Coordinates;
  }) => { pin: HangoutPin; channel: Channel };
  respondToHangout: (pinId: string, status: RsvpStatus) => void;
  hydrateSnapshot: (snapshot: Partial<Pick<ZonaState, 'channels' | 'messages' | 'hangoutPins' | 'locations'>>) => void;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
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
  currentUserId: CURRENT_USER_ID,
  isDemoMode: true,
  profiles: DEMO_PROFILES,
  circles: DEMO_CIRCLES,
  channels: DEMO_CHANNELS,
  messages: DEMO_MESSAGES,
  locations: DEMO_LOCATIONS,
  hangoutPins: DEMO_HANGOUT_PINS,
  voiceLounges: DEMO_VOICE_LOUNGES,

  activeCircleId: 'c-kampus',
  activeChannelId: 'ch-kampus-ngopi',
  activeVoiceLoungeId: null,
  isMuted: false,
  isDeafened: false,
  replyToMessageId: null,
  selectedMapUserId: null,

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

  sendTextMessage: (channelId, rawContent) => {
    const content = rawContent.trim();
    const state = get();
    const message: Message = {
      id: createId('msg'),
      channelId,
      senderId: state.currentUserId,
      type: 'text',
      content,
      replyToId: state.replyToMessageId ?? undefined,
      reactions: [],
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    set({
      messages: [...state.messages, message],
      replyToMessageId: null,
    });
    return message;
  },

  sendVoiceNote: (channelId, durationSec) => {
    const state = get();
    const safeDuration = Math.max(1, Math.round(durationSec));
    const mins = Math.floor(safeDuration / 60);
    const secs = String(safeDuration % 60).padStart(2, '0');
    const message: Message = {
      id: createId('vn'),
      channelId,
      senderId: state.currentUserId,
      type: 'voice_note',
      content: `Voice note (${mins}:${secs})`,
      voiceDurationSec: safeDuration,
      reactions: [],
      status: 'sent',
      createdAt: new Date().toISOString(),
    };
    set({ messages: [...state.messages, message] });
    return message;
  },

  sendQuickSnap: (channelId, caption, viewOnce = false) => {
    const state = get();
    const gradient =
      SNAP_GRADIENTS[state.messages.length % SNAP_GRADIENTS.length];
    const message: Message = {
      id: createId('snap'),
      channelId,
      senderId: state.currentUserId,
      type: 'quick_snap',
      content: caption.trim() || 'Quick Snap 24 jam',
      snapCaption: caption.trim() || 'Momen spontan • 24 jam',
      snapGradient: gradient,
      snapViewOnce: viewOnce,
      snapViewedBy: [],
      reactions: [],
      status: 'sent',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    };
    set({ messages: [...state.messages, message] });
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
      status: 'sent',
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

  hydrateSnapshot: (snapshot) => {
    set((state) => ({
      ...state,
      ...(snapshot.channels ? { channels: snapshot.channels } : {}),
      ...(snapshot.messages ? { messages: snapshot.messages } : {}),
      ...(snapshot.hangoutPins ? { hangoutPins: snapshot.hangoutPins } : {}),
      ...(snapshot.locations ? { locations: snapshot.locations } : {}),
    }));
  },
}));
