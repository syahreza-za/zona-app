import { useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  LogOut,
  Moon,
  Shield,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useZonaStore, type PrivacyMode, type ZonaCloudBackend } from '@zona/shared';
import { Avatar } from './Avatar';
import { clearWorkspaceSnapshot } from '../services/offlineDb';
import { compressImageFile } from '../services/mediaTools';

interface ProfileSettingsModalProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  cloudBackend: ZonaCloudBackend;
  inline?: boolean;
  onClose?: () => void;
  onNotify: (msg: string) => void;
}

const COLORS = ['#10B981', '#2563EB', '#EA580C', '#0891B2', '#E11D48', '#475569'];

export function ProfileSettingsModal({
  theme,
  onToggleTheme,
  cloudBackend,
  inline = false,
  onClose,
  onNotify,
}: ProfileSettingsModalProps) {
  const {
    currentUserId,
    profiles,
    locations,
    blockedUserIds,
    backendMode,
    updateMyProfile,
    setMyPrivacyMode,
    unblockUser,
    signOutSession,
    deleteMyAccount,
  } = useZonaStore();

  const me = profiles[currentUserId];
  const myPrivacy: PrivacyMode = locations[currentUserId]?.privacyMode ?? 'exact';

  const [displayName, setDisplayName] = useState(me?.displayName ?? 'Reza');
  const [username, setUsername] = useState(me?.username ?? 'syahreza');
  const [statusEmoji, setStatusEmoji] = useState(me?.statusEmoji ?? '☕');
  const [statusText, setStatusText] = useState(me?.statusText ?? '');
  const [avatarColor, setAvatarColor] = useState(me?.avatarColor ?? COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(me?.avatarUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImageFile(file, 360);
      setAvatarUrl(dataUrl);
    } catch {
      onNotify('Gagal memproses foto.');
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMyProfile({
      displayName,
      username,
      statusEmoji,
      statusText,
      avatarColor,
      avatarUrl,
    });
    onNotify('Profil diperbarui.');
    onClose?.();
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      if (backendMode === 'cloud' && cloudBackend.isConfigured()) {
        await cloudBackend.deleteOwnAccount();
      }
    } catch {
      // Proceed with local cleanup
    }
    await clearWorkspaceSnapshot();
    deleteMyAccount();
    onNotify('Akun dan data lokal telah dihapus secara permanen.');
    onClose?.();
  };

  const content = (
    <div className={inline ? 'mobile-profile-pane' : 'modal-sheet'} onClick={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h3>{inline ? 'Profil & Pengaturan' : 'Pengaturan'}</h3>
        {!inline && onClose && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            initials={me?.initials ?? 'RZ'}
            color={avatarColor}
            avatarUrl={avatarUrl}
            size="lg"
            online
            showPresence
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="btn-secondary" style={{ height: 30, fontSize: 12.5, cursor: 'pointer' }}>
              <Camera size={13} strokeWidth={1.75} />
              <span>Ganti Foto</span>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
              />
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setAvatarUrl(undefined);
                    setAvatarColor(c);
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 99,
                    background: c,
                    outline: !avatarUrl && avatarColor === c ? '2px solid var(--text-primary)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="field-label">
            Nama
            <input
              className="field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Username
            <input
              className="field-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '68px 1fr', gap: 8 }}>
          <label className="field-label">
            Ikon
            <input
              className="field-input"
              value={statusEmoji}
              onChange={(e) => setStatusEmoji(e.target.value)}
            />
          </label>
          <label className="field-label">
            Status Singkat
            <input
              className="field-input"
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%' }}>
          Simpan Profil
        </button>
      </form>

      <div className="settings-divider" />

      {/* Appearance & Default Map Privacy */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tampilan</div>
            <div className="meta-text">{theme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}</div>
          </div>
          <button type="button" className="btn-secondary" style={{ height: 34 }} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
            <span>{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
          </button>
        </div>

        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>Privasi Peta Default</div>
          <div className="rsvp-segment">
            {(
              [
                { id: 'exact', label: 'Tepat', icon: Eye },
                { id: 'fuzzy', label: 'Area', icon: Shield },
                { id: 'ghost', label: 'Ghost', icon: EyeOff },
              ] as { id: PrivacyMode; label: string; icon: typeof Eye }[]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`rsvp-choice ${myPrivacy === id ? 'selected' : ''}`}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                onClick={() => {
                  setMyPrivacyMode(id);
                  onNotify(`Privasi peta: ${label}`);
                }}
              >
                <Icon size={13} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-divider" />

      {/* Blocked Users */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          Pengguna Diblokir ({blockedUserIds.length})
        </div>
        {blockedUserIds.length === 0 ? (
          <span className="meta-text">Tidak ada pengguna yang diblokir.</span>
        ) : (
          blockedUserIds.map((uid) => (
            <div
              key={uid}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ fontSize: 13.5 }}>{profiles[uid]?.displayName ?? uid}</span>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: 30, fontSize: 12 }}
                onClick={() => {
                  unblockUser(uid);
                  onNotify('Blokir dibuka.');
                }}
              >
                Buka Blokir
              </button>
            </div>
          ))
        )}
      </div>

      <div className="settings-divider" />

      {/* Account Actions & Subtle Connection Indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="meta-text">
          Koneksi: {backendMode === 'cloud' ? 'Cloud Sinkron' : 'Mode Lokal (Pratinjau)'}
        </span>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ flex: 1 }}
            onClick={() => {
              signOutSession();
              onClose?.();
            }}
          >
            <LogOut size={15} strokeWidth={1.75} />
            <span>Keluar</span>
          </button>

          <button
            type="button"
            className="btn-danger"
            style={{ flex: 1 }}
            onClick={handlePermanentDelete}
          >
            <Trash2 size={15} strokeWidth={1.75} />
            <span>{confirmDelete ? 'Konfirmasi Hapus' : 'Hapus Akun'}</span>
          </button>
        </div>

        {confirmDelete && (
          <p className="meta-text" style={{ margin: 0, color: 'var(--danger)' }}>
            Klik sekali lagi untuk menghapus akun dan seluruh data lokal secara permanen.
          </p>
        )}
      </div>
    </div>
  );

  if (inline) return content;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      {content}
    </div>
  );
}
