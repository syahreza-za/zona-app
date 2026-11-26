import { describe, expect, it } from 'vitest';
import {
  clusterMapMarkers,
  createClientUuid,
  dataUrlToBlob,
  distanceMeters,
  estimateEtaMinutes,
  flushCloudOutbox,
  formatDateSeparator,
  groupMessages,
  isValidUuid,
  mapDbMessageToMessage,
  mapMapMemberToLocation,
  resolveVisibleCoordinates,
  useZonaStore,
  type Message,
} from '../index';

describe('ZONA Fuzzy Location Privacy & Distance Math', () => {
  const blokM = { lat: -6.2442, lng: 106.8006 };
  const kemang = { lat: -6.2608, lng: 106.8139 };

  it('hides coordinates completely in ghost mode', () => {
    expect(resolveVisibleCoordinates(blokM, 'ghost', 'u-reza', 100)).toBeNull();
  });

  it('returns exact coordinates in exact mode', () => {
    expect(resolveVisibleCoordinates(blokM, 'exact', 'u-reza', 100)).toEqual(blokM);
  });

  it('offsets fuzzy coordinates by 300-550m deterministically per hour bucket', () => {
    const a = resolveVisibleCoordinates(blokM, 'fuzzy', 'u-dimas', 500);
    const b = resolveVisibleCoordinates(blokM, 'fuzzy', 'u-dimas', 500);
    const nextHour = resolveVisibleCoordinates(blokM, 'fuzzy', 'u-dimas', 501);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a).not.toEqual(nextHour);

    const dist = distanceMeters(blokM, a!);
    expect(dist).toBeGreaterThanOrEqual(290);
    expect(dist).toBeLessThanOrEqual(560);
  });

  it('estimates realistic urban ETA between Blok M and Kemang', () => {
    const eta = estimateEtaMinutes(blokM, kemang);
    expect(eta).toBeGreaterThanOrEqual(4);
    expect(eta).toBeLessThanOrEqual(15);
  });
});

describe('ZONA Message Grouping & Date Separators', () => {
  const now = new Date('2026-11-26T12:00:00.000Z');

  it('formats date separator labels in natural Indonesian', () => {
    expect(formatDateSeparator('2026-11-26T09:15:00.000Z', now)).toBe('Hari ini');
    expect(formatDateSeparator('2026-11-25T18:00:00.000Z', now)).toBe('Kemarin');
    expect(formatDateSeparator('2026-11-12T10:00:00.000Z', now)).toBe('12 Nov');
  });

  it('groups consecutive messages from same sender within 3 minutes', () => {
    const mk = (id: string, senderId: string, createdAt: string): Message => ({
      id,
      channelId: 'dm-1',
      senderId,
      type: 'text',
      content: id,
      reactions: [],
      status: 'read',
      createdAt,
    });

    const grouped = groupMessages(
      [
        mk('1', 'u-a', '2026-11-26T10:00:00.000Z'),
        mk('2', 'u-a', '2026-11-26T10:01:30.000Z'),
        mk('3', 'u-a', '2026-11-26T10:02:45.000Z'),
        mk('4', 'u-a', '2026-11-26T10:10:00.000Z'), // > 3 min gap
        mk('5', 'u-b', '2026-11-26T10:10:30.000Z'), // different sender
      ],
      now
    );

    expect(grouped[0].groupPosition).toBe('first');
    expect(grouped[0].showAvatar).toBe(true);
    expect(grouped[0].showDateSeparator).toBe(true);

    expect(grouped[1].groupPosition).toBe('middle');
    expect(grouped[1].showAvatar).toBe(false);

    expect(grouped[2].groupPosition).toBe('last');
    expect(grouped[2].showAvatar).toBe(false);

    expect(grouped[3].groupPosition).toBe('single');
    expect(grouped[3].showAvatar).toBe(true);

    expect(grouped[4].groupPosition).toBe('single');
    expect(grouped[4].showSenderName).toBe(true);
  });
});

describe('ZONA Map Spatial Clustering', () => {
  it('merges nearby markers and keeps distant markers separate', () => {
    const clusters = clusterMapMarkers(
      [
        { userId: 'u-1', point: { lat: -6.2442, lng: 106.8006 } },
        { userId: 'u-2', point: { lat: -6.2444, lng: 106.8009 } }, // ~40m away
        { userId: 'u-3', point: { lat: -6.2608, lng: 106.8139 } }, // ~2.3km away
      ],
      280
    );

    expect(clusters.length).toBe(2);
    const merged = clusters.find((c) => c.isCluster);
    expect(merged?.items.length).toBe(2);
    const solo = clusters.find((c) => !c.isCluster);
    expect(solo?.items[0].userId).toBe('u-3');
  });
});

describe('ZONA Production Store (Offline Outbox, Circles, Safety & Bridge)', () => {
  it('queues messages while offline and flushes to sent when back online', () => {
    const store = useZonaStore.getState();
    store.setOnlineStatus(false);

    const msg = store.sendTextMessage('ch-kampus-umum', 'Pesan saat offline');
    expect(msg.status).toBe('sending');
    expect(useZonaStore.getState().outbox.some((o) => o.messageId === msg.id)).toBe(true);

    store.setOnlineStatus(true);
    const updated = useZonaStore.getState().messages.find((m) => m.id === msg.id);
    expect(updated?.status).toBe('sent');
    expect(useZonaStore.getState().outbox.length).toBe(0);
  });

  it('supports editing and soft-deleting own messages', () => {
    const store = useZonaStore.getState();
    const msg = store.sendTextMessage('ch-kampus-umum', 'Teks awal');
    store.editMessage(msg.id, 'Teks diperbarui');

    const edited = useZonaStore.getState().messages.find((m) => m.id === msg.id);
    expect(edited?.content).toBe('Teks diperbarui');
    expect(edited?.editedAt).toBeDefined();

    store.deleteMessage(msg.id);
    const deleted = useZonaStore.getState().messages.find((m) => m.id === msg.id);
    expect(deleted?.isDeleted).toBe(true);
  });

  it('creates a Circle with invite code and allows joining by invite code', () => {
    const store = useZonaStore.getState();
    const circle = store.createCircle('Komunitas Lari Pagi', 'LP');
    expect(circle.inviteCode.startsWith('ZONA-')).toBe(true);

    const res = store.joinCircleByCode(circle.inviteCode);
    expect(res.ok).toBe(true);
    expect(res.circle?.id).toBe(circle.id);

    const bad = store.joinCircleByCode('INVALID');
    expect(bad.ok).toBe(false);
  });

  it('creates a Hangout Pin and auto-spawns a dedicated ephemeral channel + RSVP card', () => {
    const store = useZonaStore.getState();
    const prevChannelCount = store.channels.length;
    const prevPinCount = store.hangoutPins.length;

    const { pin, channel } = store.createHangoutPin({
      circleId: 'c-kampus',
      title: 'Makan Malam Bareng',
      placeName: 'Gultik Blok M',
      startsAtLabel: 'Malam ini · 20.00 WIB',
      point: { lat: -6.2435, lng: 106.7982 },
    });

    const next = useZonaStore.getState();
    expect(next.hangoutPins.length).toBe(prevPinCount + 1);
    expect(next.channels.length).toBe(prevChannelCount + 1);
    expect(channel.type).toBe('hangout');
    expect(channel.hangoutPinId).toBe(pin.id);
    expect(next.activeChannelId).toBe(channel.id);

    const cardMsg = next.messages.find(
      (m) => m.channelId === channel.id && m.type === 'hangout_card'
    );
    expect(cardMsg).toBeDefined();
  });

  it('supports blocking, unblocking, and reporting for Store safety compliance', () => {
    const store = useZonaStore.getState();
    store.blockUser('u-tara');
    expect(useZonaStore.getState().blockedUserIds).toContain('u-tara');
    store.unblockUser('u-tara');
    expect(useZonaStore.getState().blockedUserIds).not.toContain('u-tara');

    const rep = store.reportContent({
      targetUserId: 'u-tara',
      reason: 'Spam berulang',
    });
    expect(useZonaStore.getState().reports.some((r) => r.id === rep.id)).toBe(true);
  });

  it('joins and leaves Voice Lounge cleanly with screen share reset', () => {
    const store = useZonaStore.getState();
    store.joinVoiceLounge('vl-kampus-santai');
    store.toggleScreenShare();
    let next = useZonaStore.getState();
    expect(next.activeVoiceLoungeId).toBe('vl-kampus-santai');
    expect(next.isScreenSharing).toBe(true);
    expect(
      next.voiceLounges
        .find((v) => v.id === 'vl-kampus-santai')
        ?.participantIds.filter((id) => id === next.currentUserId).length
    ).toBe(1);

    store.leaveVoiceLounge();
    next = useZonaStore.getState();
    expect(next.activeVoiceLoungeId).toBeNull();
    expect(next.isScreenSharing).toBe(false);
  });
});

describe('ZONA Cloud Sync Core & Outbox Retry Logic', () => {
  it('generates valid RFC 4122 UUIDs for optimistic messages', () => {
    const id = createClientUuid();
    expect(isValidUuid(id)).toBe(true);
    expect(isValidUuid('msg-legacy-123')).toBe(false);
  });

  it('converts base64 data URLs to Blobs with proper extension', () => {
    const sampleDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    const res = dataUrlToBlob(sampleDataUrl);
    expect(res).not.toBeNull();
    expect(res?.ext).toBe('png');
    expect(res?.blob.type).toBe('image/png');
    expect(res?.blob.size).toBeGreaterThan(0);
  });

  it('uploads Quick Snap media to signed URL and flushes outbox cleanly', async () => {
    const snapId = createClientUuid();
    const textId = createClientUuid();
    const uploaded: string[] = [];
    const sent: Message[] = [];

    const messages: Message[] = [
      {
        id: textId,
        channelId: createClientUuid(),
        senderId: createClientUuid(),
        type: 'text',
        content: 'Pesan offline pertama',
        reactions: [],
        status: 'sending',
        createdAt: new Date().toISOString(),
      },
      {
        id: snapId,
        channelId: createClientUuid(),
        senderId: createClientUuid(),
        type: 'quick_snap',
        content: 'Ngopi sore',
        mediaUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        snapCaption: 'Ngopi sore',
        reactions: [],
        status: 'sending',
        createdAt: new Date().toISOString(),
      },
    ];

    const outbox = messages.map((m, idx) => ({
      id: `ob-${idx}`,
      messageId: m.id,
      channelId: m.channelId,
      createdAt: m.createdAt,
    }));

    const result = await flushCloudOutbox({
      outbox,
      messages,
      adapter: {
        uploadMediaBlob: async (_uid, _blob, ext) => {
          uploaded.push(ext);
          return `https://cdn.zona.app/signed/${snapId}.${ext}`;
        },
        sendMessage: async (msg) => {
          sent.push(msg);
        },
      },
    });

    expect(result.syncedIds).toEqual([textId, snapId]);
    expect(result.failedIds).toEqual([]);
    expect(uploaded).toEqual(['jpg']);
    expect(result.updatedMediaUrls[snapId]?.mediaUrl).toContain('https://cdn.zona.app/signed/');
    expect(sent.find((m) => m.id === snapId)?.mediaUrl).toContain('https://cdn.zona.app/signed/');
  });

  it('retries transient send failures and retains permanently failing items in outbox without data loss', async () => {
    const flakyId = createClientUuid();
    const brokenId = createClientUuid();
    let flakyAttempts = 0;

    const messages: Message[] = [
      {
        id: flakyId,
        channelId: createClientUuid(),
        senderId: createClientUuid(),
        type: 'text',
        content: 'Berhasil di percobaan kedua',
        reactions: [],
        status: 'sending',
        createdAt: new Date().toISOString(),
      },
      {
        id: brokenId,
        channelId: createClientUuid(),
        senderId: createClientUuid(),
        type: 'text',
        content: 'Tetap di antrean saat server down',
        reactions: [],
        status: 'sending',
        createdAt: new Date().toISOString(),
      },
    ];

    const outbox = messages.map((m, idx) => ({
      id: `ob-${idx}`,
      messageId: m.id,
      channelId: m.channelId,
      createdAt: m.createdAt,
    }));

    const result = await flushCloudOutbox({
      outbox,
      messages,
      maxRetriesPerItem: 2,
      adapter: {
        uploadMediaBlob: async () => 'https://example.com/unused',
        sendMessage: async (msg) => {
          if (msg.id === flakyId) {
            flakyAttempts += 1;
            if (flakyAttempts === 1) throw new Error('Transient 503');
            return;
          }
          throw new Error('Persistent offline');
        },
      },
    });

    expect(flakyAttempts).toBe(2);
    expect(result.syncedIds).toEqual([flakyId]);
    expect(result.failedIds).toEqual([brokenId]);
  });

  it('maps Supabase message and map member rows accurately', () => {
    const mappedMsg = mapDbMessageToMessage({
      id: createClientUuid(),
      channel_id: createClientUuid(),
      sender_id: createClientUuid(),
      msg_type: 'voice_note',
      content: 'Pesan suara (0:12)',
      media_url: 'https://cdn.zona.app/vn.webm',
      voice_duration_sec: 12,
      created_at: '2026-11-26T08:00:00Z',
    });
    expect(mappedMsg.type).toBe('voice_note');
    expect(mappedMsg.audioUrl).toBe('https://cdn.zona.app/vn.webm');
    expect(mappedMsg.voiceDurationSec).toBe(12);

    const mappedLoc = mapMapMemberToLocation({
      user_id: createClientUuid(),
      privacy_mode: 'fuzzy',
      lat: -6.2442,
      lng: 106.8006,
      area_label: 'Senopati',
      activity_emoji: '🎧',
      activity_text: 'Di ruang suara',
      battery_pct: 78,
      updated_at: '2026-11-26T08:00:00Z',
    });
    expect(mappedLoc.privacyMode).toBe('fuzzy');
    expect(mappedLoc.point.lat).toBeCloseTo(-6.2442, 4);
    expect(mappedLoc.areaLabel).toBe('Senopati');
  });
});
