import {
  Maximize2,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { zonaVoiceEngine } from '../services/livekitVoice';

interface VoiceIslandProps {
  onOpenStage: () => void;
  onNotify: (msg: string) => void;
}

export function VoiceIsland({ onOpenStage, onNotify }: VoiceIslandProps) {
  const {
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
      aria-label={`Suara aktif: ${activeVoice.name}`}
      onClick={onOpenStage}
    >
      <div className="voice-island-info">
        <span className="lamp-dot" aria-hidden="true" />
        <div className="voice-island-meta">
          <strong className="voice-island-name">{activeVoice.name}</strong>
          <span className="voice-island-sub">{activeVoice.participantIds.length} orang</span>
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
          {isMuted ? <MicOff size={14} strokeWidth={1.9} /> : <Mic size={14} strokeWidth={1.9} />}
        </button>

        <button
          type="button"
          className={`voice-island-btn ${isDeafened ? 'muted' : ''}`}
          onClick={handleToggleDeafen}
          title={isDeafened ? 'Aktifkan speaker' : 'Deafen'}
          aria-label={isDeafened ? 'Aktifkan speaker' : 'Deafen'}
        >
          {isDeafened ? (
            <VolumeX size={14} strokeWidth={1.9} />
          ) : (
            <Volume2 size={14} strokeWidth={1.9} />
          )}
        </button>

        <button
          id="btn-voice-island-stage"
          type="button"
          className="voice-island-btn"
          onClick={onOpenStage}
          title="Buka Stage"
          aria-label="Buka Stage"
        >
          <Maximize2 size={13} strokeWidth={1.9} />
        </button>

        <button
          type="button"
          className="voice-island-btn leave"
          onClick={handleLeave}
          title="Keluar suara"
          aria-label="Keluar suara"
        >
          <PhoneOff size={14} strokeWidth={1.9} />
        </button>
      </div>
    </aside>
  );
}
