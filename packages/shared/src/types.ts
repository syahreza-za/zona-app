export type PrivacyMode = 'exact' | 'fuzzy' | 'ghost';

export type ChannelType = 'dm' | 'text' | 'hangout';

export type MessageType = 'text' | 'voice_note' | 'quick_snap' | 'hangout_card';

export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type RsvpStatus = 'going' | 'otw' | 'maybe';

export type BackendMode = 'demo' | 'cloud';

export type CircleRole = 'owner' | 'admin' | 'member';

export type MessageGroupPosition = 'single' | 'first' | 'middle' | 'last';

export type ChatWallpaperTheme =
  | 'clean'
  | 'warm-sand'
  | 'ocean-mist'
  | 'midnight-forest';

export type HangoutCategory = 'coffee' | 'food' | 'gaming' | 'sport';

export type CircleBannerStyle = 'emerald' | 'sky' | 'amber' | 'coral' | 'teal';

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  avatarColor: string;
  avatarVariant?: number;
  avatarUrl?: string;
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
  bannerStyle?: CircleBannerStyle;
  bannerImage?: string;
  inviteCode: string;
  description: string;
  memberIds: string[];
  memberRoles?: Record<string, CircleRole>;
}

export interface Channel {
  id: string;
  circleId: string | null; // null = Direct Message
  type: ChannelType;
  name: string;
  topic?: string;
  participantIds?: string[];
  unreadCount: number;
  isPinned?: boolean;
  isArchived?: boolean;
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
  audioUrl?: string;
  waveformPeaks?: number[];
  mediaUrl?: string;
  snapCaption?: string;
  snapGradient?: string;
  snapViewOnce?: boolean;
  snapViewedBy?: string[];
  hangoutPinId?: string;
  reactions: MessageReaction[];
  status: DeliveryStatus;
  createdAt: string;
  editedAt?: string;
  isDeleted?: boolean;
  expiresAt?: string;
}

export interface GroupedMessage {
  message: Message;
  groupPosition: MessageGroupPosition;
  showDateSeparator: boolean;
  dateLabel?: string;
  showAvatar: boolean;
  showSenderName: boolean;
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

export interface MapMarkerItem {
  userId: string;
  point: Coordinates;
}

export interface MapCluster<T extends MapMarkerItem = MapMarkerItem> {
  id: string;
  point: Coordinates;
  items: T[];
  isCluster: boolean;
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
  category?: HangoutCategory;
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

export interface PlaceSuggestion {
  id: string;
  name: string;
  subtitle: string;
  point: Coordinates;
}

export interface OutboxRecord {
  id: string;
  messageId: string;
  channelId: string;
  createdAt: string;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetUserId?: string;
  targetMessageId?: string;
  reason: string;
  createdAt: string;
}
