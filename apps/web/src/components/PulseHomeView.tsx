import { useMemo } from 'react';
import {
  ArrowUpRight,
  Camera,
  Headphones,
  Map as MapIcon,
  MapPin,
  Maximize2,
  MessageSquare,
  Plus,
} from 'lucide-react';
import {
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  useZonaStore,
  type Coordinates,
  type Message,
  type RsvpStatus,
  type ZonaCloudBackend,
} from '@zona/shared';
import { Avatar } from './Avatar';
import { HANGOUT_CATEGORY_META, SocialMapPanel } from './SocialMapPanel';
import { zonaCloudSync } from '../services/cloudSync';
import { zonaVoiceEngine } from '../services/livekitVoice';

interface PulseHomeViewProps {
  theme: 'dark' | 'light';
  cloudBackend: ZonaCloudBackend;
  onExpandMap: (focusPinId?: string) => void;
  onOpenChannelInRuang: (channelId: string) => void;
  onOpenRuangAll: () => void;
  onOpenStory: (stories: Message[], startIndex: number) => void;
  onOpenQuickSnap: () => void;
  onOpenHangoutModal: (coords?: Coordinates, placeGuess?: string) => void;
  onOpenVoiceStage: () => void;
  onNotify: (msg: string) => void;
}

function formatShortTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PulseHomeView({
  theme,
  cloudBackend,
  onExpandMap,
  onOpenChannelInRuang,
  onOpenRuangAll,
  onOpenStory,
  onOpenQuickSnap,
  onOpenHangoutModal,
  onOpenVoiceStage,
  onNotify,
}: PulseHomeViewProps) {
  const {
    currentUserId,
    profiles,
    circles,
    channels,
    messages,
    locations,
    hangoutPins,
    voiceLounges,
    blockedUserIds,
    activeCircleId,
    activeVoiceLoungeId,
    selectCircle,
    selectChannel,
    joinVoiceLounge,
    leaveVoiceLounge,
    respondToHangout,
  } = useZonaStore();

  const me = profiles[currentUserId];
  const myLoc = locations[currentUserId];
  const activeCircle = circles.find((c) => c.id === activeCircleId) ?? null;

  // Active 24h Quick Snaps sorted newest first
  const activeSnaps = useMemo(() => {
    const now = Date.now();
    return messages
      .filter(
        (m) =>
          m.type === 'quick_snap' &&
          !m.isDeleted &&
          !blockedUserIds.includes(m.senderId) &&
          (!m.expiresAt || new Date(m.expiresAt).getTime() > now)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [messages, blockedUserIds]);

  // Filtered Voice Lounges (respects Circle Workspace Selector)
  const visibleVoiceLounges = useMemo(
    () =>
      voiceLounges.filter((vl) => (!activeCircleId ? true : vl.circleId === activeCircleId)),
    [voiceLounges, activeCircleId]
  );

  // Filtered Hangout Pins
  const visibleHangouts = useMemo(
    () =>
      hangoutPins
        .filter((p) => (!activeCircleId ? true : p.circleId === activeCircleId))
        .slice(0, 2),
    [hangoutPins, activeCircleId]
  );

  // Last message per channel for Quick Inbox
  const lastMessageByChannel = useMemo(() => {
    const map: Record<string, { text: string; createdAt: string; senderName?: string }> = {};
    for (const msg of messages) {
      if (blockedUserIds.includes(msg.senderId)) continue;
      const existing = map[msg.channelId];
      if (!existing || msg.createdAt > existing.createdAt) {
        map[msg.channelId] = {
          text: msg.isDeleted
            ? 'Pesan dihapus'
            : msg.type === 'quick_snap'
              ? msg.snapCaption || 'Quick Snap 24 jam'
              : msg.type === 'voice_note'
                ? 'Pesan suara'
                : msg.content,
          createdAt: msg.createdAt,
          senderName: profiles[msg.senderId]?.displayName,
        };
      }
    }
    return map;
  }, [messages, blockedUserIds, profiles]);

  // Top 5 recent conversations (DMs + active Circle channels)
  const recentThreads = useMemo(() => {
    return channels
      .filter((ch) => !ch.isArchived)
      .filter((ch) => (!activeCircleId ? true : ch.circleId === null || ch.circleId === activeCircleId))
      .sort((a, b) => {
        const ta = lastMessageByChannel[a.id]?.createdAt ?? '';
        const tb = lastMessageByChannel[b.id]?.createdAt ?? '';
        return tb.localeCompare(ta);
      })
      .slice(0, 5);
  }, [channels, activeCircleId, lastMessageByChannel]);

  const handleJoinOrOpenVoice = async (loungeId: string, loungeName: string, circleId: string) => {
    if (activeVoiceLoungeId === loungeId) {
      onOpenVoiceStage();
      return;
    }
    joinVoiceLounge(loungeId);
    const { backendMode, setVoiceSpeakingUsers } = useZonaStore.getState();
    const res = await zonaVoiceEngine.connect({
      roomName: loungeId,
      circleId,
      participantName: me?.displayName ?? 'Anggota',
      backendMode,
      cloudBackend,
      onActiveSpeakers: (identities) => setVoiceSpeakingUsers(loungeId, identities),
      onDisconnected: () => leaveVoiceLounge(),
    });
    onNotify(
      res.mode === 'livekit'
        ? `Terhubung ke ruang suara LiveKit ${loungeName}`
        : `Bergabung ke ${loungeName}`
    );
  };

  return (
    <main className="pulse-canvas" aria-label="Beranda Pulse ZONA">
      <div className="pulse-bento-grid">
        {/* LEFT COLUMN (~60%): Hero Live Map Card + Quick Snap 3:4 Moments Strip */}
        <div className="pulse-col-primary">
          {/* 1. Hero Live Map Card */}
          <section className="pulse-hero-map-card" aria-label="Peta Sosial Langsung">
            <SocialMapPanel
              theme={theme}
              variant="hero"
              circleFilterOverride={activeCircleId ?? 'all'}
              onRequestPinAt={(coords, placeGuess) => onOpenHangoutModal(coords, placeGuess)}
              onExpandHeroMap={() => onExpandMap()}
              onSelectHangoutChannel={(channelId) => {
                if (channelId) onOpenChannelInRuang(channelId);
              }}
              onNotify={onNotify}
            />
          </section>

          {/* 2. Quick Snap Moments Strip (3:4 Editorial Vertical Photo Cards) */}
          <section className="pulse-card pulse-moments-section" aria-label="Momen 24 Jam">
            <div className="pulse-section-head">
              <div>
                <h2 className="pulse-section-title">Momen 24 Jam</h2>
                <p className="pulse-section-sub">
                  {activeSnaps.length} foto spontan aktif · hilang otomatis setelah 24 jam
                </p>
              </div>
              <button
                type="button"
                className="pulse-text-link"
                onClick={onOpenQuickSnap}
              >
                <Camera size={14} strokeWidth={1.9} />
                <span>Unggah</span>
              </button>
            </div>

            <div className="moments-strip">
              {/* First Card: + Bagikan Momen */}
              <button
                id="btn-pulse-share-moment"
                type="button"
                className="moment-card create"
                onClick={onOpenQuickSnap}
              >
                <span className="moment-create-circle">
                  <Plus size={20} strokeWidth={2.2} />
                </span>
                <strong className="moment-create-title">Bagikan Momen</strong>
                <span className="moment-create-hint">Quick Snap 24j</span>
              </button>

              {/* Friend 3:4 Snap Cards */}
              {activeSnaps.map((snap, idx) => {
                const author = profiles[snap.senderId];
                if (!author) return null;
                return (
                  <button
                    key={snap.id}
                    type="button"
                    className="moment-card"
                    style={{
                      background: snap.mediaUrl ? '#1C1917' : snap.snapGradient ?? '#292524',
                    }}
                    onClick={() => onOpenStory(activeSnaps, idx)}
                  >
                    {snap.mediaUrl && (
                      <img
                        src={snap.mediaUrl}
                        alt={snap.snapCaption ?? `Momen ${author.displayName}`}
                        className="moment-card-img"
                      />
                    )}
                    <div className="moment-card-scrim" aria-hidden="true" />
                    <span className="moment-badge">
                      {snap.snapViewOnce ? '1x' : '24j'}
                    </span>
                    <div className="moment-card-footer">
                      <div className="moment-author-row">
                        <Avatar
                          initials={author.initials}
                          color={author.avatarColor}
                          variant={author.avatarVariant}
                          seed={author.id}
                          avatarUrl={author.avatarUrl}
                          size="xs"
                        />
                        <span className="moment-author-name">{author.displayName}</span>
                      </div>
                      <p className="moment-caption">
                        {snap.snapCaption || 'Momen spontan'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN (~40%): Live Audio Lounges + Agenda Kumpul + Quick Inbox */}
        <div className="pulse-col-secondary">
          {/* 1. Live Audio Lounge Cards */}
          <section className="pulse-card" aria-label="Ruang Suara Aktif">
            <div className="pulse-section-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="live-indicator-dot" aria-hidden="true" />
                <h2 className="pulse-section-title">Ruang Suara Hidup</h2>
              </div>
              <span className="pulse-pill-counter">
                {visibleVoiceLounges.reduce((s, v) => s + v.participantIds.length, 0)} di udara
              </span>
            </div>

            <div className="pulse-voice-list">
              {visibleVoiceLounges.map((lounge) => {
                const joined = activeVoiceLoungeId === lounge.id;
                const parentCircle = circles.find((c) => c.id === lounge.circleId);
                return (
                  <div
                    key={lounge.id}
                    className={`pulse-voice-card ${joined ? 'joined' : ''}`}
                  >
                    <div className="pulse-voice-top">
                      <div style={{ minWidth: 0 }}>
                        <div className="pulse-voice-title-row">
                          <Headphones
                            size={15}
                            strokeWidth={2}
                            color={joined ? 'var(--live)' : 'var(--text-secondary)'}
                          />
                          <strong>{lounge.name}</strong>
                          <span className="voice-eq sm live" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                          </span>
                        </div>
                        <p className="pulse-voice-topic">
                          {parentCircle?.name ? `${parentCircle.name} · ` : ''}
                          {lounge.topic}
                        </p>
                      </div>
                    </div>

                    <div className="pulse-voice-bottom">
                      <div className="avatar-stack">
                        {lounge.participantIds.slice(0, 4).map((uid) => {
                          const p = profiles[uid];
                          if (!p) return null;
                          return (
                            <span key={uid} className="avatar-stack-item" title={p.displayName}>
                              <Avatar
                                initials={p.initials}
                                color={p.avatarColor}
                                variant={p.avatarVariant}
                                seed={uid}
                                avatarUrl={p.avatarUrl}
                                size="xs"
                              />
                            </span>
                          );
                        })}
                      </div>

                      <button
                        id={`btn-pulse-voice-${lounge.id}`}
                        type="button"
                        className={`pulse-voice-cta ${joined ? 'active' : ''}`}
                        onClick={() =>
                          void handleJoinOrOpenVoice(lounge.id, lounge.name, lounge.circleId)
                        }
                      >
                        {joined ? (
                          <>
                            <Maximize2 size={13} strokeWidth={2} />
                            <span>Buka Stage</span>
                          </>
                        ) : (
                          <span>Gabung Suara</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. Agenda Kumpul Terdekat (Hangout Pin Card with 1-Tap RSVP) */}
          <section className="pulse-card" aria-label="Agenda Kumpul Terdekat">
            <div className="pulse-section-head">
              <h2 className="pulse-section-title">Agenda Kumpul</h2>
              <button
                type="button"
                className="pulse-text-link"
                onClick={() => onOpenHangoutModal()}
              >
                <Plus size={14} strokeWidth={2} />
                <span>Buat Pin</span>
              </button>
            </div>

            {visibleHangouts.length === 0 ? (
              <div className="pulse-empty-box">
                <p>Belum ada rencana kumpul di {activeCircle?.name ?? 'circle ini'}.</p>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ height: 34, fontSize: 13 }}
                  onClick={() => onOpenHangoutModal()}
                >
                  <MapPin size={14} strokeWidth={2} />
                  <span>Tandai Titik Kumpul</span>
                </button>
              </div>
            ) : (
              <div className="pulse-hangout-stack">
                {visibleHangouts.map((pin) => {
                  const cat = HANGOUT_CATEGORY_META[pin.category ?? 'coffee'];
                  const CatIcon = cat.icon;
                  const myRsvp = pin.rsvps.find((r) => r.userId === currentUserId);
                  const goingCount = pin.rsvps.filter((r) => r.status !== 'maybe').length;
                  const distLabel = myLoc
                    ? `${formatDistanceLabel(distanceMeters(myLoc.point, pin.point))} · ~${estimateEtaMinutes(myLoc.point, pin.point)} mnt`
                    : 'Sekitar kamu';

                  return (
                    <article key={pin.id} className="pulse-agenda-card">
                      <div
                        className="pulse-agenda-map"
                        onClick={() => onExpandMap(pin.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onExpandMap(pin.id);
                        }}
                      >
                        <img
                          src={
                            theme === 'dark'
                              ? './media/minimap-kemang-dark.webp'
                              : './media/minimap-kemang-light.webp'
                          }
                          alt={`Peta ${pin.placeName}`}
                          className="pulse-agenda-map-img"
                        />
                        <div className="pulse-agenda-map-scrim" aria-hidden="true" />
                        <span className="minimap-cat-badge" style={{ background: cat.color }}>
                          <CatIcon size={11} strokeWidth={2} />
                          <span>{cat.label}</span>
                        </span>
                        <span className="minimap-eta-badge">{distLabel}</span>
                      </div>

                      <div className="pulse-agenda-body">
                        <div className="pulse-agenda-head">
                          <div>
                            <h3 className="pulse-agenda-title">{pin.title}</h3>
                            <p className="pulse-agenda-meta">
                              <MapPin size={12.5} strokeWidth={2} color="var(--accent)" />
                              <span>
                                {pin.placeName} · {pin.startsAtLabel}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="pulse-agenda-rsvp-row">
                          <div className="avatar-stack">
                            {pin.rsvps.slice(0, 4).map((r) => {
                              const p = profiles[r.userId];
                              if (!p) return null;
                              return (
                                <span
                                  key={r.userId}
                                  className="avatar-stack-item"
                                  title={`${p.displayName} (${r.status})`}
                                >
                                  <Avatar
                                    initials={p.initials}
                                    color={p.avatarColor}
                                    variant={p.avatarVariant}
                                    seed={p.id}
                                    avatarUrl={p.avatarUrl}
                                    size="xs"
                                  />
                                </span>
                              );
                            })}
                          </div>
                          <span className="meta-text">{goingCount} ikut / OTW</span>
                        </div>

                        <div className="rsvp-segment">
                          {(
                            [
                              { id: 'going', label: 'Ikut' },
                              { id: 'otw', label: 'OTW' },
                              { id: 'maybe', label: 'Nanti' },
                            ] as { id: RsvpStatus; label: string }[]
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`rsvp-choice ${myRsvp?.status === opt.id ? 'selected' : ''}`}
                              onClick={() => {
                                respondToHangout(pin.id, opt.id);
                                void zonaCloudSync.syncHangoutRsvp(pin.id, opt.id);
                                onNotify(`Status kehadiran: ${opt.label}`);
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        <div className="pulse-agenda-links">
                          <button
                            type="button"
                            className="inline-link-btn"
                            onClick={() => {
                              selectCircle(pin.circleId);
                              selectChannel(pin.channelId);
                              onOpenChannelInRuang(pin.channelId);
                            }}
                          >
                            <MessageSquare size={12} strokeWidth={1.9} />
                            <span>Buka Obrolan</span>
                          </button>
                          <button
                            type="button"
                            className="inline-link-btn"
                            onClick={() => onExpandMap(pin.id)}
                          >
                            <MapIcon size={12} strokeWidth={1.9} />
                            <span>Lihat di Peta</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Obrolan Terbaru (Quick Inbox -> jumps smoothly to Ruang) */}
          <section className="pulse-card" aria-label="Obrolan Terbaru">
            <div className="pulse-section-head">
              <h2 className="pulse-section-title">Obrolan Terbaru</h2>
              <button
                type="button"
                className="pulse-text-link"
                onClick={onOpenRuangAll}
              >
                <span>Buka Ruang</span>
                <ArrowUpRight size={14} strokeWidth={2} />
              </button>
            </div>

            <div className="pulse-inbox-list">
              {recentThreads.map((ch) => {
                const isDm = ch.type === 'dm';
                const partnerId = isDm
                  ? ch.participantIds?.find((id) => id !== currentUserId)
                  : undefined;
                const partner = partnerId ? profiles[partnerId] : null;
                const parentCircle = ch.circleId
                  ? circles.find((c) => c.id === ch.circleId)
                  : null;
                const last = lastMessageByChannel[ch.id];

                return (
                  <button
                    key={ch.id}
                    type="button"
                    className="pulse-inbox-row"
                    onClick={() => {
                      if (ch.circleId) selectCircle(ch.circleId);
                      selectChannel(ch.id);
                      onOpenChannelInRuang(ch.id);
                    }}
                  >
                    {isDm && partner ? (
                      <Avatar
                        initials={partner.initials}
                        color={partner.avatarColor}
                        variant={partner.avatarVariant}
                        seed={partner.id}
                        avatarUrl={partner.avatarUrl}
                        size="sm"
                        online={partner.isOnline}
                        showPresence
                      />
                    ) : (
                      <span
                        className="inbox-circle-emblem sm"
                        style={{
                          background: parentCircle?.accentColor ?? 'var(--accent)',
                        }}
                      >
                        {ch.type === 'hangout' ? (
                          <MapPin size={14} strokeWidth={2} />
                        ) : (
                          parentCircle?.shortCode ?? 'ZN'
                        )}
                      </span>
                    )}

                    <div className="pulse-inbox-copy">
                      <div className="pulse-inbox-top">
                        <strong className="pulse-inbox-name">
                          {isDm
                            ? ch.name
                            : `${parentCircle?.name ?? 'Circle'} · ${ch.name}`}
                        </strong>
                        <span className="meta-text">{formatShortTime(last?.createdAt)}</span>
                      </div>
                      <div className="pulse-inbox-bottom">
                        <span className="pulse-inbox-preview">
                          {last
                            ? `${!isDm && last.senderName ? `${last.senderName}: ` : ''}${last.text}`
                            : ch.topic ?? 'Belum ada pesan'}
                        </span>
                        {ch.unreadCount > 0 && (
                          <span className="unread-badge">{ch.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
