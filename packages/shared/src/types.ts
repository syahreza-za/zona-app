export type PrivacyMode = 'exact' | 'fuzzy' | 'ghost';

export type ChannelType = 'dm' | 'text' | 'hangout';

export type MessageType = 'text' | 'voice_note' | 'quick_snap' | 'hangout_card';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type RsvpStatus = 'going' | 'otw' | 'maybe';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  statusEmoji: string;
  statusText: string;
  isOnline: boolean;
  lastSeenAt: string;
}

export interface Circle {
  id: string;
  name: string;
  shortCode: string;
  accentColor: string;
  inviteCode: string;
  description: string;
  memberIds: string[];
}

export interface Channel {
  id: string;
  circleId: string | null; // null = Direct Message (WhatsApp style)
  type: ChannelType;
  name: string;
  topic?: string;
  participantIds?: string[]; // for DM channels
  unreadCount: number;
  isEphemeral?: boolean;
  expiresAt?: string;
  hangoutPinId?: string;
}

export interface MessageReaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  type: MessageType;
  content: string;
  replyToId?: string;
  voiceDurationSec?: number;
  snapCaption?: string;
  snapGradient?: string;
  snapViewOnce?: boolean;
  snapViewedBy?: string[];
  hangoutPinId?: string;
  reactions: MessageReaction[];
  status: DeliveryStatus;
  createdAt: string;
  expiresAt?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface UserLocation {
  userId: string;
  point: Coordinates;
  privacyMode: PrivacyMode;
  areaLabel: string;
  activityEmoji: string;
  activityText: string;
  batteryPct: number;
  isMoving: boolean;
  updatedAt: string;
}

export interface HangoutRsvp {
  userId: string;
  status: RsvpStatus;
  etaMinutes?: number;
}

export interface HangoutPin {
  id: string;
  circleId: string;
  channelId: string;
  creatorId: string;
  title: string;
  placeName: string;
  point: Coordinates;
  startsAtLabel: string;
  rsvps: HangoutRsvp[];
  createdAt: string;
  expiresAt: string;
}

export interface VoiceLounge {
  id: string;
  circleId: string;
  name: string;
  topic: string;
  participantIds: string[];
  speakingUserIds: string[];
}
