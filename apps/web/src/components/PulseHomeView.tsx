import { useMemo } from 'react';
import {
  MapPin,
  Plus,
} from 'lucide-react';
import {
  distanceMeters,
  formatDistanceLabel,
  useZonaStore,
  type Coordinates,
  type Message,
  type RsvpStatus,
  type ZonaCloudBackend,
} from '@zona/shared';
import { Avatar } from './Avatar';
import { SocialMapPanel } from './SocialMapPanel';
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

function formatChannelDisplay(name: string): string {
  if (name.toLowerCase() === 'umum') return 'Obrolan';
  return name.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
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

  // Active 24h Quick Snaps — deduplicated by mediaUrl so there are zero duplicate photos
  const activeSnaps = useMemo(() => {
    const now = Date.now();
    const seenMedia = new Set<string>();
    return messages
      .filter(
        (m) =>
          m.type === 'quick_snap' &&
          !m.isDeleted &&
          !blockedUserIds.includes(m.senderId) &&
          (!m.expiresAt || new Date(m.expiresAt).getTime() > now)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((m) => {
        const key = m.mediaUrl || m.id;
        if (seenMedia.has(key)) return false;
        seenMedia.add(key);
        return true;
      });
  }, [messages, blockedUserIds]);

  const visibleVoiceLounges = useMemo(
    () =>
      voiceLounges.filter((vl) => (!activeCircleId ? true : vl.circleId === activeCircleId)),
    [voiceLounges, activeCircleId]
  );

  const visibleHangouts = useMemo(
    () =>
      hangoutPins
        .filter((p) => (!activeCircleId ? true : p.circleId === activeCircleId))
        .slice(0, 1),
    [hangoutPins, activeCircleId]
  );

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
              ? msg.snapCaption || 'Momen baru'
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

  const handleToggleVoice = async (loungeId: string, loungeName: string, circleId: string) => {
    if (activeVoiceLoungeId === loungeId) {
      await zonaVoiceEngine.disconnect();
      leaveVoiceLounge();
      onNotify(`Keluar dari ${loungeName}.`);
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
        ? `Terhubung ke ${loungeName} (LiveKit)`
        : `Masuk ke ${loungeName}`
    );
  };

  return (
    <main className="pulse-canvas" aria-label="Beranda Pulse ZONA">
      <div className="pulse-editorial-grid">
        {/* LEFT COLUMN: Clean Hero Map + Flat Momen Strip (NO nested cards!) */}
        <div className="pulse-col-left">
          <section className="pulse-hero-map" aria-label="Peta Sosial">
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

          <section className="pulse-flat-section moments-block" aria-label="Momen">
            <div className="pulse-flat-head">
              <h2 className="pulse-heading">Momen</h2>
              <button
                type="button"
                className="pulse-plain-link"
                onClick={onOpenQuickSnap}
              >
                + Unggah
              </button>
            </div>

            <div className="moments-strip">
              <button
                id="btn-pulse-share-moment"
                type="button"
                className="moment-tile create"
                onClick={onOpenQuickSnap}
              >
                <span className="moment-plus-icon">
                  <Plus size={18} strokeWidth={1.9} />
                </span>
                <span className="moment-create-label">Bagikan</span>
              </button>

              {activeSnaps.map((snap, idx) => {
                const author = profiles[snap.senderId];
                if (!author) return null;
                return (
                  <button
                    key={snap.id}
                    type="button"
                    className="moment-tile"
                    onClick={() => onOpenStory(activeSnaps, idx)}
                  >
                    {snap.mediaUrl && (
                      <img
                        src={snap.mediaUrl}
                        alt={snap.snapCaption ?? author.displayName}
                        className="moment-tile-img"
                      />
                    )}
                    <div className="moment-tile-scrim" aria-hidden="true" />
                    <div className="moment-tile-meta">
                      <span className="moment-tile-author">{author.displayName}</span>
                      <span className="moment-tile-caption">
                        {snap.snapCaption || 'Momen'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: Separated by 1px Vertical Hairline (Suara · Kumpul · Obrolan) */}
        <div className="pulse-col-right">
          {/* 1. Suara */}
          <section className="pulse-flat-section" aria-label="Suara">
            <div className="pulse-flat-head">
              <h2 className="pulse-heading">Suara</h2>
            </div>

            <div className="suara-list">
              {visibleVoiceLounges.map((lounge) => {
                const joined = activeVoiceLoungeId === lounge.id;
                return (
                  <div key={lounge.id} className="suara-row">
                    <button
                      type="button"
                      className="suara-row-main"
                      onClick={() => {
                        if (joined) {
                          onOpenVoiceStage();
                        } else {
                          void handleToggleVoice(lounge.id, lounge.name, lounge.circleId);
                        }
                      }}
                    >
                      <span className="lamp-dot" aria-hidden="true" />
                      <span className="suara-name">{lounge.name}</span>
                      <div className="avatar-stack compact">
                        {lounge.participantIds.slice(0, 3).map((uid) => {
                          const p = profiles[uid];
                          if (!p) return null;
                          return (
                            <span key={uid} className="avatar-stack-item">
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
                    </button>

                    <button
                      id={`btn-pulse-voice-${lounge.id}`}
                      type="button"
                      className={`onoff-btn ${joined ? 'on' : ''}`}
                      onClick={() =>
                        void handleToggleVoice(lounge.id, lounge.name, lounge.circleId)
                      }
                    >
                      {joined ? 'Keluar' : 'Masuk'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <hr className="flat-divider" />

          {/* 2. Kumpul */}
          <section className="pulse-flat-section" aria-label="Kumpul">
            <div className="pulse-flat-head">
              <h2 className="pulse-heading">Kumpul</h2>
              <button
                type="button"
                className="pulse-plain-link"
                onClick={() => onOpenHangoutModal()}
              >
                + Baru
              </button>
            </div>

            {visibleHangouts.length === 0 ? (
              <div className="flat-empty">
                <span>Belum ada jadwal kumpul.</span>
                <button
                  type="button"
                  className="onoff-btn"
                  onClick={() => onOpenHangoutModal()}
                >
                  Buat Pin
                </button>
              </div>
            ) : (
              visibleHangouts.map((pin) => {
                const myRsvp = pin.rsvps.find((r) => r.userId === currentUserId);
                const distText = myLoc
                  ? formatDistanceLabel(distanceMeters(myLoc.point, pin.point))
                  : '';

                return (
                  <div key={pin.id} className="kumpul-flat-block">
                    <button
                      type="button"
                      className="kumpul-minimap-btn"
                      onClick={() => onExpandMap(pin.id)}
                      aria-label={`Lihat ${pin.placeName} di peta`}
                    >
                      <img
                        src={
                          theme === 'dark'
                            ? './media/minimap-kemang-dark.webp'
                            : './media/minimap-kemang-light.webp'
                        }
                        alt={pin.placeName}
                        className="kumpul-minimap-img"
                      />
                    </button>

                    <div className="kumpul-copy">
                      <h3 className="kumpul-title">{pin.title}</h3>
                      <p className="kumpul-meta">
                        <span>{pin.placeName}</span>
                        <span>·</span>
                        <span>{pin.startsAtLabel.replace('Hari ini · ', '')}</span>
                        {distText && (
                          <>
                            <span>·</span>
                            <span>{distText}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="rsvp-flat-row" role="group" aria-label="Status kehadiran">
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
                          className={`rsvp-flat-btn ${myRsvp?.status === opt.id ? 'on' : ''}`}
                          onClick={() => {
                            respondToHangout(pin.id, opt.id);
                            void zonaCloudSync.syncHangoutRsvp(pin.id, opt.id);
                            onNotify(`Status: ${opt.label}`);
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    <div className="kumpul-links">
                      <button
                        type="button"
                        className="pulse-plain-link"
                        onClick={() => {
                          selectCircle(pin.circleId);
                          selectChannel(pin.channelId);
                          onOpenChannelInRuang(pin.channelId);
                        }}
                      >
                        Obrolan
                      </button>
                      <span className="meta-dot">·</span>
                      <button
                        type="button"
                        className="pulse-plain-link"
                        onClick={() => onExpandMap(pin.id)}
                      >
                        Peta
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </section>

          <hr className="flat-divider" />

          {/* 3. Obrolan */}
          <section className="pulse-flat-section" aria-label="Obrolan">
            <div className="pulse-flat-head">
              <h2 className="pulse-heading">Obrolan</h2>
              <button
                type="button"
                className="pulse-plain-link"
                onClick={onOpenRuangAll}
              >
                Semua
              </button>
            </div>

            <div className="obrolan-flat-list">
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
                    className="obrolan-flat-row"
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
                      />
                    ) : (
                      <span className="flat-circle-avatar">
                        {ch.type === 'hangout' ? (
                          <MapPin size={14} strokeWidth={1.8} />
                        ) : (
                          parentCircle?.shortCode ?? 'ZN'
                        )}
                      </span>
                    )}

                    <div className="obrolan-flat-body">
                      <div className="obrolan-flat-top">
                        <span className="obrolan-flat-name">
                          {isDm ? ch.name : `${parentCircle?.name ?? 'Circle'} · ${formatChannelDisplay(ch.name)}`}
                        </span>
                        <span className="obrolan-flat-time">{formatShortTime(last?.createdAt)}</span>
                      </div>
                      <div className="obrolan-flat-bottom">
                        <span className="obrolan-flat-preview">
                          {last
                            ? `${!isDm && last.senderName ? `${last.senderName}: ` : ''}${last.text}`
                            : ch.topic ?? ''}
                        </span>
                        {ch.unreadCount > 0 && <span className="lamp-dot" aria-label={`${ch.unreadCount} belum dibaca`} />}
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
