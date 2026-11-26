import { useState } from 'react';
import { ArrowRight, Camera, Mail } from 'lucide-react';
import { useZonaStore, type ZonaCloudBackend } from '@zona/shared';
import { Avatar } from './Avatar';
import { compressImageFile } from '../services/mediaTools';

interface AuthOnboardingProps {
  cloudBackend: ZonaCloudBackend;
  onNotify: (msg: string) => void;
}

const AVATAR_COLORS = ['#10B981', '#2563EB', '#EA580C', '#0891B2', '#E11D48', '#475569'];

export function AuthOnboarding({ cloudBackend, onNotify }: AuthOnboardingProps) {
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
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);

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
      avatarUrl,
      statusEmoji: '☕',
      statusText: 'Lagi santai di Blok M',
      mode: pendingMode,
      userId: pendingUserId,
    });
    onNotify(`Selamat datang, ${displayName}.`);
  };

  return (
    <div className="auth-screen">
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
                className="oauth-btn"
                onClick={() => handleOAuth('google')}
                disabled={loading}
              >
                <span>Lanjutkan dengan Google</span>
              </button>
              <button
                id="btn-auth-apple"
                type="button"
                className="oauth-btn"
                onClick={() => handleOAuth('apple')}
                disabled={loading}
              >
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
                avatarUrl={avatarUrl}
                size="lg"
                online
                showPresence
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Warna ${c}`}
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
  );
}
