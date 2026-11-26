import { useState } from 'react';
import { LogOut, ShieldAlert, Trash2, UserCog, X } from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { clearWorkspaceSnapshot } from '../services/offlineDb';

interface ProfileSettingsModalProps {
  onClose: () => void;
  onNotify: (msg: string) => void;
}

const COLORS = ['#FACC15', '#22C55E', '#F97316', '#06B6D4', '#EC4899', '#38BDF8'];

export function ProfileSettingsModal({ onClose, onNotify }: ProfileSettingsModalProps) {
  const {
    currentUserId,
    profiles,
    blockedUserIds,
    backendMode,
    updateMyProfile,
    unblockUser,
    signOutSession,
  } = useZonaStore();

  const me = profiles[currentUserId];
  const [displayName, setDisplayName] = useState(me?.displayName ?? 'Reza');
  const [statusEmoji, setStatusEmoji] = useState(me?.statusEmoji ?? '⚡');
  const [statusText, setStatusText] = useState(me?.statusText ?? '');
  const [avatarColor, setAvatarColor] = useState(me?.avatarColor ?? COLORS[0]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMyProfile({ displayName, statusEmoji, statusText, avatarColor });
    onNotify('Profil & status berhasil diperbarui.');
    onClose();
  };

  const handleResetData = async () => {
    await clearWorkspaceSnapshot();
    signOutSession();
    onNotify('Cache offline dibersihkan. Kamu keluar dari sesi.');
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="map-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCog size={18} color="var(--accent-yellow)" />
            <h3>Profil &amp; Pengaturan</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <label className="field-label">
            Nama Tampilan
            <input
              className="field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 8 }}>
            <label className="field-label">
              Emoji
              <input
                className="field-input"
                value={statusEmoji}
                onChange={(e) => setStatusEmoji(e.target.value)}
              />
            </label>
            <label className="field-label">
              Status di Peta &amp; Chat
              <input
                className="field-input"
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
              />
            </label>
          </div>

          <div className="field-label">
            Warna Avatar
            <div style={{ display: 'flex', gap: 8 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 9,
                    background: c,
                    outline: avatarColor === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>

          <button type="submit" className="pill-action primary" style={{ justifyContent: 'center' }}>
            Simpan Perubahan
          </button>
        </form>

        <div className="settings-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <ShieldAlert size={14} color="var(--accent-coral)" />
            <span>Keamanan &amp; Pengguna Diblokir ({blockedUserIds.length})</span>
          </div>
          {blockedUserIds.length === 0 ? (
            <span className="channel-meta">Belum ada pengguna yang diblokir.</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {blockedUserIds.map((uid) => (
                <div key={uid} className="map-header-row">
                  <span style={{ fontSize: 13 }}>{profiles[uid]?.displayName ?? uid}</span>
                  <button
                    type="button"
                    className="pill-action"
                    onClick={() => {
                      unblockUser(uid);
                      onNotify('Blokir pengguna dibuka.');
                    }}
                  >
                    Buka Blokir
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="settings-section">
          <span className="channel-meta">
            Mode Koneksi: <strong>{backendMode === 'cloud' ? 'Supabase Cloud' : 'Offline-First Demo'}</strong>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="pill-action"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                signOutSession();
                onClose();
              }}
            >
              <LogOut size={13} /> Keluar Sesi
            </button>
            <button
              type="button"
              className="pill-action"
              style={{ flex: 1, justifyContent: 'center', color: 'var(--accent-danger)' }}
              onClick={handleResetData}
            >
              <Trash2 size={13} /> Reset Data Lokal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
