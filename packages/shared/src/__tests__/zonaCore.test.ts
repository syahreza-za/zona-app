import { describe, expect, it } from 'vitest';
import {
  distanceMeters,
  estimateEtaMinutes,
  resolveVisibleCoordinates,
  useZonaStore,
} from '../index';

describe('ZONA Fuzzy Location Privacy & Distance Math', () => {
  const blokM = { lat: -6.2442, lng: 106.8006 };
  const kemang = { lat: -6.2608, lng: 106.8139 };

  it('hides coordinates completely in ghost mode', () => {
    expect(resolveVisibleCoordinates(blokM, 'ghost', 'u-reza', 100)).toBeNull();
  });

  it('returns exact coordinates in exact mode', () => {
    expect(resolveVisibleCoordinates(blokM, 'exact', 'u-reza', 100)).toEqual(
      blokM
    );
  });

  it('offsets fuzzy coordinates by 300-550m deterministically per hour bucket', () => {
    const a = resolveVisibleCoordinates(blokM, 'fuzzy', 'u-dimas', 500);
    const b = resolveVisibleCoordinates(blokM, 'fuzzy', 'u-dimas', 500);
    expect(a).not.toBeNull();
    expect(a).toEqual(b);

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
      startsAtLabel: 'Malam ini • 20.00 WIB',
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

  it('supports blocking and unblocking users for Store safety compliance', () => {
    const store = useZonaStore.getState();
    store.blockUser('u-tara');
    expect(useZonaStore.getState().blockedUserIds).toContain('u-tara');
    store.unblockUser('u-tara');
    expect(useZonaStore.getState().blockedUserIds).not.toContain('u-tara');
  });

  it('joins and leaves Voice Lounge cleanly without duplicating participants', () => {
    const store = useZonaStore.getState();
    store.joinVoiceLounge('vl-kampus-santai');
    let next = useZonaStore.getState();
    expect(next.activeVoiceLoungeId).toBe('vl-kampus-santai');
    expect(
      next.voiceLounges
        .find((v) => v.id === 'vl-kampus-santai')
        ?.participantIds.filter((id) => id === next.currentUserId).length
    ).toBe(1);

    store.leaveVoiceLounge();
    next = useZonaStore.getState();
    expect(next.activeVoiceLoungeId).toBeNull();
  });
});
