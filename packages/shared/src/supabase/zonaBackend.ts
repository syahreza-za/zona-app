import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { Coordinates, Message, PrivacyMode } from '../types';

export interface SupabaseEnvConfig {
  url?: string;
  anonKey?: string;
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
      throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.');
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

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
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
    const { error } = await client.from('messages').insert({
      id: msg.id,
      channel_id: msg.channelId,
      sender_id: msg.senderId,
      reply_to_id: msg.replyToId ?? null,
      msg_type: msg.type,
      content: msg.content,
      media_url: msg.mediaUrl ?? msg.audioUrl ?? null,
      voice_duration_sec: msg.voiceDurationSec ?? null,
      snap_view_once: Boolean(msg.snapViewOnce),
      expires_at: msg.expiresAt ?? null,
    });
    if (error) throw error;
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

  async reportContent(reporterId: string, reason: string, targetUserId?: string, targetMessageId?: string) {
    const client = this.getClient();
    const { error } = await client.from('moderation_reports').insert({
      reporter_id: reporterId,
      target_user_id: targetUserId ?? null,
      target_message_id: targetMessageId ?? null,
      reason,
    });
    if (error) throw error;
  }
}

export function createZonaCloudBackend(config: SupabaseEnvConfig): ZonaCloudBackend {
  return new ZonaCloudBackend(config);
}
