import {
  createZonaCloudBackend,
  dataUrlToBlob,
  flushCloudOutbox,
  isValidUuid,
  mapMapMemberToLocation,
  useZonaStore,
  type Channel,
  type Circle,
  type Coordinates,
  type HangoutPin,
  type Message,
  type PrivacyMode,
  type RsvpStatus,
  type UserLocation,
  type ZonaCloudBackend,
} from '@zona/shared';

/**
 * Shared Supabase Cloud client & Real-Time Sync Controller for Web PWA & Tauri Desktop.
 * Automatically activates when `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` are configured
 * and the user is authenticated in `cloud` mode; stays a clean no-op in `demo` mode.
 */
export const webCloudBackend: ZonaCloudBackend = createZonaCloudBackend({
  url: import.meta.env.VITE_SUPABASE_URL,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
});

type WorkspaceRealtimeChannel = ReturnType<ZonaCloudBackend['subscribeWorkspaceChanges']>;

class ZonaCloudSyncController {
  private workspaceChannel: WorkspaceRealtimeChannel = null;
  private presenceHandle: {
    channelId: string;
    setTyping: (isTyping: boolean) => void;
    unsubscribe: () => void;
  } | null = null;
  private typingResetTimer: number | null = null;
  private mapPollTimer: number | null = null;
  private flushingOutbox = false;

  isActive(): boolean {
    const { isAuthenticated, backendMode } = useZonaStore.getState();
    return isAuthenticated && backendMode === 'cloud' && webCloudBackend.isConfigured();
  }

  /**
   * Restores an existing Supabase session on page load (including Google/Apple OAuth redirect).
   */
  async restoreSessionIfPresent(): Promise<boolean> {
    if (!webCloudBackend.isConfigured()) return false;
    try {
      const session = await webCloudBackend.getSession();
      if (!session?.user) return false;
      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
      const fallbackName =
        String(meta.display_name ?? meta.full_name ?? session.user.email?.split('@')[0] ?? 'Pengguna');
      const fallbackUsername =
        String(meta.username ?? fallbackName)
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '') || 'zonauser';

      const state = useZonaStore.getState();
      if (!state.isAuthenticated || state.backendMode !== 'cloud') {
        state.completeOnboarding({
          displayName: fallbackName,
          username: fallbackUsername,
          avatarColor: '#10B981',
          avatarUrl: meta.avatar_url ? String(meta.avatar_url) : undefined,
          mode: 'cloud',
          userId: session.user.id,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  async hydrateFromCloud(): Promise<void> {
    if (!this.isActive()) return;
    const { currentUserId } = useZonaStore.getState();
    try {
      const snapshot = await webCloudBackend.fetchCloudWorkspace(currentUserId);
      useZonaStore.getState().hydrateCloudWorkspace(snapshot);
    } catch {
      // Keep local Dexie cache intact if offline or transient network error
    }
  }

  async refreshCircleMapLocations(): Promise<void> {
    if (!this.isActive()) return;
    const { circles } = useZonaStore.getState();
    const locs: Record<string, UserLocation> = {};
    await Promise.all(
      circles
        .filter((c) => isValidUuid(c.id))
        .map(async (circle) => {
          try {
            const rows = await webCloudBackend.getCircleMapMembers(circle.id);
            if (Array.isArray(rows)) {
              rows.forEach((row) => {
                const mapped = mapMapMemberToLocation(row as Record<string, unknown>);
                locs[mapped.userId] = mapped;
              });
            }
          } catch {
            // Skip failed circle
          }
        })
    );
    if (Object.keys(locs).length > 0) {
      useZonaStore.getState().applyCloudLocations(locs);
    }
  }

  startRealtime(): void {
    if (!this.isActive()) return;
    this.stopRealtime();

    this.workspaceChannel = webCloudBackend.subscribeWorkspaceChanges({
      onMessageInsert: (msg) => {
        useZonaStore.getState().applyIncomingMessage(msg);
      },
      onMessageUpdate: (messageId, patch) => {
        useZonaStore.getState().applyMessageUpdate(messageId, patch);
      },
      onMessageDelete: (messageId) => {
        useZonaStore.getState().applyMessageUpdate(messageId, {
          content: 'Pesan ini telah dihapus',
          isDeleted: true,
          reactions: [],
        });
      },
      onChannelUpsert: (channel) => {
        useZonaStore.getState().applyIncomingChannel(channel);
      },
      onHangoutPinUpsert: (pin) => {
        useZonaStore.getState().applyIncomingHangoutPin(pin);
      },
      onHangoutRsvpUpsert: (pinId, userId, status) => {
        useZonaStore.getState().applyIncomingHangoutRsvp(pinId, userId, status);
      },
    });

    // Periodically refresh privacy-enforced peer coordinates (every 20s)
    this.mapPollTimer = window.setInterval(() => {
      void this.refreshCircleMapLocations();
    }, 20_000);
  }

  watchChannelPresence(channelId: string): void {
    if (!this.isActive() || !channelId) {
      this.presenceHandle?.unsubscribe();
      this.presenceHandle = null;
      return;
    }
    if (this.presenceHandle?.channelId === channelId) return;

    this.presenceHandle?.unsubscribe();
    this.presenceHandle = null;

    const { currentUserId, profiles } = useZonaStore.getState();
    const displayName = profiles[currentUserId]?.displayName ?? 'Anggota';
    const sub = webCloudBackend.subscribeChannelPresence(
      channelId,
      currentUserId,
      displayName,
      (typingNames) => {
        useZonaStore.getState().setTypingUsers(channelId, typingNames);
      }
    );

    if (sub) {
      this.presenceHandle = {
        channelId,
        setTyping: sub.setTyping,
        unsubscribe: sub.unsubscribe,
      };
    }
  }

  notifyTyping(isTyping: boolean): void {
    if (!this.presenceHandle) return;
    this.presenceHandle.setTyping(isTyping);
    if (this.typingResetTimer) {
      window.clearTimeout(this.typingResetTimer);
      this.typingResetTimer = null;
    }
    if (isTyping) {
      this.typingResetTimer = window.setTimeout(() => {
        this.presenceHandle?.setTyping(false);
        this.typingResetTimer = null;
      }, 2800);
    }
  }

  stopRealtime(): void {
    if (this.workspaceChannel && webCloudBackend.isConfigured()) {
      webCloudBackend
        .getClient()
        .removeChannel(this.workspaceChannel)
        .catch(() => undefined);
      this.workspaceChannel = null;
    }
    if (this.presenceHandle) {
      this.presenceHandle.unsubscribe();
      this.presenceHandle = null;
    }
    if (this.typingResetTimer) {
      window.clearTimeout(this.typingResetTimer);
      this.typingResetTimer = null;
    }
    if (this.mapPollTimer) {
      window.clearInterval(this.mapPollTimer);
      this.mapPollTimer = null;
    }
  }

  async flushPendingOutbox(): Promise<number> {
    if (!this.isActive() || this.flushingOutbox) return 0;
    const { outbox, messages, isOnline } = useZonaStore.getState();
    if (!isOnline || outbox.length === 0) return 0;

    this.flushingOutbox = true;
    try {
      const result = await flushCloudOutbox({
        outbox,
        messages,
        adapter: {
          uploadMediaBlob: (uid, blob, ext) =>
            webCloudBackend.uploadMediaBlob(uid, blob, ext),
          sendMessage: (msg) => webCloudBackend.sendMessage(msg),
        },
      });

      result.syncedIds.forEach((id) => {
        const mediaPatch = result.updatedMediaUrls[id];
        useZonaStore.getState().markMessageSynced(id, mediaPatch);
      });

      return result.syncedIds.length;
    } finally {
      this.flushingOutbox = false;
    }
  }

  async syncSendMessage(msg: Message): Promise<void> {
    if (!this.isActive()) return;
    if (!useZonaStore.getState().isOnline || !isValidUuid(msg.channelId)) {
      useZonaStore.getState().queueMessageForOutbox(msg.id, msg.channelId);
      return;
    }

    try {
      let outbound = msg;
      let mediaPatch: Partial<Message> | undefined;

      if (msg.type === 'quick_snap' && msg.mediaUrl?.startsWith('data:')) {
        const converted = dataUrlToBlob(msg.mediaUrl);
        if (converted) {
          const signedUrl = await webCloudBackend.uploadMediaBlob(
            msg.senderId,
            converted.blob,
            converted.ext
          );
          outbound = { ...msg, mediaUrl: signedUrl };
          mediaPatch = { mediaUrl: signedUrl };
        }
      } else if (msg.type === 'voice_note' && msg.audioUrl?.startsWith('data:')) {
        const converted = dataUrlToBlob(msg.audioUrl);
        if (converted) {
          const signedUrl = await webCloudBackend.uploadMediaBlob(
            msg.senderId,
            converted.blob,
            converted.ext
          );
          outbound = { ...msg, audioUrl: signedUrl };
          mediaPatch = { audioUrl: signedUrl };
        }
      }

      await webCloudBackend.sendMessage(outbound);
      useZonaStore.getState().markMessageSynced(msg.id, mediaPatch);
    } catch {
      useZonaStore.getState().queueMessageForOutbox(msg.id, msg.channelId);
    }
  }

  async syncEditMessage(messageId: string, content: string): Promise<void> {
    if (!this.isActive()) return;
    try {
      await webCloudBackend.editMessage(messageId, content);
    } catch {
      // Optimistic edit remains locally
    }
  }

  async syncDeleteMessage(messageId: string): Promise<void> {
    if (!this.isActive()) return;
    try {
      await webCloudBackend.deleteMessage(messageId);
    } catch {
      // Optimistic soft-delete remains locally
    }
  }

  async syncToggleReaction(messageId: string, emoji: string): Promise<void> {
    if (!this.isActive()) return;
    const { currentUserId, messages } = useZonaStore.getState();
    const msg = messages.find((m) => m.id === messageId);
    const isNowActive = Boolean(
      msg?.reactions.find((r) => r.emoji === emoji)?.userIds.includes(currentUserId)
    );
    try {
      await webCloudBackend.toggleReaction(messageId, currentUserId, emoji, isNowActive);
    } catch {
      // Keep local optimistic reaction
    }
  }

  async syncCreateCircle(localCircle: Circle, localDefaultChannelId?: string): Promise<void> {
    if (!this.isActive()) return;
    try {
      const res = await webCloudBackend.createCircle(localCircle.name, localCircle.shortCode);
      const store = useZonaStore.getState();
      store.replaceEntityId('circle', localCircle.id, res.circle_id, {
        inviteCode: res.invite_code,
      });
      if (localDefaultChannelId && res.default_channel_id) {
        store.replaceEntityId('channel', localDefaultChannelId, res.default_channel_id);
      }
      await this.hydrateFromCloud();
    } catch {
      // Keep local circle if offline
    }
  }

  async syncJoinCircle(inviteCode: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isActive()) return { ok: false };
    try {
      const circleId = await webCloudBackend.joinCircleByInvite(inviteCode);
      await this.hydrateFromCloud();
      useZonaStore.getState().selectCircle(circleId);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Kode undangan Circle tidak ditemukan.',
      };
    }
  }

  async syncCreateChannel(localChannel: Channel): Promise<void> {
    if (!this.isActive() || !localChannel.circleId || !isValidUuid(localChannel.circleId)) {
      return;
    }
    try {
      const created = await webCloudBackend.createChannel(
        localChannel.circleId,
        localChannel.name,
        localChannel.topic
      );
      useZonaStore.getState().replaceEntityId('channel', localChannel.id, created.id);
    } catch {
      // Keep optimistic channel locally
    }
  }

  async syncCreateHangoutPin(localPin: HangoutPin, localChannel: Channel): Promise<void> {
    if (!this.isActive() || !isValidUuid(localPin.circleId)) return;
    try {
      const res = await webCloudBackend.createHangoutPin(
        localPin.circleId,
        localPin.title,
        localPin.placeName,
        localPin.point
      );
      const store = useZonaStore.getState();
      store.replaceEntityId('pin', localPin.id, res.pin_id);
      store.replaceEntityId('channel', localChannel.id, res.channel_id);
    } catch {
      // Keep local optimistic hangout pin
    }
  }

  async syncHangoutRsvp(pinId: string, status: RsvpStatus): Promise<void> {
    if (!this.isActive()) return;
    const { currentUserId } = useZonaStore.getState();
    try {
      await webCloudBackend.upsertHangoutRsvp(pinId, currentUserId, status);
    } catch {
      // Ignore transient RSVP sync failure
    }
  }

  async syncLocation(input?: {
    point?: Coordinates;
    privacyMode?: PrivacyMode;
    areaLabel?: string;
    activityEmoji?: string;
    activityText?: string;
  }): Promise<void> {
    if (!this.isActive()) return;
    const { currentUserId, locations } = useZonaStore.getState();
    const cur = locations[currentUserId];
    if (!cur) return;
    try {
      await webCloudBackend.updateLocation(
        currentUserId,
        input?.point ?? cur.point,
        input?.privacyMode ?? cur.privacyMode,
        input?.areaLabel ?? cur.areaLabel,
        input?.activityEmoji ?? cur.activityEmoji,
        input?.activityText ?? cur.activityText
      );
      await this.refreshCircleMapLocations();
    } catch {
      // Keep local location
    }
  }

  async syncProfile(patch: {
    displayName?: string;
    username?: string;
    avatarColor?: string;
    avatarUrl?: string;
    statusEmoji?: string;
    statusText?: string;
  }): Promise<void> {
    if (!this.isActive()) return;
    const { currentUserId } = useZonaStore.getState();
    try {
      let avatarUrl = patch.avatarUrl;
      if (avatarUrl?.startsWith('data:')) {
        const converted = dataUrlToBlob(avatarUrl);
        if (converted) {
          avatarUrl = await webCloudBackend.uploadMediaBlob(
            currentUserId,
            converted.blob,
            converted.ext
          );
        }
      }
      await webCloudBackend.upsertProfile(currentUserId, { ...patch, avatarUrl });
    } catch {
      // Keep local profile
    }
  }

  async syncBlockUser(targetUserId: string): Promise<void> {
    if (!this.isActive() || !isValidUuid(targetUserId)) return;
    try {
      await webCloudBackend.blockUser(useZonaStore.getState().currentUserId, targetUserId);
    } catch {
      // Keep local block list
    }
  }

  async syncUnblockUser(targetUserId: string): Promise<void> {
    if (!this.isActive() || !isValidUuid(targetUserId)) return;
    try {
      await webCloudBackend.unblockUser(useZonaStore.getState().currentUserId, targetUserId);
    } catch {
      // Keep local block list
    }
  }

  async syncReportContent(input: {
    reason: string;
    targetUserId?: string;
    targetMessageId?: string;
  }): Promise<void> {
    if (!this.isActive()) return;
    try {
      await webCloudBackend.reportContent(
        useZonaStore.getState().currentUserId,
        input.reason,
        input.targetUserId,
        input.targetMessageId
      );
    } catch {
      // Keep local report log
    }
  }
}

export const zonaCloudSync = new ZonaCloudSyncController();
