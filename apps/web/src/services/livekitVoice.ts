import { Room, RoomEvent, type Participant } from 'livekit-client';
import type { ZonaCloudBackend } from '@zona/shared';

export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Manages real LiveKit WebRTC voice lounge sessions on Web & Tauri Desktop,
 * including noise suppression, screen sharing, device switching, and active
 * speaker detection. Uses the Supabase `livekit-token` Edge Function when
 * authenticated in Cloud mode, and gracefully falls back to local presence
 * mode when running in Demo mode.
 */
export class ZonaVoiceEngine {
  private room: Room | null = null;
  private activeRoomName: string | null = null;
  private mode: 'livekit' | 'local' = 'local';

  async connect(options: {
    roomName: string;
    circleId?: string;
    participantName: string;
    backendMode?: 'cloud' | 'demo';
    cloudBackend: ZonaCloudBackend;
    livekitUrl?: string;
    onActiveSpeakers?: (identities: string[]) => void;
    onDisconnected?: () => void;
  }): Promise<{ mode: 'livekit' | 'local' }> {
    await this.disconnect();
    this.activeRoomName = options.roomName;

    const isCloud =
      options.backendMode !== 'demo' && options.cloudBackend.isConfigured();
    if (!isCloud) {
      this.mode = 'local';
      return { mode: 'local' };
    }

    try {
      const tokenRes = await options.cloudBackend.fetchLivekitToken(
        options.roomName,
        options.participantName,
        options.circleId
      );
      const url = tokenRes.url || options.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
      if (!url || !tokenRes.token) {
        this.mode = 'local';
        return { mode: 'local' };
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        options.onActiveSpeakers?.(speakers.map((s) => s.identity));
      });

      room.on(RoomEvent.Disconnected, () => {
        this.mode = 'local';
        options.onDisconnected?.();
      });

      await room.connect(url, tokenRes.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      this.room = room;
      this.mode = 'livekit';
      return { mode: 'livekit' };
    } catch {
      this.mode = 'local';
      return { mode: 'local' };
    }
  }

  getConnectionMode(): 'livekit' | 'local' {
    return this.mode;
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
  }

  async setDeafened(deafened: boolean): Promise<void> {
    if (!this.room) return;
    this.room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((pub) => {
        if (pub.audioTrack && 'setVolume' in pub.audioTrack) {
          pub.audioTrack.setVolume(deafened ? 0 : 1);
        }
      });
    });
    if (deafened) {
      await this.room.localParticipant.setMicrophoneEnabled(false);
    }
  }

  async setScreenShare(enabled: boolean): Promise<boolean> {
    if (!this.room) return enabled;
    try {
      await this.room.localParticipant.setScreenShareEnabled(enabled);
      return enabled;
    } catch {
      return false;
    }
  }

  async listAudioDevices(): Promise<AudioDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label:
            d.label ||
            (d.kind === 'audioinput' ? `Mikrofon ${idx + 1}` : `Speaker ${idx + 1}`),
          kind: d.kind as 'audioinput' | 'audiooutput',
        }));
    } catch {
      return [];
    }
  }

  async switchAudioDevice(kind: 'audioinput' | 'audiooutput', deviceId: string): Promise<void> {
    if (!this.room) return;
    await this.room.switchActiveDevice(kind, deviceId);
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    this.activeRoomName = null;
    this.mode = 'local';
  }

  getActiveRoomName(): string | null {
    return this.activeRoomName;
  }
}

export const zonaVoiceEngine = new ZonaVoiceEngine();
