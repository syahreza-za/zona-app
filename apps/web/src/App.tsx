import { useCallback, useEffect, useMemo, useState } from 'react';
import { Hash, Map, MessageCircle } from 'lucide-react';
import {
  createZonaCloudBackend,
  useZonaStore,
  type Coordinates,
} from '@zona/shared';
import { AuthOnboarding } from './components/AuthOnboarding';
import { CircleRail } from './components/CircleRail';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatPanel } from './components/ChatPanel';
import { SocialMapPanel } from './components/SocialMapPanel';
import { HangoutModal } from './components/HangoutModal';
import { CircleManageModal } from './components/CircleManageModal';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './services/offlineDb';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showMap, setShowMap] = useState(true);
  const [mobileTab, setMobileTab] = useState<'map' | 'chat' | 'circles'>('chat');
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [circleModalOpen, setCircleModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hangoutModal, setHangoutModal] = useState<{
    open: boolean;
    coords: Coordinates;
    placeName: string;
  }>({
    open: false,
    coords: { lat: -6.2442, lng: 106.8006 },
    placeName: 'M Bloc Space Blok M',
  });

  const isAuthenticated = useZonaStore((s) => s.isAuthenticated);
  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const circles = useZonaStore((s) => s.circles);
  const createHangoutPin = useZonaStore((s) => s.createHangoutPin);
  const joinCircleByCode = useZonaStore((s) => s.joinCircleByCode);
  const setOnlineStatus = useZonaStore((s) => s.setOnlineStatus);
  const hydrateSnapshot = useZonaStore((s) => s.hydrateSnapshot);

  const cloudBackend = useMemo(
    () =>
      createZonaCloudBackend({
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      }),
    []
  );

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Hydrate IndexedDB offline workspace & subscribe to persist updates
  useEffect(() => {
    let active = true;
    loadWorkspaceSnapshot<Record<string, unknown>>().then((snap) => {
      if (active && snap) {
        hydrateSnapshot(snap);
      }
      // Handle deep-link invite (?invite=ZONA-XXXX)
      const params = new URLSearchParams(window.location.search);
      const invite = params.get('invite');
      if (active && invite) {
        const res = joinCircleByCode(invite);
        if (res.ok && res.circle) {
          notify(`Bergabung otomatis ke Circle "${res.circle.name}"!`);
        }
      }
    });

    const unsubscribe = useZonaStore.subscribe((state) => {
      saveWorkspaceSnapshot({
        isAuthenticated: state.isAuthenticated,
        profiles: state.profiles,
        circles: state.circles,
        channels: state.channels,
        messages: state.messages,
        hangoutPins: state.hangoutPins,
        locations: state.locations,
        blockedUserIds: state.blockedUserIds,
        outbox: state.outbox,
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrateSnapshot, joinCircleByCode, notify]);

  // Track browser online/offline state for offline-first outbox flushing
  useEffect(() => {
    const onOnline = () => {
      setOnlineStatus(true);
      notify('Kembali online — antrean pesan tersinkronisasi.');
    };
    const onOffline = () => {
      setOnlineStatus(false);
      notify('Kamu sedang offline. Pesan baru disimpan di antrean lokal.');
    };

    setOnlineStatus(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnlineStatus, notify]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (!isAuthenticated) {
    return (
      <>
        <AuthOnboarding cloudBackend={cloudBackend} onNotify={notify} />
        {toast && <div className="zona-toast">{toast}</div>}
      </>
    );
  }

  return (
    <div
      className={`zona-shell ${showMap ? '' : 'map-collapsed'}`}
      data-mobile-tab={mobileTab}
    >
      <CircleRail
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        showMap={showMap}
        onToggleMap={() => setShowMap((v) => !v)}
        onOpenCircleModal={() => setCircleModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <ChannelSidebar
        onChannelPicked={() => setMobileTab('chat')}
        onOpenCircleModal={() => setCircleModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNotify={notify}
      />

      <ChatPanel
        onOpenHangoutModal={() =>
          setHangoutModal((m) => ({ ...m, open: true }))
        }
        onFocusMapPin={(pinId) => {
          setHighlightedPinId(pinId);
          setShowMap(true);
          setMobileTab('map');
        }}
        onNotify={notify}
      />

      {showMap && (
        <SocialMapPanel
          onRequestPinAt={(coords, placeGuess) =>
            setHangoutModal({ open: true, coords, placeName: placeGuess })
          }
          highlightedPinId={highlightedPinId}
          onNotify={notify}
        />
      )}

      {/* Mobile Browser Bottom Navigation */}
      <nav className="mobile-nav" aria-label="Navigasi Mobile">
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => setMobileTab('map')}
        >
          <Map size={18} />
          <span>Map</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileTab('chat')}
        >
          <MessageCircle size={18} />
          <span>Chat</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'circles' ? 'active' : ''}`}
          onClick={() => setMobileTab('circles')}
        >
          <Hash size={18} />
          <span>Circles</span>
        </button>
      </nav>

      {hangoutModal.open && (
        <HangoutModal
          initialCoords={hangoutModal.coords}
          initialPlace={hangoutModal.placeName}
          onClose={() => setHangoutModal((m) => ({ ...m, open: false }))}
          onConfirm={({ placeName, title, startsAtLabel, coords }) => {
            const targetCircleId = activeCircleId ?? circles[0]?.id ?? 'c-kampus';
            const { pin } = createHangoutPin({
              circleId: targetCircleId,
              title,
              placeName,
              startsAtLabel,
              point: coords,
            });
            setHangoutModal((m) => ({ ...m, open: false }));
            setHighlightedPinId(pin.id);
            setShowMap(true);
            setMobileTab('chat');
            notify(`Pin "${placeName}" dibuat beserta kanal obrolannya!`);
          }}
        />
      )}

      {circleModalOpen && (
        <CircleManageModal
          onClose={() => setCircleModalOpen(false)}
          onNotify={notify}
        />
      )}

      {settingsOpen && (
        <ProfileSettingsModal
          onClose={() => setSettingsOpen(false)}
          onNotify={notify}
        />
      )}

      {toast && <div className="zona-toast">{toast}</div>}
    </div>
  );
}
