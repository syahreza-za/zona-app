import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  Map,
  MessageCircle,
  Mic,
  MicOff,
  PhoneOff,
  User,
  Users,
  Volume2,
} from 'lucide-react';
import {
  createZonaCloudBackend,
  useZonaStore,
  type Coordinates,
  type Message,
} from '@zona/shared';
import { AuthOnboarding } from './components/AuthOnboarding';
import { CircleRail } from './components/CircleRail';
import { ChannelSidebar } from './components/ChannelSidebar';
import { ChatPanel } from './components/ChatPanel';
import { SocialMapPanel } from './components/SocialMapPanel';
import { VoiceStageView } from './components/VoiceStageView';
import { StoryViewerModal } from './components/StoryViewerModal';
import { HangoutModal } from './components/HangoutModal';
import { CircleManageModal } from './components/CircleManageModal';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './services/offlineDb';
import { zonaVoiceEngine } from './services/livekitVoice';

type MobileTab = 'chat' | 'circles' | 'map' | 'profile';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('zona_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Ignore storage errors
    }
    return 'light';
  });

  const [fullMapMode, setFullMapMode] = useState(false);
  const [voiceStageOpen, setVoiceStageOpen] = useState(false);
  const [splitMapOpen, setSplitMapOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > 1120 : true
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [mobileChatView, setMobileChatView] = useState<'list' | 'thread'>('list');
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 767 : false
  );
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [storyState, setStoryState] = useState<{
    stories: Message[];
    index: number;
  } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [circleModalOpen, setCircleModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hangoutModal, setHangoutModal] = useState<{
    open: boolean;
    coords: Coordinates;
    placeName: string;
  }>({
    open: false,
    coords: { lat: -6.2442, lng: 106.8006 },
    placeName: 'M Bloc Space',
  });

  const isAuthenticated = useZonaStore((s) => s.isAuthenticated);
  const chatTheme = useZonaStore((s) => s.chatTheme);
  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const activeVoiceLoungeId = useZonaStore((s) => s.activeVoiceLoungeId);
  const isMuted = useZonaStore((s) => s.isMuted);
  const circles = useZonaStore((s) => s.circles);
  const voiceLounges = useZonaStore((s) => s.voiceLounges);
  const createHangoutPin = useZonaStore((s) => s.createHangoutPin);
  const joinCircleByCode = useZonaStore((s) => s.joinCircleByCode);
  const setOnlineStatus = useZonaStore((s) => s.setOnlineStatus);
  const toggleMute = useZonaStore((s) => s.toggleMute);
  const leaveVoiceLounge = useZonaStore((s) => s.leaveVoiceLounge);
  const hydrateSnapshot = useZonaStore((s) => s.hydrateSnapshot);

  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  const activeCircle = circles.find((c) => c.id === activeCircleId);

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
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Close Voice Stage automatically if disconnected
  useEffect(() => {
    if (!activeVoiceLoungeId && voiceStageOpen) {
      setVoiceStageOpen(false);
    }
  }, [activeVoiceLoungeId, voiceStageOpen]);

  // Hydrate Dexie offline workspace & subscribe to persist updates
  useEffect(() => {
    let active = true;
    loadWorkspaceSnapshot<Record<string, unknown>>().then((snap) => {
      if (active && snap) {
        hydrateSnapshot(snap);
      }
      const params = new URLSearchParams(window.location.search);
      const invite = params.get('invite');
      if (active && invite) {
        const res = joinCircleByCode(invite);
        if (res.ok && res.circle) {
          notify(`Bergabung ke Circle "${res.circle.name}".`);
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
        reports: state.reports,
        outbox: state.outbox,
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrateSnapshot, joinCircleByCode, notify]);

  // Track online/offline state for offline-first outbox flushing
  useEffect(() => {
    const onOnline = () => {
      setOnlineStatus(true);
      notify('Kembali online — pesan tersinkronisasi.');
    };
    const onOffline = () => {
      setOnlineStatus(false);
      notify('Sedang offline. Pesan akan dikirim saat koneksi kembali.');
    };

    setOnlineStatus(navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnlineStatus, notify]);

  // Sync theme attribute & browser chrome theme-color
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('zona_theme', theme);
    } catch {
      // Ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#181A20' : '#F4F1EA');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  // Per-Circle Dynamic Accent Adaptation (Emerald, Sky Blue, Amber, Coral, Teal)
  const dynamicAccentStyle = useMemo<CSSProperties>(() => {
    const accent = activeCircle?.accentColor ?? '#10B981';
    const isSky = accent.toLowerCase() === '#0ea5e9';
    const isAmber = accent.toLowerCase() === '#d97706';
    const isCoral = accent.toLowerCase() === '#ea580c';
    const isTeal = accent.toLowerCase() === '#0d9488';

    const hover = isSky
      ? '#0284C7'
      : isAmber
        ? '#B45309'
        : isCoral
          ? '#C2410C'
          : isTeal
            ? '#0F766E'
            : '#059669';

    const bubbleOutLight = isSky
      ? 'linear-gradient(180deg, #0EA5E9 0%, #0284C7 100%)'
      : isAmber
        ? 'linear-gradient(180deg, #D97706 0%, #B45309 100%)'
        : isCoral
          ? 'linear-gradient(180deg, #EA580C 0%, #C2410C 100%)'
          : 'linear-gradient(180deg, #10B981 0%, #059669 100%)';

    const bubbleOutDark = isSky
      ? '#163D5C'
      : isAmber
        ? '#4D3314'
        : isCoral
          ? '#522515'
          : '#144A3E';

    return {
      '--accent': accent,
      '--accent-hover': hover,
      '--accent-soft': `${accent}1F`,
      '--bubble-out-bg': theme === 'dark' ? bubbleOutDark : bubbleOutLight,
      '--bubble-out-text': '#FFFFFF',
      '--bubble-out-meta': 'rgba(255, 255, 255, 0.82)',
    } as CSSProperties;
  }, [activeCircle?.accentColor, theme]);

  if (!isAuthenticated) {
    return (
      <>
        <AuthOnboarding cloudBackend={cloudBackend} onNotify={notify} />
        {toast && <div className="zona-toast">{toast}</div>}
      </>
    );
  }

  const shellClass = fullMapMode
    ? 'zona-shell full-map-mode'
    : splitMapOpen
      ? 'zona-shell with-split-map'
      : 'zona-shell';

  return (
    <div
      className={shellClass}
      style={dynamicAccentStyle}
      data-chat-theme={chatTheme}
      data-mobile-tab={mobileTab}
      data-mobile-view={mobileChatView}
    >
      <CircleRail
        fullMapMode={fullMapMode}
        onToggleFullMap={() => {
          setFullMapMode((v) => !v);
          setVoiceStageOpen(false);
        }}
        onSelectChatSpace={() => {
          setFullMapMode(false);
          setVoiceStageOpen(false);
        }}
        onOpenCircleModal={() => setCircleModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {!fullMapMode && (
        <ChannelSidebar
          theme={theme}
          onToggleTheme={toggleTheme}
          cloudBackend={cloudBackend}
          mobileMode={
            isMobileViewport && (mobileTab === 'chat' || mobileTab === 'circles')
              ? mobileTab
              : undefined
          }
          onChannelPicked={() => {
            setVoiceStageOpen(false);
            setMobileTab('chat');
            setMobileChatView('thread');
          }}
          onOpenVoiceStage={() => {
            setFullMapMode(false);
            setVoiceStageOpen(true);
            setMobileTab('chat');
            setMobileChatView('thread');
          }}
          onOpenStory={(stories, index) => setStoryState({ stories, index })}
          onOpenCircleModal={() => setCircleModalOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onNotify={notify}
        />
      )}

      {!fullMapMode &&
        (voiceStageOpen && activeVoice ? (
          <VoiceStageView
            onCloseStage={() => setVoiceStageOpen(false)}
            onNotify={notify}
          />
        ) : (
          <ChatPanel
            splitMapOpen={splitMapOpen}
            onToggleSplitMap={() => setSplitMapOpen((v) => !v)}
            onBackMobile={() => setMobileChatView('list')}
            onOpenHangoutModal={() =>
              setHangoutModal((m) => ({ ...m, open: true }))
            }
            onFocusMapPin={(pinId) => {
              setHighlightedPinId(pinId);
              setSplitMapOpen(true);
              setMobileTab('map');
            }}
            onNotify={notify}
          />
        ))}

      {(fullMapMode || splitMapOpen || mobileTab === 'map') && (
        <SocialMapPanel
          theme={theme}
          onRequestPinAt={(coords, placeGuess) =>
            setHangoutModal({ open: true, coords, placeName: placeGuess })
          }
          highlightedPinId={highlightedPinId}
          onCloseDrawer={
            !fullMapMode && !isMobileViewport ? () => setSplitMapOpen(false) : undefined
          }
          onSelectHangoutChannel={() => {
            setFullMapMode(false);
            setVoiceStageOpen(false);
            setMobileTab('chat');
            setMobileChatView('thread');
          }}
          onNotify={notify}
        />
      )}

      {/* Mobile Tab 4: Inline Profile & Settings Pane */}
      {isMobileViewport && mobileTab === 'profile' && (
        <ProfileSettingsModal
          theme={theme}
          onToggleTheme={toggleTheme}
          cloudBackend={cloudBackend}
          inline
          onNotify={notify}
        />
      )}

      {/* Mobile Floating Compact Voice Pill above Bottom Bar */}
      {activeVoice && (
        <div
          className="mobile-voice-pill"
          role="status"
          onClick={() => {
            setVoiceStageOpen(true);
            setMobileTab('chat');
            setMobileChatView('thread');
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <Volume2 size={15} strokeWidth={2} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeVoice.name}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              style={{ color: '#ffffff' }}
              onClick={async () => {
                const next = !isMuted;
                toggleMute();
                await zonaVoiceEngine.setMuted(next);
              }}
              aria-label={isMuted ? 'Aktifkan mikrofon' : 'Bisukan mikrofon'}
            >
              {isMuted ? <MicOff size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={2} />}
            </button>
            <button
              type="button"
              style={{ color: '#ffffff' }}
              onClick={async () => {
                await zonaVoiceEngine.disconnect();
                leaveVoiceLounge();
              }}
              aria-label="Keluar ruang suara"
            >
              <PhoneOff size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Native 4-Tab Bottom Bar */}
      <nav className="mobile-bottom-nav" aria-label="Navigasi Utama">
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'chat' ? 'active' : ''}`}
          onClick={() => {
            setVoiceStageOpen(false);
            setMobileTab('chat');
            setMobileChatView('list');
          }}
        >
          <MessageCircle size={20} strokeWidth={1.75} />
          <span>Chat</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'circles' ? 'active' : ''}`}
          onClick={() => {
            setVoiceStageOpen(false);
            setMobileTab('circles');
          }}
        >
          <Users size={20} strokeWidth={1.75} />
          <span>Circles</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => {
            setVoiceStageOpen(false);
            setMobileTab('map');
          }}
        >
          <Map size={20} strokeWidth={1.75} />
          <span>Map</span>
        </button>
        <button
          type="button"
          className={`mobile-nav-btn ${mobileTab === 'profile' ? 'active' : ''}`}
          onClick={() => {
            setVoiceStageOpen(false);
            setMobileTab('profile');
          }}
        >
          <User size={20} strokeWidth={1.75} />
          <span>Profil</span>
        </button>
      </nav>

      {storyState && (
        <StoryViewerModal
          stories={storyState.stories}
          initialIndex={storyState.index}
          onClose={() => setStoryState(null)}
          onNotify={notify}
        />
      )}

      {hangoutModal.open && (
        <HangoutModal
          initialCoords={hangoutModal.coords}
          initialPlace={hangoutModal.placeName}
          onClose={() => setHangoutModal((m) => ({ ...m, open: false }))}
          onConfirm={({ placeName, title, startsAtLabel, category, coords }) => {
            const targetCircleId = activeCircleId ?? circles[0]?.id ?? 'c-kampus';
            const { pin } = createHangoutPin({
              circleId: targetCircleId,
              title,
              placeName,
              startsAtLabel,
              category,
              point: coords,
            });
            setHangoutModal((m) => ({ ...m, open: false }));
            setHighlightedPinId(pin.id);
            setFullMapMode(false);
            setVoiceStageOpen(false);
            setSplitMapOpen(true);
            setMobileTab('chat');
            setMobileChatView('thread');
            notify(`Pin "${placeName}" dan kanalnya telah dibuat.`);
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
          theme={theme}
          onToggleTheme={toggleTheme}
          cloudBackend={cloudBackend}
          onClose={() => setSettingsOpen(false)}
          onNotify={notify}
        />
      )}

      {toast && <div className="zona-toast">{toast}</div>}
    </div>
  );
}
