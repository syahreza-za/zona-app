import { useState } from 'react';
import { ArrowRight, Camera, CheckCheck, Headphones, Mail, MapPin, Moon, Sun } from 'lucide-react';
import { useZonaStore, type ZonaCloudBackend } from '@zona/shared';
import { AVATAR_VARIANT_COUNT, Avatar, PRESET_AVATAR_URLS } from './Avatar';
import { compressImageFile } from '../services/mediaTools';

interface AuthOnboardingProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  cloudBackend: ZonaCloudBackend;
  onNotify: (msg: string) => void;
}

const AVATAR_COLORS = ['#10B981', '#EA580C', '#0EA5E9', '#D97706', '#E11D48', '#0D9488'];

function GoogleBrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.88Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3.01c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.62H1.28a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1c.95-2.84 3.6-4.95 6.72-4.95Z"
      />
    </svg>
  );
}

function AppleBrandMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43Zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45Z" />
    </svg>
  );
}

export function AuthOnboarding({
  theme,
  onToggleTheme,
  cloudBackend,
  onNotify,
}: AuthOnboardingProps) {
  const completeOnboarding = useZonaStore((s) => s.completeOnboarding);
  const cloudReady = cloudBackend.isConfigured();

  const [step, setStep] = useState<1 | 2>(1);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingUserId, setPendingUserId] = useState<string | undefined>(undefined);
  const [pendingMode, setPendingMode] = useState<'cloud' | 'demo'>('demo');

  const [displayName, setDisplayName] = useState('Reza');
  const [username, setUsername] = useState('syahreza');
  const [avatarVariant, setAvatarVariant] = useState(0);
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string>(PRESET_AVATAR_URLS[0]);

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

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError(null);
    if (!cloudReady) {
      setPendingMode('demo');
      setStep(2);
      return;
    }
    setLoading(true);
    try {
      if (provider === 'google') {
        await cloudBackend.signInWithGoogle(window.location.origin);
      } else {
        await cloudBackend.signInWithApple(window.location.origin);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal melanjutkan autentikasi.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!cloudReady) {
      const localName = email.split('@')[0] || 'Reza';
      setDisplayName(localName.charAt(0).toUpperCase() + localName.slice(1));
      setUsername(localName.toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'syahreza');
      setPendingMode('demo');
      setStep(2);
      return;
    }

    setLoading(true);
    try {
      const res =
        authMode === 'signup'
          ? await cloudBackend.signUpWithEmail(email, password, displayName, username)
          : await cloudBackend.signInWithEmail(email, password);
      setPendingUserId(res.user?.id);
      setPendingMode('cloud');
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email atau kata sandi tidak valid.');
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImageFile(file, 360);
      setAvatarUrl(dataUrl);
    } catch {
      setError('Gagal memuat foto profil.');
    }
  };

  const handleFinishProfile = (e: React.FormEvent) => {
    e.preventDefault();
    completeOnboarding({
      displayName,
      username,
      avatarColor,
      avatarVariant,
      avatarUrl,
      statusEmoji: '☕',
      statusText: 'Lagi santai di Blok M',
      mode: pendingMode,
      userId: pendingUserId,
    });
    if (pendingMode === 'cloud' && pendingUserId && cloudBackend.isConfigured()) {
      void cloudBackend
        .upsertProfile(pendingUserId, {
          displayName,
          username,
          avatarColor,
          avatarUrl,
          statusEmoji: '☕',
          statusText: 'Lagi santai di Blok M',
        })
        .catch(() => undefined);
    }
    onNotify(`Selamat datang, ${displayName}.`);
  };

  return (
    <div className="auth-screen">
      <button
        id="onboarding-theme-toggle"
        type="button"
        className="auth-theme-toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Mode Terang' : 'Mode Gelap'}
        aria-label="Ganti Tema"
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>

      <div className="auth-split-shell">
        {/* Left Atmospheric Visual Showcase (Real Map + Real Quick Snap + Voice Lounge) */}
        <aside className="auth-showcase" aria-hidden="true">
          <div className="showcase-top-row">
            <div className="showcase-map-card">
              <img
                src={
                  theme === 'dark'
                    ? './media/minimap-kemang-dark.webp'
                    : './media/minimap-kemang-light.webp'
                }
                alt=""
                className="showcase-map-img"
              />
              <div className="showcase-pin" style={{ left: '34%', top: '44%' }}>
                <Avatar initials="NB" color="#EA580C" variant={1} size="sm" />
                <span className="showcase-pin-label">Nabila · Kemang</span>
              </div>
              <div className="showcase-pin" style={{ left: '72%', top: '34%' }}>
                <Avatar initials="DM" color="#0EA5E9" variant={2} size="sm" />
                <span className="showcase-pin-label">Dimas</span>
              </div>
              <div className="showcase-hangout-pill">
                <MapPin size={12} strokeWidth={2} />
                <span>Kopi Tuku Kemang</span>
              </div>
            </div>

            <div className="showcase-snap-card">
              <img src="./media/snap-coffee.webp" alt="" className="showcase-snap-img" />
              <span className="showcase-snap-badge">24j</span>
              <span className="showcase-snap-cap">Kopi Tuku · 16.12</span>
            </div>
          </div>

          <div className="showcase-chat-stack">
            <div className="showcase-bubble in">
              <Avatar initials="NB" color="#EA580C" variant={1} size="xs" />
              <div className="showcase-bubble-card">
                <span>Meja outdoor udah aman, langsung merapat ya!</span>
                <span className="meta-text">16.12</span>
              </div>
            </div>
            <div className="showcase-bubble out">
              <div className="showcase-bubble-card out">
                <span>Siap, 8 menit lagi sampai</span>
                <span className="showcase-check">
                  16.13 <CheckCheck size={12} strokeWidth={2} />
                </span>
              </div>
            </div>
          </div>

          <div className="showcase-voice-pill">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Headphones size={15} strokeWidth={1.9} color="#10B981" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Meja Nongkrong</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="avatar-stack">
                <span className="avatar-stack-item">
                  <Avatar initials="DM" color="#0EA5E9" variant={2} size="xs" />
                </span>
                <span className="avatar-stack-item">
                  <Avatar initials="FJ" color="#D97706" variant={3} size="xs" />
                </span>
                <span className="avatar-stack-item">
                  <Avatar initials="RZ" color="#10B981" variant={0} size="xs" />
                </span>
              </div>
              <span className="voice-eq sm">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        </aside>

        {/* Right Clean 2-Step Auth Card (Authentic Google & Apple Buttons) */}
        <section className="auth-card" aria-label="Masuk ke ZONA">
          <div className="auth-brand-row">
            <div className="auth-logo-mark">Z</div>
            <div>
              <h1 className="auth-title">{step === 1 ? 'Masuk ke ZONA' : 'Lengkapi Profil'}</h1>
              <p className="auth-sub">
                {step === 1
                  ? 'Langkah 1 dari 2 · Pilih metode masuk'
                  : 'Langkah 2 dari 2 · Atur nama dan foto profilmu'}
              </p>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="oauth-stack">
                <button
                  id="btn-auth-google"
                  type="button"
                  className="oauth-btn google"
                  onClick={() => handleOAuth('google')}
                  disabled={loading}
                >
                  <GoogleBrandMark />
                  <span>Lanjutkan dengan Google</span>
                </button>
                <button
                  id="btn-auth-apple"
                  type="button"
                  className="oauth-btn apple"
                  onClick={() => handleOAuth('apple')}
                  disabled={loading}
                >
                  <AppleBrandMark />
                  <span>Lanjutkan dengan Apple</span>
                </button>
              </div>

              <div className="divider-text">atau dengan email</div>

              <form
                onSubmit={handleEmailContinue}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <label className="field-label">
                  Email
                  <input
                    type="email"
                    className="field-input"
                    placeholder="nama@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={cloudReady}
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
                    minLength={cloudReady ? 6 : undefined}
                    required={cloudReady}
                  />
                </label>

                {error && <div className="inline-error">{error}</div>}

                <button
                  id="btn-auth-email"
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ width: '100%', marginTop: 2 }}
                >
                  <Mail size={16} strokeWidth={1.75} />
                  <span>
                    {loading
                      ? 'Memproses...'
                      : authMode === 'signin'
                        ? 'Masuk'
                        : 'Buat Akun'}
                  </span>
                </button>
              </form>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}
              >
                <button
                  type="button"
                  style={{ color: 'var(--accent)', fontWeight: 500 }}
                  onClick={() => setAuthMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                >
                  {authMode === 'signin' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
                </button>

                {!cloudReady && (
                  <button
                    id="btn-enter-zona"
                    type="button"
                    style={{
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    onClick={() => setStep(2)}
                  >
                    <span>Lewati</span>
                    <ArrowRight size={14} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <form
              onSubmit={handleFinishProfile}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar
                  initials={initials}
                  color={avatarColor}
                  variant={avatarVariant}
                  avatarUrl={avatarUrl}
                  size="lg"
                  online
                  showPresence
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="btn-secondary" style={{ height: 32, fontSize: 12.5, cursor: 'pointer' }}>
                    <Camera size={14} strokeWidth={1.75} />
                    <span>Unggah Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleAvatarUpload}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: AVATAR_VARIANT_COUNT }).map((_, idx) => (
                      <button
                        key={idx}
                        type="button"
                        aria-label={`Foto profil ${idx + 1}`}
                        onClick={() => {
                          setAvatarVariant(idx);
                          setAvatarUrl(PRESET_AVATAR_URLS[idx]);
                          setAvatarColor(AVATAR_COLORS[idx % AVATAR_COLORS.length]);
                        }}
                        style={{
                          borderRadius: 99,
                          padding: 1,
                          outline:
                            avatarUrl === PRESET_AVATAR_URLS[idx]
                              ? '2px solid var(--accent)'
                              : 'none',
                          outlineOffset: 1,
                        }}
                      >
                        <Avatar
                          initials={initials}
                          color={AVATAR_COLORS[idx % AVATAR_COLORS.length]}
                          variant={idx}
                          avatarUrl={PRESET_AVATAR_URLS[idx]}
                          size="xs"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="field-label">
                Nama Tampilan
                <input
                  id="onboarding-display-name"
                  className="field-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoFocus
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

              {error && <div className="inline-error">{error}</div>}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep(1)}
                >
                  Kembali
                </button>
                <button
                  id="btn-finish-onboarding"
                  type="submit"
                  className="btn-primary"
                  style={{ flex: 1 }}
                >
                  <span>Mulai Menggunakan ZONA</span>
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
