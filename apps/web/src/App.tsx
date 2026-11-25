import { useEffect, useState } from 'react';
import { Hash, Map, MessageCircle } from 'lucide-react';
import { useZonaStore, type Coordinates } from '@zona/shared';
import { CircleRail } from './components/CircleRail';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatPanel } from './components/ChatPanel';
import { SocialMapPanel } from './components/SocialMapPanel';

const STORAGE_KEY = 'zona_demo_snapshot_v1';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showMap, setShowMap] = useState(true);
  const [mobileTab, setMobileTab] = useState<'map' | 'chat' | 'circles'>('chat');
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);

  const [hangoutModal, setHangoutModal] = useState<{
    open: boolean;
    coords: Coordinates;
    placeName: string;
    title: string;
    startsAtLabel: string;
  }>({
    open: false,
    coords: { lat: -6.2442, lng: 106.8006 },
    placeName: 'M Bloc Space Blok M',
    title: 'Nongkrong & Ngopi Sore',
    startsAtLabel: 'Hari ini • 19.00 WIB',
  });

  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const circles = useZonaStore((s) => s.circles);
  const createHangoutPin = useZonaStore((s) => s.createHangoutPin);
  const hydrateSnapshot = useZonaStore((s) => s.hydrateSnapshot);

  // Hydrate offline snapshot on mount & persist changes automatically
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        hydrateSnapshot(JSON.parse(raw));
      }
    } catch {
      // Ignore corrupt local cache
    }

    const unsubscribe = useZonaStore.subscribe((state) => {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            channels: state.channels,
            messages: state.messages,
            hangoutPins: state.hangoutPins,
            locations: state.locations,
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    });

    return unsubscribe;
  }, [hydrateSnapshot]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleOpenPinAt = (coords: Coordinates, placeGuess: string) => {
    setHangoutModal({
      open: true,
      coords,
      placeName: placeGuess,
      title: 'Ajak Kumpul Spontan',
      startsAtLabel: 'Hari ini • 19.30 WIB',
    });
  };

  const handleConfirmHangout = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCircleId = activeCircleId ?? circles[0]?.id ?? 'c-kampus';
    const { pin } = createHangoutPin({
      circleId: targetCircleId,
      title: hangoutModal.title,
      placeName: hangoutModal.placeName,
      startsAtLabel: hangoutModal.startsAtLabel,
      point: hangoutModal.coords,
    });
    setHangoutModal((m) => ({ ...m, open: false }));
    setHighlightedPinId(pin.id);
    setShowMap(true);
    setMobileTab('chat');
  };

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
      />

      <ChannelSidebar onChannelPicked={() => setMobileTab('chat')} />

      <ChatPanel
        onOpenHangoutModal={() =>
          setHangoutModal((m) => ({ ...m, open: true }))
        }
        onFocusMapPin={(pinId) => {
          setHighlightedPinId(pinId);
          setShowMap(true);
          setMobileTab('map');
        }}
      />

      {showMap && (
        <SocialMapPanel
          onRequestPinAt={handleOpenPinAt}
          highlightedPinId={highlightedPinId}
        />
      )}

      {/* Mobile Browser Bottom Navigation (3-Screen Switcher) */}
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

      {/* Map-to-Channel "Ajak Kumpul" Modal */}
      {hangoutModal.open && (
        <div
          className="modal-backdrop"
          onClick={() => setHangoutModal((m) => ({ ...m, open: false }))}
        >
          <form
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmHangout}
          >
            <h3>Buat Pin Ajak Kumpul</h3>
            <p className="channel-meta" style={{ margin: 0 }}>
              Otomatis menaruh pin di Live Map + membuat kanal sementara + mengirim
              kartu RSVP ke Circle.
            </p>

            <label className="field-label">
              Nama Lokasi
              <input
                id="hangout-place-input"
                className="field-input"
                value={hangoutModal.placeName}
                onChange={(e) =>
                  setHangoutModal((m) => ({ ...m, placeName: e.target.value }))
                }
                required
              />
            </label>

            <label className="field-label">
              Agenda Singkat
              <input
                id="hangout-title-input"
                className="field-input"
                value={hangoutModal.title}
                onChange={(e) =>
                  setHangoutModal((m) => ({ ...m, title: e.target.value }))
                }
                required
              />
            </label>

            <label className="field-label">
              Waktu Kumpul
              <input
                id="hangout-time-input"
                className="field-input"
                value={hangoutModal.startsAtLabel}
                onChange={(e) =>
                  setHangoutModal((m) => ({
                    ...m,
                    startsAtLabel: e.target.value,
                  }))
                }
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="pill-action"
                onClick={() => setHangoutModal((m) => ({ ...m, open: false }))}
              >
                Batal
              </button>
              <button
                id="btn-confirm-hangout"
                type="submit"
                className="pill-action primary"
              >
                Taruh Pin & Buat Kanal
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
