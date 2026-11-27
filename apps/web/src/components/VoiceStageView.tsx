import { useState } from 'react';
import {
  ArrowLeft,
  Headphones,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { Avatar } from './Avatar';
import { zonaVoiceEngine } from '../services/livekitVoice';

interface VoiceStageViewProps {
  onCloseStage: () => void;
  onNotify: (msg: string) => void;
}

const SOUNDBOARD_REACTIONS = [
  { id: 'clap', emoji: '👏', label: 'Tepuk Tangan' },
  { id: 'laugh', emoji: '😂', label: 'Ketawa' },
  { id: 'fire', emoji: '🔥', label: 'Keren' },
  { id: 'heart', emoji: '❤️', label: 'Suka' },
];

export function VoiceStageView({ onCloseStage, onNotify }: VoiceStageViewProps) {
  const {
    currentUserId,
    profiles,
    voiceLounges,
    activeVoiceLoungeId,
    isMuted,
    isDeafened,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    leaveVoiceLounge,
  } = useZonaStore();

  const [bursts, setBursts] = useState<Array<{ id: number; emoji: string; userId: string }>>([]);

  const lounge = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  if (!lounge) return null;

  const triggerReaction = (emoji: string, label: string) => {
    const id = Date.now() + Math.random();
    setBursts((prev) => [...prev, { id, emoji, userId: currentUserId }]);
    onNotify(`Reaksi suara: ${label}`);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 2200);
  };

  const handleToggleMute = async () => {
    const next = !isMuted;
    toggleMute();
    await zonaVoiceEngine.setMuted(next);
  };

  const handleToggleDeafen = async () => {
    const next = !isDeafened;
    toggleDeafen();
    await zonaVoiceEngine.setDeafened(next);
  };

  const handleToggleScreen = async () => {
    const next = !isScreenSharing;
    const ok = await zonaVoiceEngine.setScreenShare(next);
    if (ok || !next) {
      toggleScreenShare();
      onNotify(next ? 'Berbagi layar aktif.' : 'Berbagi layar dihentikan.');
    }
  };

  const handleLeave = async () => {
    await zonaVoiceEngine.disconnect();
    leaveVoiceLounge();
    onCloseStage();
  };

  const isLivekit = zonaVoiceEngine.getConnectionMode() === 'livekit';

  return (
    <main className="voice-stage-canvas" aria-label="Voice Stage">
      <header className="voice-stage-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={onCloseStage}
            title="Kembali ke obrolan"
            aria-label="Kembali ke obrolan"
          >
            <ArrowLeft size={18} strokeWidth={1.75} />
          </button>
          <div>
            <h1 className="chat-header-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Headphones size={17} strokeWidth={1.75} color="var(--live)" />
              <span>{lounge.name}</span>
            </h1>
            <p className="chat-header-sub">
              {lounge.participantIds.length} peserta terhubung · {lounge.topic}
            </p>
          </div>
        </div>

        <span className="voice-live-chip">
          <span className="voice-live-dot" />
          <span>{isLivekit ? 'LiveKit WebRTC' : 'Terhubung'}</span>
        </span>
      </header>

      <div className="voice-stage-grid">
        {lounge.participantIds.map((uid) => {
          const p = profiles[uid];
          if (!p) return null;
          const isMe = uid === currentUserId;
          const speaking = lounge.speakingUserIds.includes(uid) && !(isMe && isMuted);
          const activeBurst = bursts.find((b) => b.userId === uid);

          return (
            <div
              key={uid}
              className={`voice-stage-tile ${speaking ? 'speaking' : ''}`}
            >
              {activeBurst && (
                <span className="stage-reaction-float" aria-hidden="true">
                  {activeBurst.emoji}
                </span>
              )}

              <div className={`stage-avatar-halo ${speaking ? 'speaking' : ''}`}>
                <Avatar
                  initials={p.initials}
                  color={p.avatarColor}
                  variant={p.avatarVariant}
                  seed={p.id}
                  avatarUrl={p.avatarUrl}
                  size="xl"
                />
              </div>

              <div className="stage-tile-footer">
                <span className="stage-tile-name">
                  {p.displayName} {isMe ? '(Kamu)' : ''}
                </span>
                {speaking ? (
                  <span className="voice-eq live" aria-label="Sedang berbicara">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : isMe && isMuted ? (
                  <MicOff size={14} strokeWidth={1.75} color="var(--danger)" />
                ) : (
                  <span className="meta-text">Mendengarkan</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Dock: Soundboard Reactions + Voice Controls */}
      <div className="voice-stage-dock">
        <div className="stage-soundboard-strip" aria-label="Reaksi cepat suara">
          <Sparkles size={14} strokeWidth={1.75} color="var(--text-muted)" />
          {SOUNDBOARD_REACTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="stage-sound-btn"
              onClick={() => triggerReaction(item.emoji, item.label)}
              title={item.label}
            >
              <span>{item.emoji}</span>
            </button>
          ))}
        </div>

        <div className="stage-controls-pill">
          <button
            type="button"
            className={`stage-ctrl-circle ${isMuted ? 'danger' : ''}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Buka mikrofon' : 'Bisukan mikrofon'}
            aria-label="Mikrofon"
          >
            {isMuted ? <MicOff size={19} strokeWidth={1.75} /> : <Mic size={19} strokeWidth={1.75} />}
          </button>

          <button
            type="button"
            className={`stage-ctrl-circle ${isDeafened ? 'danger' : ''}`}
            onClick={handleToggleDeafen}
            title={isDeafened ? 'Aktifkan speaker' : 'Deafen'}
            aria-label="Speaker"
          >
            {isDeafened ? (
              <VolumeX size={19} strokeWidth={1.75} />
            ) : (
              <Volume2 size={19} strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            className={`stage-ctrl-circle ${isScreenSharing ? 'active' : ''}`}
            onClick={handleToggleScreen}
            title="Berbagi layar"
            aria-label="Berbagi layar"
          >
            <MonitorUp size={19} strokeWidth={1.75} />
          </button>

          <button
            type="button"
            className="stage-ctrl-circle leave"
            onClick={handleLeave}
            title="Keluar ruang suara"
            aria-label="Keluar ruang suara"
          >
            <PhoneOff size={19} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </main>
  );
}
