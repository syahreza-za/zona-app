import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Channel,
  Circle,
  Coordinates,
  HangoutPin,
  Message,
  MessageReaction,
  PrivacyMode,
  Profile,
  RsvpStatus,
  UserLocation,
  VoiceLounge,
} from '../types';
import {
  isValidUuid,
  mapDbChannelToChannel,
  mapDbCircleToCircle,
  mapDbMessageToMessage,
  mapDbPinToHangoutPin,
  mapDbProfileToProfile,
  mapMapMemberToLocation,
} from './cloudSyncCore';

export interface SupabaseEnvConfig {
  url?: string;
  anonKey?: string;
}

export interface CloudWorkspaceSnapshot {
  profiles: Record<string, Profile>;
  circles: Circle[];
  channels: Channel[];
  messages: Message[];
  hangoutPins: HangoutPin[];
  locations: Record<string, UserLocation>;
  voiceLounges: VoiceLounge[];
  blockedUserIds: string[];
}

export interface WorkspaceRealtimeHandlers {
  onMessageInsert?: (msg: Message) => void;
  onMessageUpdate?: (messageId: string, patch: Partial<Message>) => void;
  onMessageDelete?: (messageId: string) => void;
  onChannelUpsert?: (channel: Channel) => void;
  onHangoutPinUpsert?: (pin: HangoutPin) => void;
  onHangoutRsvpUpsert?: (pinId: string, userId: string, status: RsvpStatus) => void;
}

export class ZonaCloudBackend {
  private client: SupabaseClient | null = null;

  constructor(config: SupabaseEnvConfig) {
    if (config.url && config.anonKey) {
      this.client = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new Error('Supabase belum dikonfigurasi.');
    }
    return this.client;
  }

  async getSession() {
    if (!this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async signInWithEmail(email: string, password: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async signUpWithEmail(email: string, password: string, displayName: string, username: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, username },
      },
    });
    if (error) throw error;
    if (data.user) {
      await client.from('profiles').upsert({
        id: data.user.id,
        username,
        display_name: displayName,
      });
    }
    return data;
  }

  async signInWithGoogle(redirectTo?: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw error;
    return data;
  }

  async signInWithApple(redirectTo?: string) {
    const client = this.getClient();
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'apple',
      options: redirectTo ? { redirectTo } : undefined,
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
  }

  async deleteOwnAccount() {
    if (!this.client) return;
    const { error } = await this.client.rpc('delete_own_account');
    if (error) throw error;
    await this.client.auth.signOut();
  }

  async upsertProfile(
    userId: string,
    patch: {
      username?: string;
      displayName?: string;
      avatarUrl?: string;
      avatarColor?: string;
      statusEmoji?: string;
      statusText?: string;
    }
  ) {
    const client = this.getClient();
    const row: Record<string, unknown> = {
      id: userId,
      last_seen_at: new Date().toISOString(),
    };
    if (patch.username) row.username = patch.username;
    if (patch.displayName) row.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl || null;
    if (patch.avatarColor) row.avatar_color = patch.avatarColor;
    if (patch.statusEmoji !== undefined) row.status_emoji = patch.statusEmoji;
    if (patch.statusText !== undefined) row.status_text = patch.statusText;

    const { error } = await client.from('profiles').upsert(row);
    if (error) throw error;
  }

  /**
   * Full initial Cloud Workspace hydration:
   * Fetches profiles, circles & memberships, channels, recent messages + reactions,
   * hangout pins + RSVPs, blocked users, and server-side privacy-enforced circle map members.
   */
  async fetchCloudWorkspace(userId: string): Promise<CloudWorkspaceSnapshot> {
    const client = this.getClient();

    const [
      profilesRes,
      circlesRes,
      membersRes,
      channelsRes,
      pinsRes,
      rsvpsRes,
      blockedRes,
    ] = await Promise.all([
      client.from('profiles').select('*').limit(200),
      client.from('circles').select('*').order('created_at', { ascending: true }),
      client.from('circle_members').select('circle_id, user_id, role'),
      client.from('channels').select('*').order('created_at', { ascending: true }),
      client.from('hangout_pins').select('*').order('created_at', { ascending: false }),
      client.from('hangout_rsvps').select('pin_id, user_id, status'),
      client.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
    ]);

    const profiles: Record<string, Profile> = {};
    (profilesRes.data ?? []).forEach((row, idx) => {
      const mapped = mapDbProfileToProfile(row as Record<string, unknown>, idx);
      profiles[mapped.id] = mapped;
    });

    const membersByCircle = new Map<string, Array<{ user_id: string; role: string }>>();
    (membersRes.data ?? []).forEach((m) => {
      const cid = String(m.circle_id);
      const list = membersByCircle.get(cid) ?? [];
      list.push({ user_id: String(m.user_id), role: String(m.role ?? 'member') });
      membersByCircle.set(cid, list);
    });

    const circles: Circle[] = (circlesRes.data ?? []).map((row, idx) =>
      mapDbCircleToCircle(
        row as Record<string, unknown>,
        membersByCircle.get(String(row.id)) ?? [],
        idx
      )
    );

    const rsvpsByPin = new Map<string, Array<{ userId: string; status: RsvpStatus }>>();
    (rsvpsRes.data ?? []).forEach((r) => {
      const pid = String(r.pin_id);
      const statusRaw = String(r.status);
      const status: RsvpStatus =
        statusRaw === 'otw' || statusRaw === 'maybe' ? statusRaw : 'going';
      const list = rsvpsByPin.get(pid) ?? [];
      list.push({ userId: String(r.user_id), status });
      rsvpsByPin.set(pid, list);
    });

    const hangoutPins: HangoutPin[] = (pinsRes.data ?? []).map((row) =>
      mapDbPinToHangoutPin(
        row as Record<string, unknown>,
        rsvpsByPin.get(String(row.id)) ?? []
      )
    );

    const pinByChannel = new Map<string, string>();
    hangoutPins.forEach((p) => pinByChannel.set(p.channelId, p.id));

    const channels: Channel[] = (channelsRes.data ?? []).map((row) => {
      const ch = mapDbChannelToChannel(row as Record<string, unknown>);
      const pinId = pinByChannel.get(ch.id);
      return pinId ? { ...ch, hangoutPinId: pinId } : ch;
    });

    const channelIds = channels.map((c) => c.id);
    let messages: Message[] = [];
    if (channelIds.length > 0) {
      const [msgsRes, reactionsRes] = await Promise.all([
        client
          .from('messages')
          .select('*')
          .in('channel_id', channelIds)
          .order('created_at', { ascending: true })
          .limit(300),
        client.from('message_reactions').select('message_id, user_id, emoji'),
      ]);

      const reactionsByMsg = new Map<string, MessageReaction[]>();
      (reactionsRes.data ?? []).forEach((rx) => {
        const mid = String(rx.message_id);
        const emoji = String(rx.emoji);
        const uid = String(rx.user_id);
        const list = reactionsByMsg.get(mid) ?? [];
        const existing = list.find((item) => item.emoji === emoji);
        if (existing) {
          if (!existing.userIds.includes(uid)) existing.userIds.push(uid);
        } else {
          list.push({ emoji, userIds: [uid] });
        }
        reactionsByMsg.set(mid, list);
      });

      messages = (msgsRes.data ?? []).map((row) => {
        const chId = String(row.channel_id);
        return mapDbMessageToMessage(
          row as Record<string, unknown>,
          reactionsByMsg.get(String(row.id)) ?? [],
          pinByChannel.get(chId)
        );
      });
    }

    // Fetch server-enforced circle map locations via RPC get_circle_map_members
    const locations: Record<string, UserLocation> = {};
    await Promise.all(
      circles.map(async (circle) => {
        try {
          const members = await this.getCircleMapMembers(circle.id);
          if (Array.isArray(members)) {
            members.forEach((row) => {
              const loc = mapMapMemberToLocation(row as Record<string, unknown>);
              locations[loc.userId] = loc;
            });
          }
        } catch {
          // Ignore individual circle map RPC errors
        }
      })
    );

    const voiceLounges: VoiceLounge[] = circles.map((circle) => ({
      id: `vl-${circle.id}`,
      circleId: circle.id,
      name: 'Meja Nongkrong',
      topic: `Ruang suara ${circle.name}`,
      participantIds: [],
      speakingUserIds: [],
    }));

    const blockedUserIds = (blockedRes.data ?? []).map((b) => String(b.blocked_id));

    return {
      profiles,
      circles,
      channels,
      messages,
      hangoutPins,
      locations,
      voiceLounges,
      blockedUserIds,
    };
  }

  async fetchLivekitToken(
    roomName: string,
    participantName: string,
    circleId?: string
  ): Promise<{ token: string; url: string }> {
    const client = this.getClient();
    const { data, error } = await client.functions.invoke('livekit-token', {
      body: {
        circleId: circleId ?? roomName,
        roomName,
        participantName,
      },
    });
    if (error) throw error;
    return data as { token: string; url: string };
  }

  async registerPushToken(token: string, platform: 'web' | 'ios' | 'android' | 'desktop') {
    const client = this.getClient();
    const session = await this.getSession();
    if (!session?.user) return;
    const { error } = await client.from('push_tokens').upsert({
      user_id: session.user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async uploadMediaBlob(userId: string, blob: Blob, ext: string): Promise<string> {
    const client = this.getClient();
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await client.storage.from('zona-media').upload(path, blob, {
      contentType: blob.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw error;
    const { data, error: signErr } = await client.storage
      .from('zona-media')
      .createSignedUrl(path, 60 * 60 * 24);
    if (signErr || !data?.signedUrl) {
      throw signErr ?? new Error('Gagal membuat signed URL media');
    }
    return data.signedUrl;
  }

  async sendMessage(msg: Message) {
    const client = this.getClient();
    const row: Record<string, unknown> = {
      channel_id: msg.channelId,
      sender_id: msg.senderId,
      reply_to_id: isValidUuid(msg.replyToId) ? msg.replyToId : null,
      msg_type: msg.type,
      content: msg.content,
      media_url: msg.mediaUrl ?? msg.audioUrl ?? null,
      voice_duration_sec: msg.voiceDurationSec ?? null,
      snap_view_once: Boolean(msg.snapViewOnce),
      expires_at: msg.expiresAt ?? null,
    };
    if (isValidUuid(msg.id)) {
      row.id = msg.id;
    }
    const { error } = await client.from('messages').insert(row);
    if (error) throw error;
  }

  async editMessage(messageId: string, content: string) {
    if (!isValidUuid(messageId)) return;
    const client = this.getClient();
    const { error } = await client
      .from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId);
    if (error) throw error;
  }

  async deleteMessage(messageId: string) {
    if (!isValidUuid(messageId)) return;
    const client = this.getClient();
    const { error } = await client
      .from('messages')
      .update({ content: 'Pesan ini telah dihapus', is_deleted: true })
      .eq('id', messageId);
    if (error) throw error;
  }

  async toggleReaction(messageId: string, userId: string, emoji: string, active: boolean) {
    if (!isValidUuid(messageId)) return;
    const client = this.getClient();
    if (active) {
      const { error } = await client.from('message_reactions').upsert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
      if (error) throw error;
    } else {
      const { error } = await client
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
      if (error) throw error;
    }
  }

  async createChannel(circleId: string, name: string, topic?: string): Promise<Channel> {
    const client = this.getClient();
    const { data, error } = await client
      .from('channels')
      .insert({
        circle_id: circleId,
        type: 'text',
        name,
        topic: topic ?? 'Diskusi topik',
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapDbChannelToChannel(data as Record<string, unknown>);
  }

  async upsertHangoutRsvp(pinId: string, userId: string, status: RsvpStatus) {
    if (!isValidUuid(pinId)) return;
    const client = this.getClient();
    const { error } = await client.from('hangout_rsvps').upsert({
      pin_id: pinId,
      user_id: userId,
      status,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  /**
   * Subscribes to live workspace Postgres changes across messages, channels,
   * hangout_pins, and hangout_rsvps so updates propagate instantly across PC & Mobile.
   */
  subscribeWorkspaceChanges(handlers: WorkspaceRealtimeHandlers): RealtimeChannel | null {
    if (!this.client) return null;

    const channel = this.client
      .channel('zona-workspace-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const mapped = mapDbMessageToMessage(payload.new as Record<string, unknown>);
          handlers.onMessageInsert?.(mapped);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          handlers.onMessageUpdate?.(String(row.id), {
            content: String(row.content ?? ''),
            editedAt: row.edited_at ? String(row.edited_at) : undefined,
            isDeleted: Boolean(row.is_deleted),
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const oldRow = payload.old as Record<string, unknown>;
          if (oldRow?.id) {
            handlers.onMessageDelete?.(String(oldRow.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handlers.onChannelUpsert?.(
              mapDbChannelToChannel(payload.new as Record<string, unknown>)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_pins' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            handlers.onHangoutPinUpsert?.(
              mapDbPinToHangoutPin(payload.new as Record<string, unknown>)
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hangout_rsvps' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as Record<string, unknown>;
            const statusRaw = String(row.status);
            const status: RsvpStatus =
              statusRaw === 'otw' || statusRaw === 'maybe' ? statusRaw : 'going';
            handlers.onHangoutRsvpUpsert?.(
              String(row.pin_id),
              String(row.user_id),
              status
            );
          }
        }
      )
      .subscribe();

    return channel;
  }

  /**
   * Subscribes to per-channel Supabase Presence for real-time "sedang mengetik..." & online status.
   */
  subscribeChannelPresence(
    channelId: string,
    userId: string,
    displayName: string,
    onTypingUsersChange: (names: string[]) => void
  ): {
    channel: RealtimeChannel;
    setTyping: (isTyping: boolean) => void;
    unsubscribe: () => void;
  } | null {
    if (!this.client) return null;

    const channel = this.client.channel(`zona-presence:${channelId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{
          userId: string;
          displayName: string;
          isTyping: boolean;
        }>();
        const typing: string[] = [];
        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            if (entry.isTyping && entry.userId !== userId && entry.displayName) {
              if (!typing.includes(entry.displayName)) {
                typing.push(entry.displayName);
              }
            }
          });
        });
        onTypingUsersChange(typing);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId, displayName, isTyping: false });
        }
      });

    return {
      channel,
      setTyping: (isTyping: boolean) => {
        channel.track({ userId, displayName, isTyping }).catch(() => undefined);
      },
      unsubscribe: () => {
        this.client?.removeChannel(channel).catch(() => undefined);
      },
    };
  }

  subscribeChannel(
    channelId: string,
    userId: string,
    displayName: string,
    onIncomingMessage: (payload: Record<string, unknown>) => void,
    onTypingUsersChange: (names: string[]) => void
  ): RealtimeChannel | null {
    if (!this.client) return null;

    const channel = this.client.channel(`zona-ch:${channelId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          onIncomingMessage(payload.new as Record<string, unknown>);
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ displayName: string; isTyping: boolean }>();
        const typing: string[] = [];
        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            if (entry.isTyping && entry.displayName !== displayName) {
              typing.push(entry.displayName);
            }
          });
        });
        onTypingUsersChange(typing);
      })
      .subscribe();

    return channel;
  }

  async updateLocation(
    userId: string,
    point: Coordinates,
    privacyMode: PrivacyMode,
    areaLabel: string,
    activityEmoji: string,
    activityText: string
  ) {
    const client = this.getClient();
    const { error } = await client.from('user_locations').upsert({
      user_id: userId,
      point: `SRID=4326;POINT(${point.lng} ${point.lat})`,
      privacy_mode: privacyMode,
      area_label: areaLabel,
      activity_emoji: activityEmoji,
      activity_text: activityText,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async getCircleMapMembers(circleId: string) {
    const client = this.getClient();
    const { data, error } = await client.rpc('get_circle_map_members', {
      p_circle_id: circleId,
    });
    if (error) throw error;
    return data;
  }

  async createCircle(name: string, shortCode: string) {
    const client = this.getClient();
    const { data, error } = await client.rpc('create_circle_with_defaults', {
      p_name: name,
      p_short_code: shortCode,
    });
    if (error) throw error;
    return data as { circle_id: string; invite_code: string; default_channel_id: string };
  }

  async joinCircleByInvite(inviteCode: string) {
    const client = this.getClient();
    const { data, error } = await client.rpc('join_circle_by_invite', {
      p_invite_code: inviteCode,
    });
    if (error) throw error;
    return data as string;
  }

  async createHangoutPin(
    circleId: string,
    title: string,
    placeName: string,
    point: Coordinates
  ) {
    const client = this.getClient();
    const { data, error } = await client.rpc('create_hangout_pin', {
      p_circle_id: circleId,
      p_title: title,
      p_place_name: placeName,
      p_lat: point.lat,
      p_lng: point.lng,
    });
    if (error) throw error;
    return data as { pin_id: string; channel_id: string };
  }

  async blockUser(blockerId: string, blockedId: string) {
    const client = this.getClient();
    const { error } = await client.from('blocked_users').upsert({
      blocker_id: blockerId,
      blocked_id: blockedId,
    });
    if (error) throw error;
  }

  async unblockUser(blockerId: string, blockedId: string) {
    const client = this.getClient();
    const { error } = await client
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedId);
    if (error) throw error;
  }

  async reportContent(
    reporterId: string,
    reason: string,
    targetUserId?: string,
    targetMessageId?: string
  ) {
    const client = this.getClient();
    const { error } = await client.from('moderation_reports').insert({
      reporter_id: reporterId,
      target_user_id: isValidUuid(targetUserId) ? targetUserId : null,
      target_message_id: isValidUuid(targetMessageId) ? targetMessageId : null,
      reason,
    });
    if (error) throw error;
  }
}

export function createZonaCloudBackend(config: SupabaseEnvConfig): ZonaCloudBackend {
  return new ZonaCloudBackend(config);
}
