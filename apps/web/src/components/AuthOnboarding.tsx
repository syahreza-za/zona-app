import { useState } from 'react';
import { Cloud, Compass, Headphones, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { useZonaStore, type ZonaCloudBackend } from '@zona/shared';

interface AuthOnboardingProps {
  cloudBackend: ZonaCloudBackend;
  onNotify: (msg: string) => void;
}

const AVATAR_COLORS = ['#FACC15', '#22C55E', '#F97316', '#06B6D4', '#EC4899', '#38BDF8'];
const STATUS_PRESETS = [
  { emoji: '⚡', text: 'Lagi online di ZONA' },
  { emoji: '☕', text: 'Siap diajak ngopi' },
  { emoji: '🎧', text: 'Nongkrong di Voice' },
  { emoji: '🛵', text: 'Lagi di jalan' },
];

export function AuthOnboarding({ cloudBackend, onNotify }: AuthOnboardingProps) {
  const completeOnboarding = useZonaStore((s) => s.completeOnboarding);

  const cloudReady = cloudBackend.isConfigured();
  const [tab, setTab] = useState<'quick' | 'cloud'>(cloudReady ? 'cloud' : 'quick');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const [displayName, setDisplayName] = useState('Reza');
  const [username, setUsername] = useState('syahreza');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [statusEmoji, setStatusEmoji] = useState(STATUS_PRESETS[0].emoji);
  const [statusText, setStatusText] = useState(STATUS_PRESETS[0].text);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ZN';

  const handleQuickStart = (e: React.FormEvent) => {
    e.preventDefault();
    completeOnboarding({
      displayName,
      username,
      avatarColor,
      statusEmoji,
      statusText,
      mode: 'demo',
    });
    onNotify(`Selamat datang, ${displayName}! Mode Offline-First aktif.`);
  };

  const handleCloudAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!cloudReady) {
      setError('Kredensial Supabase belum diisi di .env.local. Gunakan tab Masuk Cepat (Offline/Demo) untuk langsung mencoba.');
      return;
    }
    setLoading(true);
    try {
      const res =
        authMode === 'signup'
          ? await cloudBackend.signUpWithEmail(email, password, displayName, username)
          : await cloudBackend.signInWithEmail(email, password);

      completeOnboarding({
        displayName,
        username,
        avatarColor,
        statusEmoji,
        statusText,
        mode: 'cloud',
        userId: res.user?.id,
      });
      onNotify('Berhasil terhubung ke Supabase Cloud!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke akun Cloud.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-grid">
        <section className="auth-hero">
          <div className="brand-mark" style={{ width: 52, height: 52, fontSize: 24 }}>
            Z
          </div>
          <h1 className="auth-heading">ZONA</h1>
          <p className="auth-tagline">
            Satu ruang untuk circle terdekatmu: chat secepat WhatsApp, ruang suara 1-tap
            ala Discord, dan peta sosial hidup ala Snapchat.
          </p>

          <div className="auth-pillars">
            <div className="auth-pillar">
              <MessageCircle size={18} color="var(--accent-yellow)" />
              <div>
                <strong>Offline-First Fast Chat</strong>
                <span>Pesan, Voice Note asli, &amp; Quick Snap 24 jam tetap lancar.</span>
              </div>
            </div>
            <div className="auth-pillar">
              <Headphones size={18} color="var(--accent-emerald)" />
              <div>
                <strong>Circles &amp; Drop-In Voice</strong>
                <span>Kanal topik rapi tanpa ribet setting server dan masuk voice 1-tap.</span>
              </div>
            </div>
            <div className="auth-pillar">
              <Compass size={18} color="var(--accent-coral)" />
              <div>
                <strong>Live Map dengan Privasi Penuh</strong>
                <span>Pilih mode Tepat, Area (~400m), atau Ghost Mode kapan saja.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="auth-card">
          <div className="privacy-segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button
              type="button"
              className={`privacy-btn ${tab === 'quick' ? 'active fuzzy' : ''}`}
              onClick={() => setTab('quick')}
            >
              <Sparkles size={13} />
              <span>Masuk Cepat</span>
            </button>
            <button
              type="button"
              className={`privacy-btn ${tab === 'cloud' ? 'active exact' : ''}`}
              onClick={() => setTab('cloud')}
            >
              <Cloud size={13} />
              <span>Cloud Supabase</span>
            </button>
          </div>

          <div className="profile-preview-bar">
            <div className="avatar" style={{ background: avatarColor, width: 46, height: 46, fontSize: 16 }}>
              {initials}
              <span className="avatar-dot" />
            </div>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 15 }}>{displayName || 'Pengguna Baru'}</strong>
              <span className="channel-meta">
                @{username || 'username'} · {statusEmoji} {statusText}
              </span>
            </div>
          </div>

          <form
            onSubmit={tab === 'quick' ? handleQuickStart : handleCloudAuth}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {tab === 'cloud' && (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className={`pill-action ${authMode === 'signin' ? 'primary' : ''}`}
                    onClick={() => setAuthMode('signin')}
                  >
                    Masuk
                  </button>
                  <button
                    type="button"
                    className={`pill-action ${authMode === 'signup' ? 'primary' : ''}`}
                    onClick={() => setAuthMode('signup')}
                  >
                    Daftar Baru
                  </button>
                </div>

                <label className="field-label">
                  Email
                  <input
                    type="email"
                    className="field-input"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>

                <label className="field-label">
                  Kata Sandi
                  <input
                    type="password"
                    className="field-input"
                    placeholder="Minimal 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </label>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label className="field-label">
                Nama Tampilan
                <input
                  id="onboarding-display-name"
                  className="field-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </label>

              <label className="field-label">
                Username
                <input
                  id="onboarding-username"
                  className="field-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="field-label">
              Warna Avatar
              <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Pilih warna ${c}`}
                    onClick={() => setAvatarColor(c)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 10,
                      background: c,
                      outline: avatarColor === c ? '2px solid var(--text-primary)' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="field-label">
              Status Awal di Peta
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                {STATUS_PRESETS.map((preset) => (
                  <button
                    key={preset.text}
                    type="button"
                    className={`pill-action ${statusText === preset.text ? 'primary' : ''}`}
                    onClick={() => {
                      setStatusEmoji(preset.emoji);
                      setStatusText(preset.text);
                    }}
                  >
                    {preset.emoji} {preset.text}
                  </button>
                ))}
              </div>
            </div>

            {error && <div className="inline-error">{error}</div>}

            <button
              id="btn-enter-zona"
              type="submit"
              className="send-btn"
              style={{ justifyContent: 'center', height: 44, marginTop: 4 }}
              disabled={loading}
            >
              {loading
                ? 'Menghubungkan...'
                : tab === 'quick'
                  ? 'Masuk ke ZONA Sekarang'
                  : authMode === 'signup'
                    ? 'Daftar & Masuk Cloud'
                    : 'Masuk dengan Supabase'}
            </button>

            <div className="auth-footnote">
              <ShieldCheck size={14} />
              <span>
                {cloudReady
                  ? 'Supabase Cloud aktif & siap sinkronisasi real-time.'
                  : 'Mode Lokal/Demo menyimpan data di IndexedDB perangkatmu secara offline.'}
              </span>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
