import { useState } from 'react';
import {
  Hash,
  Headphones,
  MapPin,
  Mic,
  MicOff,
  PhoneOff,
  Plus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';

interface ChannelSidebarProps {
  onChannelPicked?: () => void;
}

export function ChannelSidebar({ onChannelPicked }: ChannelSidebarProps) {
  const {
    currentUserId,
    profiles,
    circles,
    channels,
    voiceLounges,
    activeCircleId,
    activeChannelId,
    activeVoiceLoungeId,
    isMuted,
    isDeafened,
    selectCircle,
    selectChannel,
    createChannel,
    joinVoiceLounge,
    leaveVoiceLounge,
    toggleMute,
    toggleDeafen,
  } = useZonaStore();

  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const activeCircle = circles.find((c) => c.id === activeCircleId) ?? null;
  const visibleChannels = channels.filter((ch) => ch.circleId === activeCircleId);
  const circleVoiceLounges = activeCircle
    ? voiceLounges.filter((v) => v.circleId === activeCircle.id)
    : voiceLounges;

  const me = profiles[currentUserId];
  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCircle || !newChannelName.trim()) return;
    createChannel(activeCircle.id, newChannelName);
    setNewChannelName('');
    setAddingChannel(false);
    onChannelPicked?.();
  };

  return (
    <section className="channel-sidebar" aria-label="Daftar Chat dan Voice Lounge">
      <header className="sidebar-header">
        <div>
          <h2 className="sidebar-title">
            {activeCircle ? activeCircle.name : 'Pesan Langsung'}
          </h2>
          <p className="sidebar-subtitle">
            {activeCircle
              ? `${activeCircle.memberIds.length} anggota • ${activeCircle.inviteCode}`
              : 'Chat cepat offline-first'}
          </p>
        </div>

        {activeCircle && (
          <button
            id="btn-add-channel"
            type="button"
            className="icon-btn"
            onClick={() => setAddingChannel((v) => !v)}
            title="Buat kanal topik baru"
          >
            <Plus size={18} />
          </button>
        )}
      </header>

      {/* Quick switcher pills for mobile view where rail is hidden */}
      <div className="sidebar-scroll">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`pill-action ${activeCircleId === null ? 'primary' : ''}`}
            onClick={() => selectCircle(null)}
          >
            DM
          </button>
          {circles.map((circle) => (
            <button
              key={circle.id}
              type="button"
              className={`pill-action ${activeCircleId === circle.id ? 'primary' : ''}`}
              onClick={() => selectCircle(circle.id)}
            >
              {circle.shortCode} · {circle.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {addingChannel && activeCircle && (
          <form onSubmit={handleCreateChannel} style={{ display: 'flex', gap: 6 }}>
            <input
              className="field-input"
              style={{ flex: 1, height: 34, fontSize: 13 }}
              placeholder="nama-kanal (mis. liburan)"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="pill-action primary">
              Buat
            </button>
          </form>
        )}

        <div>
          <div className="section-label-row">
            <span>{activeCircle ? 'Kanal Topik & Kumpul' : 'Direct Messages'}</span>
            <span>{visibleChannels.length}</span>
          </div>

          <div className="channel-list">
            {visibleChannels.map((ch) => {
              const isActive = ch.id === activeChannelId;
              const dmPartnerId = ch.participantIds?.find((id) => id !== currentUserId);
              const dmPartner = dmPartnerId ? profiles[dmPartnerId] : null;

              return (
                <button
                  key={ch.id}
                  id={`channel-btn-${ch.id}`}
                  type="button"
                  className={`channel-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    selectChannel(ch.id);
                    onChannelPicked?.();
                  }}
                >
                  {ch.type === 'dm' && dmPartner ? (
                    <div
                      className="avatar sm"
                      style={{ background: dmPartner.avatarColor }}
                    >
                      {dmPartner.initials}
                      <span
                        className={`avatar-dot ${dmPartner.isOnline ? '' : 'offline'}`}
                      />
                    </div>
                  ) : ch.type === 'hangout' ? (
                    <MapPin size={16} color="var(--accent-coral)" />
                  ) : (
                    <Hash size={16} />
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="channel-name">{ch.name}</div>
                    {ch.topic && <span className="channel-meta">{ch.topic}</span>}
                    {dmPartner && (
                      <span className="channel-meta">
                        {dmPartner.statusEmoji} {dmPartner.statusText}
                      </span>
                    )}
                  </div>

                  {ch.type === 'hangout' && (
                    <span className="hangout-tag">PIN</span>
                  )}
                  {ch.unreadCount > 0 && (
                    <span className="unread-pill">{ch.unreadCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="section-label-row">
            <span>Voice Lounge (1-Tap Drop-In)</span>
            <Headphones size={13} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {circleVoiceLounges.map((lounge) => {
              const isJoined = activeVoiceLoungeId === lounge.id;
              return (
                <div
                  key={lounge.id}
                  className={`voice-card ${isJoined ? 'connected' : ''}`}
                >
                  <div className="voice-row">
                    <div className="voice-title">
                      <Volume2
                        size={15}
                        color={isJoined ? 'var(--accent-emerald)' : 'var(--text-secondary)'}
                      />
                      <span>{lounge.name}</span>
                    </div>
                    <button
                      id={`voice-toggle-${lounge.id}`}
                      type="button"
                      className={`voice-join-btn ${isJoined ? 'leave' : ''}`}
                      onClick={() =>
                        isJoined ? leaveVoiceLounge() : joinVoiceLounge(lounge.id)
                      }
                    >
                      {isJoined ? 'Keluar' : 'Masuk'}
                    </button>
                  </div>

                  <span className="channel-meta" style={{ marginTop: -2 }}>
                    {lounge.topic}
                  </span>

                  <div className="voice-members">
                    {lounge.participantIds.map((uid) => {
                      const p = profiles[uid];
                      if (!p) return null;
                      const speaking = lounge.speakingUserIds.includes(uid);
                      return (
                        <span
                          key={uid}
                          className={`voice-chip ${speaking ? 'speaking' : ''}`}
                        >
                          <span
                            className="avatar sm"
                            style={{
                              background: p.avatarColor,
                              width: 18,
                              height: 18,
                              fontSize: 9,
                            }}
                          >
                            {p.initials}
                          </span>
                          {p.displayName}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="sidebar-footer">
        {activeVoice && (
          <div className="voice-live-bar">
            <span>Terhubung · {activeVoice.name}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={toggleMute}
                title={isMuted ? 'Buka Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff size={14} color="var(--accent-danger)" /> : <Mic size={14} />}
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={toggleDeafen}
                title={isDeafened ? 'Aktifkan Suara' : 'Deafen'}
              >
                {isDeafened ? (
                  <VolumeX size={14} color="var(--accent-danger)" />
                ) : (
                  <Volume2 size={14} />
                )}
              </button>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 26, height: 26 }}
                onClick={leaveVoiceLounge}
                title="Keluar Voice Lounge"
              >
                <PhoneOff size={14} color="var(--accent-danger)" />
              </button>
            </div>
          </div>
        )}

        {me && (
          <div className="me-row">
            <div className="avatar" style={{ background: me.avatarColor }}>
              {me.initials}
              <span className="avatar-dot" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="channel-name" style={{ fontSize: 13 }}>
                {me.displayName}
              </div>
              <span className="channel-meta">
                @{me.username} · {me.statusEmoji} {me.statusText}
              </span>
            </div>
          </div>
        )}
      </footer>
    </section>
  );
}
