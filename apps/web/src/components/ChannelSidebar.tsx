import { useMemo, useState } from 'react';
import {
  Hash,
  Headphones,
  Link2,
  MapPin,
  Maximize2,
  Mic,
  MicOff,
  MonitorUp,
  Moon,
  PhoneOff,
  Plus,
  Search,
  Settings,
  Signal,
  SlidersHorizontal,
  Sun,
  UserPlus,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import {
  useZonaStore,
  type CircleBannerStyle,
  type Message,
  type ZonaCloudBackend,
} from '@zona/shared';
import { Avatar } from './Avatar';
import { zonaCloudSync } from '../services/cloudSync';
import { zonaVoiceEngine, type AudioDeviceInfo } from '../services/livekitVoice';

interface ChannelSidebarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  cloudBackend: ZonaCloudBackend;
  mobileMode?: 'chat' | 'circles';
  onChannelPicked?: () => void;
  onOpenVoiceStage: () => void;
  onOpenStory: (stories: Message[], startIndex: number) => void;
  onOpenCircleModal: () => void;
  onOpenSettings: () => void;
  onNotify: (msg: string) => void;
}

const BANNER_GRADIENTS: Record<CircleBannerStyle, string> = {
  emerald: 'linear-gradient(135deg, #065F46 0%, #10B981 58%, #D97706 100%)',
  sky: 'linear-gradient(135deg, #0C4A6E 0%, #0284C7 55%, #38BDF8 100%)',
  amber: 'linear-gradient(135deg, #78350F 0%, #D97706 60%, #F59E0B 100%)',
  coral: 'linear-gradient(135deg, #9A3412 0%, #EA580C 60%, #FB923C 100%)',
  teal: 'linear-gradient(135deg, #115E59 0%, #0D9488 60%, #2DD4BF 100%)',
};

function formatShortTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function ChannelSidebar({
  theme,
  onToggleTheme,
  cloudBackend,
  mobileMode,
  onChannelPicked,
  onOpenVoiceStage,
  onOpenStory,
  onOpenCircleModal,
  onOpenSettings,
  onNotify,
}: ChannelSidebarProps) {
  const {
    currentUserId,
    isOnline,
    outbox,
    profiles,
    circles,
    channels,
    messages,
    voiceLounges,
    blockedUserIds,
    activeCircleId,
    activeChannelId,
    activeVoiceLoungeId,
    isMuted,
    isDeafened,
    isScreenSharing,
    selectCircle,
    selectChannel,
    startDirectMessage,
    createChannel,
    joinVoiceLounge,
    leaveVoiceLounge,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
  } = useZonaStore();

  const [dmSearch, setDmSearch] = useState('');
  const [dmFilter, setDmFilter] = useState<'all' | 'unread'>('all');
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [audioDevices, setAudioDevices] = useState<AudioDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');

  const effectiveCircleId =
    mobileMode === 'chat'
      ? null
      : mobileMode === 'circles'
        ? activeCircleId ?? circles[0]?.id ?? null
        : activeCircleId;

  const activeCircle = circles.find((c) => c.id === effectiveCircleId) ?? null;
  const me = profiles[currentUserId];
  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);

  // Active 24h Quick Snaps for the Stories Strip above DM list
  const activeSnapStories = useMemo(() => {
    const now = Date.now();
    const snaps = messages
      .filter(
        (m) =>
          m.type === 'quick_snap' &&
          !m.isDeleted &&
          !blockedUserIds.includes(m.senderId) &&
          (!m.expiresAt || new Date(m.expiresAt).getTime() > now)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // One representative latest snap per friend
    const seen = new Set<string>();
    const unique: Message[] = [];
    for (const s of snaps) {
      if (!seen.has(s.senderId)) {
        seen.add(s.senderId);
        unique.push(s);
      }
    }
    return unique;
  }, [messages, blockedUserIds]);

  const lastMessageByChannel = useMemo(() => {
    const map: Record<string, { text: string; createdAt: string }> = {};
    for (const msg of messages) {
      if (blockedUserIds.includes(msg.senderId)) continue;
      const existing = map[msg.channelId];
      if (!existing || msg.createdAt > existing.createdAt) {
        map[msg.channelId] = {
          text: msg.isDeleted ? 'Pesan dihapus' : msg.content,
          createdAt: msg.createdAt,
        };
      }
    }
    return map;
  }, [messages, blockedUserIds]);

  const dmChannels = useMemo(() => {
    const q = dmSearch.trim().toLowerCase();
    return channels
      .filter((ch) => ch.circleId === null && !ch.isArchived)
      .filter((ch) => {
        if (dmFilter === 'unread' && ch.unreadCount === 0) return false;
        if (!q) return true;
        const last = lastMessageByChannel[ch.id]?.text ?? '';
        return ch.name.toLowerCase().includes(q) || last.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const ta = lastMessageByChannel[a.id]?.createdAt ?? '';
        const tb = lastMessageByChannel[b.id]?.createdAt ?? '';
        return tb.localeCompare(ta);
      });
  }, [channels, dmSearch, dmFilter, lastMessageByChannel]);

  const circleChannels = useMemo(
    () =>
      channels.filter(
        (ch) => ch.circleId === effectiveCircleId && !ch.isArchived
      ),
    [channels, effectiveCircleId]
  );

  const circleVoiceLounges = useMemo(
    () =>
      activeCircle
        ? voiceLounges.filter((v) => v.circleId === activeCircle.id)
        : [],
    [activeCircle, voiceLounges]
  );

  const circleOnlineCount = activeCircle
    ? activeCircle.memberIds.filter((uid) => profiles[uid]?.isOnline).length
    : 0;

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCircle || !newChannelName.trim()) return;
    const ch = createChannel(activeCircle.id, newChannelName);
    void zonaCloudSync.syncCreateChannel(ch);
    setNewChannelName('');
    setAddingChannel(false);
    onNotify('Kanal baru dibuat.');
    onChannelPicked?.();
  };

  const handleCopyInvite = async () => {
    if (!activeCircle) return;
    const inviteUrl = `${window.location.origin}/?invite=${activeCircle.inviteCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      onNotify(`Tautan undangan disalin (${activeCircle.inviteCode})`);
    } catch {
      onNotify(`Kode undangan: ${activeCircle.inviteCode}`);
    }
  };

  const handleJoinVoice = async (loungeId: string, loungeName: string) => {
    if (activeVoiceLoungeId === loungeId) {
      onOpenVoiceStage();
      return;
    }
    joinVoiceLounge(loungeId);
    const lounge = voiceLounges.find((v) => v.id === loungeId);
    const { backendMode, setVoiceSpeakingUsers } = useZonaStore.getState();
    const res = await zonaVoiceEngine.connect({
      roomName: loungeId,
      circleId: lounge?.circleId ?? activeCircle?.id,
      participantName: me?.displayName ?? 'Anggota',
      backendMode,
      cloudBackend,
      onActiveSpeakers: (identities) => {
        setVoiceSpeakingUsers(loungeId, identities);
      },
      onDisconnected: () => {
        leaveVoiceLounge();
      },
    });
    onNotify(
      res.mode === 'livekit'
        ? `Terhubung ke ruang suara LiveKit ${loungeName}`
        : `Bergabung ke ${loungeName}`
    );
  };

  const handleLeaveVoice = async () => {
    await zonaVoiceEngine.disconnect();
    leaveVoiceLounge();
  };

  const handleToggleMute = async () => {
    const nextMuted = !isMuted;
    toggleMute();
    await zonaVoiceEngine.setMuted(nextMuted);
  };

  const handleToggleScreenShare = async () => {
    const next = !isScreenSharing;
    const ok = await zonaVoiceEngine.setScreenShare(next);
    if (ok || !next) {
      toggleScreenShare();
      onNotify(next ? 'Berbagi layar aktif.' : 'Berbagi layar dihentikan.');
    }
  };

  const handleToggleDevices = async () => {
    if (!devicesOpen) {
      const list = await zonaVoiceEngine.listAudioDevices();
      setAudioDevices(list);
    }
    setDevicesOpen((v) => !v);
  };

  const availableContacts = Object.values(profiles).filter(
    (p) => p.id !== currentUserId && !blockedUserIds.includes(p.id)
  );

  return (
    <section className="channel-sidebar" aria-label="Daftar Obrolan">
      {/* Circle Cover Banner (Photographic Cover Art + Smooth Dark Legibility Scrim) */}
      {activeCircle ? (
        <header
          className="circle-cover-banner"
          style={{
            background: BANNER_GRADIENTS[activeCircle.bannerStyle ?? 'emerald'],
          }}
        >
          {activeCircle.bannerImage && (
            <img
              src={activeCircle.bannerImage}
              alt=""
              className="circle-banner-photo"
              aria-hidden="true"
            />
          )}
          <div className="circle-banner-scrim" aria-hidden="true" />
          <div className="circle-banner-content">
            <div style={{ minWidth: 0 }}>
              <h2 className="circle-banner-title">{activeCircle.name}</h2>
              <p className="circle-banner-meta">
                <span className="banner-online-dot" />
                <span>
                  {circleOnlineCount} online · {activeCircle.memberIds.length} anggota
                </span>
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                className="banner-icon-btn"
                onClick={handleCopyInvite}
                title="Salin tautan undangan"
                aria-label="Salin tautan undangan"
              >
                <Link2 size={15} strokeWidth={1.9} />
              </button>
              <button
                id="btn-add-channel"
                type="button"
                className="banner-icon-btn"
                onClick={() => setAddingChannel((v) => !v)}
                title="Buat kanal baru"
                aria-label="Buat kanal baru"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        </header>
      ) : (
        <header className="sidebar-header">
          <h2 className="sidebar-title">Pesan</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setNewDmOpen((v) => !v)}
            title="Mulai obrolan baru"
            aria-label="Mulai obrolan baru"
          >
            <UserPlus size={17} strokeWidth={1.75} />
          </button>
        </header>
      )}

      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={14} strokeWidth={1.75} />
          <span>Offline · {outbox.length} pesan menunggu koneksi</span>
        </div>
      )}

      {/* Mobile Circle Switcher when on Circles tab */}
      {mobileMode === 'circles' && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 12px 2px',
            overflowX: 'auto',
          }}
        >
          {circles.map((circle) => (
            <button
              key={circle.id}
              type="button"
              className={`filter-tab ${activeCircle?.id === circle.id ? 'active' : ''}`}
              onClick={() => selectCircle(circle.id)}
              style={{ whiteSpace: 'nowrap' }}
            >
              {circle.name}
            </button>
          ))}
          <button
            type="button"
            className="filter-tab"
            onClick={onOpenCircleModal}
            style={{ whiteSpace: 'nowrap' }}
          >
            + Baru
          </button>
        </div>
      )}

      {/* DM Mode: Quick Snap Stories Strip (52px proportional avatars) + Search & Filter */}
      {!activeCircle && (
        <>
          {activeSnapStories.length > 0 && (
            <div className="stories-strip" aria-label="Quick Snap 24 Jam">
              {activeSnapStories.map((snap, idx) => {
                const author = profiles[snap.senderId];
                if (!author) return null;
                const viewed = snap.snapViewedBy?.includes(currentUserId);
                return (
                  <button
                    key={snap.id}
                    type="button"
                    className="story-ring-item"
                    onClick={() => onOpenStory(activeSnapStories, idx)}
                    title={`Quick Snap dari ${author.displayName}`}
                  >
                    <span className={`story-ring-frame ${viewed ? 'viewed' : ''}`}>
                      <span className="story-ring-inner">
                        <Avatar
                          initials={author.initials}
                          color={author.avatarColor}
                          variant={author.avatarVariant}
                          seed={author.id}
                          avatarUrl={author.avatarUrl}
                          size="story"
                        />
                      </span>
                    </span>
                    <span className="story-ring-name">{author.displayName}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="sidebar-search-wrap">
            <div className="sidebar-search-box">
              <Search size={15} strokeWidth={1.75} className="sidebar-search-icon" />
              <input
                type="search"
                className="sidebar-search-input"
                placeholder="Cari obrolan"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
              />
            </div>
            <div className="filter-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={dmFilter === 'all'}
                className={`filter-tab ${dmFilter === 'all' ? 'active' : ''}`}
                onClick={() => setDmFilter('all')}
              >
                Semua
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={dmFilter === 'unread'}
                className={`filter-tab ${dmFilter === 'unread' ? 'active' : ''}`}
                onClick={() => setDmFilter('unread')}
              >
                Belum Dibaca
              </button>
            </div>
          </div>
        </>
      )}

      {/* Quick Start DM Contact Picker */}
      {!activeCircle && newDmOpen && (
        <div style={{ padding: '4px 12px 8px', borderBottom: '1px solid var(--border-hairline)' }}>
          <div className="sidebar-section-header" style={{ paddingLeft: 0 }}>
            <span>Mulai Obrolan</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {availableContacts.map((person) => (
              <button
                key={person.id}
                type="button"
                className="filter-tab"
                style={{ background: 'var(--bg-input)' }}
                onClick={() => {
                  startDirectMessage(person.id);
                  setNewDmOpen(false);
                  onChannelPicked?.();
                }}
              >
                {person.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-scroll">
        {!activeCircle ? (
          <div className="nav-list">
            {dmChannels.length === 0 ? (
              <p className="meta-text" style={{ padding: '16px 10px', textAlign: 'center' }}>
                Tidak ada obrolan ditemukan.
              </p>
            ) : (
              dmChannels.map((ch) => {
                const isActive = ch.id === activeChannelId;
                const partnerId = ch.participantIds?.find((id) => id !== currentUserId);
                const partner = partnerId ? profiles[partnerId] : null;
                const last = lastMessageByChannel[ch.id];

                return (
                  <button
                    key={ch.id}
                    id={`channel-btn-${ch.id}`}
                    type="button"
                    className={`dm-row ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      selectChannel(ch.id);
                      onChannelPicked?.();
                    }}
                  >
                    {partner && (
                      <Avatar
                        initials={partner.initials}
                        color={partner.avatarColor}
                        variant={partner.avatarVariant}
                        seed={partner.id}
                        avatarUrl={partner.avatarUrl}
                        size="md"
                        online={partner.isOnline}
                        showPresence
                      />
                    )}
                    <div className="dm-row-body">
                      <div className="dm-row-top">
                        <span className="dm-row-name">{ch.name}</span>
                        <span className="meta-text">{formatShortTime(last?.createdAt)}</span>
                      </div>
                      <div className="dm-row-bottom">
                        <span className="dm-row-preview">
                          {last?.text ?? partner?.statusText ?? 'Mulai percakapan'}
                        </span>
                        {ch.unreadCount > 0 && (
                          <span className="unread-badge">{ch.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <>
            {addingChannel && (
              <form onSubmit={handleCreateChannel} style={{ display: 'flex', gap: 6, padding: '0 4px' }}>
                <input
                  className="field-input"
                  style={{ height: 34, fontSize: 13 }}
                  placeholder="nama-kanal"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ height: 34, padding: '0 12px', fontSize: 13 }}
                >
                  Buat
                </button>
              </form>
            )}

            <div>
              <div className="sidebar-section-header">
                <span>Kanal Teks</span>
              </div>
              <div className="nav-list">
                {circleChannels.map((ch) => {
                  const isActive = ch.id === activeChannelId;
                  return (
                    <button
                      key={ch.id}
                      id={`channel-btn-${ch.id}`}
                      type="button"
                      className={`channel-row ${isActive ? 'active' : ''} ${ch.unreadCount > 0 ? 'unread' : ''}`}
                      onClick={() => {
                        selectChannel(ch.id);
                        onChannelPicked?.();
                      }}
                    >
                      {ch.type === 'hangout' ? (
                        <MapPin size={16} strokeWidth={1.75} color="var(--accent)" />
                      ) : (
                        <Hash size={16} strokeWidth={1.75} />
                      )}
                      <span className="channel-row-name">{ch.name}</span>
                      {ch.type === 'hangout' && <span className="hangout-pill">Kumpul</span>}
                      {ch.unreadCount > 0 && (
                        <span className="unread-badge">{ch.unreadCount}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="sidebar-section-header">
                <span>Voice Lounge</span>
                <Headphones size={13} strokeWidth={1.75} />
              </div>

              <div className="voice-group">
                {circleVoiceLounges.map((lounge) => {
                  const isJoined = activeVoiceLoungeId === lounge.id;
                  const anyoneSpeaking = lounge.speakingUserIds.length > 0;
                  return (
                    <div key={lounge.id} className={`voice-lounge-block ${isJoined ? 'joined' : ''}`}>
                      <button
                        id={`voice-toggle-${lounge.id}`}
                        type="button"
                        className={`voice-channel-row ${isJoined ? 'joined' : ''}`}
                        onClick={() => handleJoinVoice(lounge.id, lounge.name)}
                      >
                        <Volume2 size={16} strokeWidth={1.75} />
                        <span className="channel-row-name">{lounge.name}</span>
                        {lounge.participantIds.length > 0 && (
                          <span className="avatar-stack" aria-hidden="true">
                            {lounge.participantIds.slice(0, 3).map((uid) => {
                              const p = profiles[uid];
                              if (!p) return null;
                              return (
                                <span
                                  key={uid}
                                  className="avatar-stack-item"
                                  style={{ borderColor: 'var(--bg-sidebar)' }}
                                >
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
                          </span>
                        )}
                        {anyoneSpeaking && (
                          <span className="voice-eq sm" aria-label="Aktif berbicara">
                            <span />
                            <span />
                            <span />
                          </span>
                        )}
                      </button>

                      {lounge.participantIds.length > 0 && (
                        <div className="voice-member-list">
                          {lounge.participantIds.map((uid) => {
                            const p = profiles[uid];
                            if (!p) return null;
                            const speaking = lounge.speakingUserIds.includes(uid);
                            return (
                              <div key={uid} className="voice-member-item">
                                <Avatar
                                  initials={p.initials}
                                  color={p.avatarColor}
                                  variant={p.avatarVariant}
                                  seed={uid}
                                  avatarUrl={p.avatarUrl}
                                  size="xs"
                                  speaking={speaking}
                                />
                                <span
                                  style={{
                                    flex: 1,
                                    color: speaking ? 'var(--text-primary)' : undefined,
                                    fontWeight: speaking ? 600 : 400,
                                  }}
                                >
                                  {p.displayName}
                                </span>
                                {speaking && (
                                  <span className="voice-eq sm" aria-hidden="true">
                                    <span />
                                    <span />
                                    <span />
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Desktop Footer: Active Voice Bar + Compact User Profile Strip */}
      <footer className="sidebar-footer">
        {activeVoice && (
          <div className="voice-connected-bar">
            <div className="voice-connected-top">
              <div style={{ minWidth: 0 }}>
                <div className="voice-signal-row">
                  <Signal size={14} strokeWidth={2} />
                  <span>Suara Terhubung</span>
                </div>
                <div className="voice-room-sub">{activeVoice.name}</div>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button
                  id="btn-open-voice-stage"
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={onOpenVoiceStage}
                  title="Buka Voice Stage"
                  aria-label="Buka Voice Stage"
                >
                  <Maximize2 size={14} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 28, height: 28 }}
                  onClick={handleToggleDevices}
                  title="Perangkat audio"
                  aria-label="Perangkat audio"
                >
                  <SlidersHorizontal size={14} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {devicesOpen && (
              <select
                className="field-input"
                style={{ height: 30, fontSize: 12 }}
                value={selectedMicId}
                onChange={(e) => {
                  setSelectedMicId(e.target.value);
                  zonaVoiceEngine.switchAudioDevice('audioinput', e.target.value).catch(() => {});
                }}
              >
                <option value="">Mikrofon default sistem</option>
                {audioDevices
                  .filter((d) => d.kind === 'audioinput')
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
              </select>
            )}

            <div className="voice-controls-row">
              <button
                type="button"
                className={`voice-ctrl-btn ${isMuted ? 'danger' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
              >
                {isMuted ? <MicOff size={15} strokeWidth={1.75} /> : <Mic size={15} strokeWidth={1.75} />}
              </button>
              <button
                type="button"
                className={`voice-ctrl-btn ${isDeafened ? 'danger' : ''}`}
                onClick={toggleDeafen}
                title={isDeafened ? 'Aktifkan speaker' : 'Matikan speaker'}
              >
                {isDeafened ? (
                  <VolumeX size={15} strokeWidth={1.75} />
                ) : (
                  <Volume2 size={15} strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                className={`voice-ctrl-btn ${isScreenSharing ? 'active' : ''}`}
                onClick={handleToggleScreenShare}
                title="Berbagi layar"
              >
                <MonitorUp size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="voice-ctrl-btn danger"
                onClick={handleLeaveVoice}
                title="Keluar ruang suara"
              >
                <PhoneOff size={15} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        )}

        {me && (
          <div className="me-strip">
            <Avatar
              initials={me.initials}
              color={me.avatarColor}
              variant={me.avatarVariant}
              seed={me.id}
              avatarUrl={me.avatarUrl}
              size="sm"
              online={me.isOnline}
              showPresence
            />
            <div className="me-strip-info">
              <div className="me-strip-name">{me.displayName}</div>
              <div className="me-strip-status">
                {me.statusEmoji ? `${me.statusEmoji} ` : ''}
                {me.statusText}
              </div>
            </div>
            <button
              id="sidebar-theme-toggle"
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
              aria-label="Ganti tema"
            >
              {theme === 'dark' ? (
                <Sun size={16} strokeWidth={1.75} />
              ) : (
                <Moon size={16} strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 30, height: 30 }}
              onClick={onOpenSettings}
              title="Pengaturan"
              aria-label="Pengaturan"
            >
              <Settings size={16} strokeWidth={1.75} />
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}
