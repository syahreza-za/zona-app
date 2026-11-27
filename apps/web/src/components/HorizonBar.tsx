import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Compass,
  Link2,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Moon,
  Plus,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { Avatar } from './Avatar';

export type HorizonWorld = 'pulse' | 'ruang' | 'peta';

interface HorizonBarProps {
  world: HorizonWorld;
  onChangeWorld: (world: HorizonWorld) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenHangoutModal: () => void;
  onOpenCircleModal: () => void;
  onOpenSettings: () => void;
  onNotify: (msg: string) => void;
}

export function HorizonBar({
  world,
  onChangeWorld,
  theme,
  onToggleTheme,
  onOpenHangoutModal,
  onOpenCircleModal,
  onOpenSettings,
  onNotify,
}: HorizonBarProps) {
  const {
    currentUserId,
    isOnline,
    profiles,
    circles,
    channels,
    locations,
    blockedUserIds,
    activeCircleId,
    selectCircle,
  } = useZonaStore();

  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const me = profiles[currentUserId];
  const activeCircle = circles.find((c) => c.id === activeCircleId) ?? null;

  const totalUnread = channels
    .filter((ch) => !ch.isArchived)
    .filter((ch) => (!activeCircleId ? true : ch.circleId === null || ch.circleId === activeCircleId))
    .reduce((sum, ch) => sum + ch.unreadCount, 0);

  const liveMapFriendsCount = Object.values(locations).filter(
    (loc) =>
      loc.userId !== currentUserId &&
      loc.privacyMode !== 'ghost' &&
      !blockedUserIds.includes(loc.userId)
  ).length;

  useEffect(() => {
    if (!menuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const handleCopyInvite = async (inviteCode: string, circleName: string) => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${inviteCode}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      onNotify(`Undangan "${circleName}" disalin (${inviteCode})`);
    } catch {
      onNotify(`Kode undangan ${circleName}: ${inviteCode}`);
    }
    setMenuOpen(false);
  };

  return (
    <header className="horizon-bar" role="banner">
      {/* Left: ZONA Brand Mark + Circle Workspace Selector Pill */}
      <div className="horizon-left">
        <button
          type="button"
          className="horizon-brand"
          onClick={() => onChangeWorld('pulse')}
          aria-label="ZONA Beranda"
        >
          <span className="horizon-brand-mark" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 64 64" fill="none">
              <path
                d="M16 18H48L18 46H48"
                stroke="currentColor"
                strokeWidth="7.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="horizon-brand-name">ZONA</span>
        </button>

        <span className="horizon-slash desktop-only" aria-hidden="true">/</span>

        <div className="workspace-dropdown-wrap" ref={dropdownRef}>
          <button
            id="btn-circle-selector"
            type="button"
            className={`workspace-pill ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span
              className="workspace-dot"
              style={{ background: activeCircle?.accentColor ?? 'var(--accent)' }}
            />
            <span className="workspace-pill-label">
              {activeCircle ? activeCircle.name : 'Semua Circle'}
            </span>
            <ChevronDown size={14} strokeWidth={2} className="workspace-chevron" />
          </button>

          {menuOpen && (
            <div className="workspace-menu" role="menu">
              <div className="workspace-menu-section">RUANG LINGKUP</div>

              <button
                type="button"
                className={`workspace-menu-item ${activeCircleId === null ? 'active' : ''}`}
                role="menuitem"
                onClick={() => {
                  selectCircle(null);
                  setMenuOpen(false);
                }}
              >
                <span className="workspace-item-icon">
                  <Users size={14} strokeWidth={1.9} />
                </span>
                <div className="workspace-item-copy">
                  <strong>Semua Circle</strong>
                  <span>Gabungan seluruh teman & obrolan</span>
                </div>
                {activeCircleId === null && <Check size={15} strokeWidth={2.2} color="var(--accent)" />}
              </button>

              <div className="workspace-menu-divider" />
              <div className="workspace-menu-section">CIRCLE KAMU</div>

              {circles.map((circle) => {
                const selected = activeCircleId === circle.id;
                return (
                  <div
                    key={circle.id}
                    className={`workspace-menu-row ${selected ? 'active' : ''}`}
                  >
                    <button
                      type="button"
                      className="workspace-menu-item main"
                      role="menuitem"
                      onClick={() => {
                        selectCircle(circle.id);
                        setMenuOpen(false);
                      }}
                    >
                      <span
                        className="workspace-circle-chip"
                        style={{ background: circle.accentColor }}
                      >
                        {circle.shortCode}
                      </span>
                      <div className="workspace-item-copy">
                        <strong>{circle.name}</strong>
                        <span>{circle.memberIds.length} anggota · {circle.inviteCode}</span>
                      </div>
                      {selected && <Check size={15} strokeWidth={2.2} color="var(--accent)" />}
                    </button>
                    <button
                      type="button"
                      className="workspace-copy-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyInvite(circle.inviteCode, circle.name);
                      }}
                      title="Salin tautan undangan"
                      aria-label={`Salin undangan ${circle.name}`}
                    >
                      <Link2 size={14} strokeWidth={1.9} />
                    </button>
                  </div>
                );
              })}

              <div className="workspace-menu-divider" />

              <button
                id="btn-menu-manage-circle"
                type="button"
                className="workspace-menu-action"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenCircleModal();
                }}
              >
                <Plus size={15} strokeWidth={2} />
                <span>Buat / Gabung Circle</span>
              </button>
            </div>
          )}
        </div>

        {!isOnline && (
          <span className="horizon-offline-badge" title="Mode Offline">
            <WifiOff size={13} strokeWidth={2} />
            <span className="desktop-only">Offline</span>
          </span>
        )}
      </div>

      {/* Center: 3-Way Horizon Switcher (Desktop Only) */}
      <nav className="horizon-switcher desktop-only" aria-label="Navigasi Utama ZONA">
        <button
          id="nav-world-pulse"
          type="button"
          className={`horizon-tab ${world === 'pulse' ? 'active' : ''}`}
          onClick={() => onChangeWorld('pulse')}
          aria-current={world === 'pulse' ? 'page' : undefined}
        >
          <Compass size={15} strokeWidth={1.9} />
          <span>Pulse</span>
        </button>

        <button
          id="nav-world-ruang"
          type="button"
          className={`horizon-tab ${world === 'ruang' ? 'active' : ''}`}
          onClick={() => onChangeWorld('ruang')}
          aria-current={world === 'ruang' ? 'page' : undefined}
        >
          <MessageSquare size={15} strokeWidth={1.9} />
          <span>Ruang</span>
          {totalUnread > 0 && <span className="horizon-tab-badge">{totalUnread}</span>}
        </button>

        <button
          id="nav-world-peta"
          type="button"
          className={`horizon-tab ${world === 'peta' ? 'active' : ''}`}
          onClick={() => onChangeWorld('peta')}
          aria-current={world === 'peta' ? 'page' : undefined}
        >
          <MapIcon size={15} strokeWidth={1.9} />
          <span>Peta</span>
          {liveMapFriendsCount > 0 && <span className="horizon-live-dot" aria-hidden="true" />}
        </button>
      </nav>

      {/* Right: + Ajak Kumpul CTA, Theme Toggle, Profile Avatar */}
      <div className="horizon-right">
        <button
          id="btn-horizon-hangout"
          type="button"
          className="horizon-cta desktop-only"
          onClick={onOpenHangoutModal}
        >
          <MapPin size={15} strokeWidth={2} />
          <span>Ajak Kumpul</span>
        </button>

        <button
          id="btn-theme-toggle"
          type="button"
          className="horizon-icon-btn"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
          aria-label="Ganti Tema"
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={1.85} /> : <Moon size={17} strokeWidth={1.85} />}
        </button>

        <button
          id="btn-horizon-profile"
          type="button"
          className="horizon-avatar-btn"
          onClick={onOpenSettings}
          title="Profil, Status & Pengaturan"
          aria-label="Buka Profil dan Pengaturan"
        >
          <Avatar
            initials={me?.initials ?? 'RZ'}
            color={me?.avatarColor ?? '#E05A3F'}
            variant={me?.avatarVariant ?? 0}
            seed={currentUserId}
            avatarUrl={me?.avatarUrl}
            size="sm"
            online={isOnline}
            showPresence
          />
        </button>
      </div>
    </header>
  );
}
