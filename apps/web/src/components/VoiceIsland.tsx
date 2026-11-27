import {
  Headphones,
  Maximize2,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { Avatar } from './Avatar';
import { zonaVoiceEngine } from '../services/livekitVoice';

interface VoiceIslandProps {
  onOpenStage: () => void;
  onNotify: (msg: string) => void;
}

export function VoiceIsland({ onOpenStage, onNotify }: VoiceIslandProps) {
  const {
    currentUserId,
    profiles,
    voiceLounges,
    activeVoiceLoungeId,
    isMuted,
    isDeafened,
    toggleMute,
    toggleDeafen,
    leaveVoiceLounge,
  } = useZonaStore();

  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  if (!activeVoice) return null;

  const isLivekit = zonaVoiceEngine.getConnectionMode() === 'livekit';

  const handleToggleMute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isMuted;
    toggleMute();
    await zonaVoiceEngine.setMuted(next);
  };

  const handleToggleDeafen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !isDeafened;
    toggleDeafen();
    await zonaVoiceEngine.setDeafened(next);
  };

  const handleLeave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await zonaVoiceEngine.disconnect();
    leaveVoiceLounge();
    onNotify(`Keluar dari ${activeVoice.name}.`);
  };

  return (
    <aside
      id="zona-voice-island"
      className="voice-island"
      role="region"
      aria-label={`Ruang suara aktif: ${activeVoice.name}`}
      onClick={onOpenStage}
    >
      <div className="voice-island-info">
        <div className="voice-island-avatars">
          {activeVoice.participantIds.slice(0, 3).map((uid) => {
            const p = profiles[uid];
            if (!p) return null;
            const speaking =
              activeVoice.speakingUserIds.includes(uid) && !(uid === currentUserId && isMuted);
            return (
              <span
                key={uid}
                className={`voice-island-avatar-ring ${speaking ? 'speaking' : ''}`}
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
        </div>

        <div className="voice-island-meta">
          <div className="voice-island-title-row">
            <Headphones size={12} strokeWidth={2.2} color="var(--live)" />
            <strong className="voice-island-name">{activeVoice.name}</strong>
            <span className="voice-eq sm live" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
          <span className="voice-island-sub">
            {isLivekit ? 'LiveKit HD' : 'Suara Aktif'} · {activeVoice.participantIds.length} peserta
          </span>
        </div>
      </div>

      <div className="voice-island-controls" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`voice-island-btn ${isMuted ? 'muted' : ''}`}
          onClick={handleToggleMute}
          title={isMuted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
          aria-label={isMuted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
        >
          {isMuted ? <MicOff size={15} strokeWidth={2} /> : <Mic size={15} strokeWidth={2} />}
        </button>

        <button
          type="button"
          className={`voice-island-btn ${isDeafened ? 'muted' : ''}`}
          onClick={handleToggleDeafen}
          title={isDeafened ? 'Aktifkan speaker' : 'Deafen'}
          aria-label={isDeafened ? 'Aktifkan speaker' : 'Deafen'}
        >
          {isDeafened ? (
            <VolumeX size={15} strokeWidth={2} />
          ) : (
            <Volume2 size={15} strokeWidth={2} />
          )}
        </button>

        <button
          id="btn-voice-island-stage"
          type="button"
          className="voice-island-btn"
          onClick={onOpenStage}
          title="Buka Voice Stage"
          aria-label="Buka Voice Stage"
        >
          <Maximize2 size={14} strokeWidth={2} />
        </button>

        <button
          type="button"
          className="voice-island-btn leave"
          onClick={handleLeave}
          title="Keluar ruang suara"
          aria-label="Keluar ruang suara"
        >
          <PhoneOff size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
