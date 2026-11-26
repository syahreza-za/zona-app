import { describe, expect, it } from 'vitest';
import {
  clusterMapMarkers,
  distanceMeters,
  estimateEtaMinutes,
  formatDateSeparator,
  groupMessages,
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
