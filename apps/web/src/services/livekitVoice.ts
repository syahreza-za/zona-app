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
 * speaker detection. Gracefully operates in local presence mode when LiveKit
 * env credentials are not provided.
 */
export class ZonaVoiceEngine {
  private room: Room | null = null;
  private activeRoomName: string | null = null;

  async connect(options: {
    roomName: string;
    participantName: string;
    cloudBackend: ZonaCloudBackend;
    livekitUrl?: string;
    onActiveSpeakers?: (identities: string[]) => void;
    onDisconnected?: () => void;
  }): Promise<{ mode: 'livekit' | 'local' }> {
    await this.disconnect();
    this.activeRoomName = options.roomName;

    const url = options.livekitUrl || import.meta.env.VITE_LIVEKIT_URL;
    if (!url || !options.cloudBackend.isConfigured()) {
      return { mode: 'local' };
    }

    try {
      const { token } = await options.cloudBackend.fetchLivekitToken(
        options.roomName,
        options.participantName
      );
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
        options.onDisconnected?.();
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);
      this.room = room;
      return { mode: 'livekit' };
    } catch {
      return { mode: 'local' };
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
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
  }

  getActiveRoomName(): string | null {
    return this.activeRoomName;
  }
}

export const zonaVoiceEngine = new ZonaVoiceEngine();
