import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Link2,
  Plus,
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

  const isLightOn = theme === 'light';

  return (
    <header className="horizon-bar" role="banner">
      {/* Left: Minimal ZONA Mark + Plain Text Circle Selector */}
      <div className="horizon-left">
        <button
          type="button"
          className="horizon-brand"
          onClick={() => onChangeWorld('pulse')}
          aria-label="ZONA Beranda"
        >
          <span className="horizon-brand-mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 64 64" fill="none">
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

        <span className="horizon-slash" aria-hidden="true">/</span>

        <div className="workspace-dropdown-wrap" ref={dropdownRef}>
          <button
            id="btn-circle-selector"
            type="button"
            className={`workspace-text-trigger ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="workspace-pill-label">
              {activeCircle ? activeCircle.name : 'Semua Circle'}
            </span>
            <ChevronDown size={14} strokeWidth={1.8} className="workspace-chevron" />
          </button>

          {menuOpen && (
            <div className="workspace-menu" role="menu">
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
                  <Users size={14} strokeWidth={1.8} />
                </span>
                <div className="workspace-item-copy">
                  <strong>Semua Circle</strong>
                </div>
                {activeCircleId === null && <Check size={14} strokeWidth={2.2} />}
              </button>

              <div className="workspace-menu-divider" />

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
                      <span className="workspace-circle-chip">{circle.shortCode}</span>
                      <div className="workspace-item-copy">
                        <strong>{circle.name}</strong>
                        <span>{circle.memberIds.length} anggota</span>
                      </div>
                      {selected && <Check size={14} strokeWidth={2.2} />}
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
                      <Link2 size={14} strokeWidth={1.8} />
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
                <Plus size={14} strokeWidth={2} />
                <span>Buat atau Gabung Circle</span>
              </button>
            </div>
          )}
        </div>

        {!isOnline && (
          <span className="horizon-offline-badge" title="Mode Offline">
            <WifiOff size={13} strokeWidth={1.9} />
            <span className="desktop-only">Offline</span>
          </span>
        )}
      </div>

      {/* Center: 3 Clean Text Tabs with 2px Active Underline (Desktop Only) */}
      <nav className="horizon-tabs desktop-only" aria-label="Navigasi Utama ZONA">
        <button
          id="nav-world-pulse"
          type="button"
          className={`horizon-text-tab ${world === 'pulse' ? 'active' : ''}`}
          onClick={() => onChangeWorld('pulse')}
          aria-current={world === 'pulse' ? 'page' : undefined}
        >
          <span>Pulse</span>
        </button>

        <button
          id="nav-world-ruang"
          type="button"
          className={`horizon-text-tab ${world === 'ruang' ? 'active' : ''}`}
          onClick={() => onChangeWorld('ruang')}
          aria-current={world === 'ruang' ? 'page' : undefined}
        >
          <span>Ruang</span>
          {totalUnread > 0 && <span className="lamp-dot" aria-label={`${totalUnread} belum dibaca`} />}
        </button>

        <button
          id="nav-world-peta"
          type="button"
          className={`horizon-text-tab ${world === 'peta' ? 'active' : ''}`}
          onClick={() => onChangeWorld('peta')}
          aria-current={world === 'peta' ? 'page' : undefined}
        >
          <span>Peta</span>
          {liveMapFriendsCount > 0 && <span className="lamp-dot subtle" aria-hidden="true" />}
        </button>
      </nav>

      {/* Right: + Kumpul, Physical Light Switch Toggle (Hidup/Mati), Profile Avatar */}
      <div className="horizon-right">
        <button
          id="btn-horizon-hangout"
          type="button"
          className="horizon-plain-btn desktop-only"
          onClick={onOpenHangoutModal}
        >
          <Plus size={14} strokeWidth={2} />
          <span>Kumpul</span>
        </button>

        {/* Tactile Physical Light Switch (Lampu Hidup / Mati) */}
        <button
          id="btn-theme-toggle"
          type="button"
          role="switch"
          aria-checked={isLightOn}
          className={`lamp-switch ${isLightOn ? 'on' : 'off'}`}
          onClick={onToggleTheme}
          title={isLightOn ? 'Matikan lampu (Mode Gelap)' : 'Hidupkan lampu (Mode Terang)'}
          aria-label={isLightOn ? 'Lampu Hidup — klik untuk Mode Gelap' : 'Lampu Mati — klik untuk Mode Terang'}
        >
          <span className="lamp-switch-led" aria-hidden="true" />
          <span className="lamp-switch-knob" aria-hidden="true" />
        </button>

        <button
          id="btn-horizon-profile"
          type="button"
          className="horizon-avatar-btn"
          onClick={onOpenSettings}
          title="Profil & Pengaturan"
          aria-label="Buka Profil dan Pengaturan"
        >
          <Avatar
            initials={me?.initials ?? 'RZ'}
            color={me?.avatarColor ?? '#0A0A0A'}
            variant={me?.avatarVariant ?? 0}
            seed={currentUserId}
            avatarUrl={me?.avatarUrl}
            size="sm"
          />
        </button>
      </div>
    </header>
  );
}
