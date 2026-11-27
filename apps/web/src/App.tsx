import { useCallback, useEffect, useState } from 'react';
import {
  useZonaStore,
  type Coordinates,
  type Message,
} from '@zona/shared';
import { AuthOnboarding } from './components/AuthOnboarding';
import { HorizonBar, type HorizonWorld } from './components/HorizonBar';
import { PulseHomeView } from './components/PulseHomeView';
import { RuangInboxSidebar } from './components/RuangInboxSidebar';
import { ChatPanel } from './components/ChatPanel';
import { SocialMapPanel } from './components/SocialMapPanel';
import { VoiceStageView } from './components/VoiceStageView';
import { VoiceIsland } from './components/VoiceIsland';
import { MobileCapsuleDock } from './components/MobileCapsuleDock';
import { StoryViewerModal } from './components/StoryViewerModal';
import { HangoutModal } from './components/HangoutModal';
import { QuickSnapModal } from './components/QuickSnapModal';
import { CircleManageModal } from './components/CircleManageModal';
import { ProfileSettingsModal } from './components/ProfileSettingsModal';
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from './services/offlineDb';
import { webCloudBackend, zonaCloudSync } from './services/cloudSync';

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

  // ZONA Original 3-World Architecture: Pulse (default) · Ruang · Peta
  const [world, setWorld] = useState<HorizonWorld>('pulse');
  const [mobileRuangView, setMobileRuangView] = useState<'list' | 'thread'>('list');
  const [voiceStageOpen, setVoiceStageOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 899 : false
  );
  const [highlightedPinId, setHighlightedPinId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [storyState, setStoryState] = useState<{
    stories: Message[];
    index: number;
  } | null>(null);

  const [circleModalOpen, setCircleModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [quickSnapOpen, setQuickSnapOpen] = useState(false);
  const [hangoutModal, setHangoutModal] = useState<{
    open: boolean;
    coords: Coordinates;
    placeName: string;
  }>({
    open: false,
    coords: { lat: -6.2442, lng: 106.8006 },
    placeName: 'M Bloc Space',
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 899px)');
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const isAuthenticated = useZonaStore((s) => s.isAuthenticated);
  const backendMode = useZonaStore((s) => s.backendMode);
  const chatTheme = useZonaStore((s) => s.chatTheme);
  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const activeChannelId = useZonaStore((s) => s.activeChannelId);
  const activeVoiceLoungeId = useZonaStore((s) => s.activeVoiceLoungeId);
  const circles = useZonaStore((s) => s.circles);
  const channels = useZonaStore((s) => s.channels);
  const voiceLounges = useZonaStore((s) => s.voiceLounges);
  const selectChannel = useZonaStore((s) => s.selectChannel);
  const sendQuickSnap = useZonaStore((s) => s.sendQuickSnap);
  const createHangoutPin = useZonaStore((s) => s.createHangoutPin);
  const joinCircleByCode = useZonaStore((s) => s.joinCircleByCode);
  const setOnlineStatus = useZonaStore((s) => s.setOnlineStatus);
  const hydrateSnapshot = useZonaStore((s) => s.hydrateSnapshot);

  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  const cloudBackend = webCloudBackend;

  const totalUnread = channels
    .filter((ch) => !ch.isArchived)
    .filter((ch) => (!activeCircleId ? true : ch.circleId === null || ch.circleId === activeCircleId))
    .reduce((sum, ch) => sum + ch.unreadCount, 0);

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

  // Hydrate Dexie offline workspace, restore Cloud OAuth session, & subscribe to local persistence
  useEffect(() => {
    let active = true;
    loadWorkspaceSnapshot<Record<string, unknown>>().then(async (snap) => {
      if (active && snap) {
        hydrateSnapshot(snap);
      }
      if (active) {
        await zonaCloudSync.restoreSessionIfPresent();
      }
      const params = new URLSearchParams(window.location.search);
      const invite = params.get('invite');
      if (active && invite) {
        if (zonaCloudSync.isActive()) {
          const cloudRes = await zonaCloudSync.syncJoinCircle(invite);
          if (cloudRes.ok) {
            notify(`Bergabung ke Circle (${invite}).`);
          }
        } else {
          const res = joinCircleByCode(invite);
          if (res.ok && res.circle) {
            notify(`Bergabung ke Circle "${res.circle.name}".`);
          }
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

  // Activate Supabase Cloud hydration + Realtime + Outbox flush whenever authenticated in Cloud mode
  useEffect(() => {
    if (!isAuthenticated || backendMode !== 'cloud' || !cloudBackend.isConfigured()) {
      zonaCloudSync.stopRealtime();
      return;
    }

    let active = true;
    zonaCloudSync.hydrateFromCloud().then(() => {
      if (!active) return;
      zonaCloudSync.startRealtime();
      zonaCloudSync.watchChannelPresence(useZonaStore.getState().activeChannelId);
      void zonaCloudSync.flushPendingOutbox();
    });

    return () => {
      active = false;
      zonaCloudSync.stopRealtime();
    };
  }, [isAuthenticated, backendMode, cloudBackend]);

  // Subscribe to per-channel Supabase Presence for real typing indicators
  useEffect(() => {
    if (isAuthenticated && backendMode === 'cloud' && activeChannelId) {
      zonaCloudSync.watchChannelPresence(activeChannelId);
    }
  }, [isAuthenticated, backendMode, activeChannelId]);

  // Track online/offline state for offline-first outbox flushing
  useEffect(() => {
    const onOnline = async () => {
      setOnlineStatus(true);
      if (zonaCloudSync.isActive()) {
        const flushed = await zonaCloudSync.flushPendingOutbox();
        notify(
          flushed > 0
            ? `Kembali online — ${flushed} pesan tertunda terkirim.`
            : 'Kembali online — pesan tersinkronisasi.'
        );
      } else {
        notify('Kembali online — pesan tersinkronisasi.');
      }
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
      meta.setAttribute('content', theme === 'dark' ? '#0A0A0A' : '#FFFFFF');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleOpenHangout = useCallback((coords?: Coordinates, placeGuess?: string) => {
    setHangoutModal((m) => ({
      open: true,
      coords: coords ?? m.coords,
      placeName: placeGuess ?? m.placeName,
    }));
  }, []);

  const handleOpenChannelInRuang = useCallback(
    (channelId: string) => {
      selectChannel(channelId);
      setVoiceStageOpen(false);
      setWorld('ruang');
      setMobileRuangView('thread');
    },
    [selectChannel]
  );

  const handleChangeWorld = useCallback((nextWorld: HorizonWorld) => {
    setVoiceStageOpen(false);
    setWorld(nextWorld);
    if (nextWorld === 'ruang') {
      setMobileRuangView('list');
    }
  }, []);

  if (!isAuthenticated) {
    return (
      <>
        <AuthOnboarding
          theme={theme}
          onToggleTheme={toggleTheme}
          cloudBackend={cloudBackend}
          onNotify={notify}
        />
        {toast && <div className="zona-toast">{toast}</div>}
      </>
    );
  }

  const hideMobileDock =
    !isMobileViewport ||
    voiceStageOpen ||
    (world === 'ruang' && mobileRuangView === 'thread');

  return (
    <div
      className={`zona-app-shell world-${world}`}
      data-chat-theme={chatTheme}
      data-world={world}
      data-mobile-ruang={mobileRuangView}
    >
      {/* Top Horizon Bar (Replaces Discord Left Vertical Rail!) */}
      <HorizonBar
        world={world}
        onChangeWorld={handleChangeWorld}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenHangoutModal={() => handleOpenHangout()}
        onOpenCircleModal={() => setCircleModalOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onNotify={notify}
      />

      {/* Main Content Stage: 3 Original Worlds (Pulse · Ruang · Peta) or Full Voice Stage */}
      <div className="zona-stage">
        {voiceStageOpen && activeVoice ? (
          <div className="zona-voice-stage-wrap">
            <VoiceStageView
              onCloseStage={() => setVoiceStageOpen(false)}
              onNotify={notify}
            />
          </div>
        ) : world === 'pulse' ? (
          <PulseHomeView
            theme={theme}
            cloudBackend={cloudBackend}
            onExpandMap={(pinId) => {
              if (pinId) setHighlightedPinId(pinId);
              setWorld('peta');
            }}
            onOpenChannelInRuang={handleOpenChannelInRuang}
            onOpenRuangAll={() => handleChangeWorld('ruang')}
            onOpenStory={(stories, index) => setStoryState({ stories, index })}
            onOpenQuickSnap={() => setQuickSnapOpen(true)}
            onOpenHangoutModal={handleOpenHangout}
            onOpenVoiceStage={() => setVoiceStageOpen(true)}
            onNotify={notify}
          />
        ) : world === 'ruang' ? (
          <div className={`ruang-layout mobile-${mobileRuangView}`}>
            <RuangInboxSidebar
              onConversationPicked={() => setMobileRuangView('thread')}
              onOpenCircleModal={() => setCircleModalOpen(true)}
              onNotify={notify}
            />
            <ChatPanel
              theme={theme}
              cloudBackend={cloudBackend}
              onBackMobile={() => setMobileRuangView('list')}
              onOpenHangoutModal={() => handleOpenHangout()}
              onFocusMapPin={(pinId) => {
                setHighlightedPinId(pinId);
                setWorld('peta');
              }}
              onOpenVoiceStage={() => setVoiceStageOpen(true)}
              onNotify={notify}
            />
          </div>
        ) : (
          <div className="peta-full-wrap">
            <SocialMapPanel
              theme={theme}
              variant="full"
              circleFilterOverride={activeCircleId ?? undefined}
              onRequestPinAt={(coords, placeGuess) => handleOpenHangout(coords, placeGuess)}
              highlightedPinId={highlightedPinId}
              onSelectHangoutChannel={(channelId) => {
                if (channelId) {
                  handleOpenChannelInRuang(channelId);
                } else {
                  setWorld('ruang');
                  setMobileRuangView('thread');
                }
              }}
              onNotify={notify}
            />
          </div>
        )}
      </div>

      {/* Persistent Floating Voice Island (Dynamic Island style across Pulse, Ruang, Peta!) */}
      {activeVoice && !voiceStageOpen && (
        <VoiceIsland
          onOpenStage={() => setVoiceStageOpen(true)}
          onNotify={notify}
        />
      )}

      {/* Mobile Floating Capsule Dock (3 Worlds + Detached Terracotta + FAB) */}
      {!hideMobileDock && (
        <MobileCapsuleDock
          world={world}
          unreadCount={totalUnread}
          onChangeWorld={handleChangeWorld}
          onOpenHangoutModal={() => handleOpenHangout()}
          onOpenQuickSnap={() => setQuickSnapOpen(true)}
        />
      )}

      {/* Modals */}
      {storyState && (
        <StoryViewerModal
          stories={storyState.stories}
          initialIndex={storyState.index}
          onClose={() => setStoryState(null)}
          onNotify={notify}
        />
      )}

      {quickSnapOpen && (
        <QuickSnapModal
          onClose={() => setQuickSnapOpen(false)}
          onSend={({ caption, viewOnce, mediaUrl }) => {
            const targetChannel =
              channels.find((c) => c.id === 'ch-kampus-media') ??
              channels.find((c) => c.circleId === (activeCircleId ?? circles[0]?.id)) ??
              channels[0];
            if (!targetChannel) return;
            const snapMsg = sendQuickSnap(targetChannel.id, caption, viewOnce, mediaUrl);
            void zonaCloudSync.syncSendMessage(snapMsg);
            notify('Momen 24 jam dibagikan!');
          }}
        />
      )}

      {hangoutModal.open && (
        <HangoutModal
          initialCoords={hangoutModal.coords}
          initialPlace={hangoutModal.placeName}
          onClose={() => setHangoutModal((m) => ({ ...m, open: false }))}
          onConfirm={({ placeName, title, startsAtLabel, category, coords }) => {
            const targetCircleId = activeCircleId ?? circles[0]?.id ?? 'c-kampus';
            const { pin, channel } = createHangoutPin({
              circleId: targetCircleId,
              title,
              placeName,
              startsAtLabel,
              category,
              point: coords,
            });
            void zonaCloudSync.syncCreateHangoutPin(pin, channel);
            setHangoutModal((m) => ({ ...m, open: false }));
            setHighlightedPinId(pin.id);
            setVoiceStageOpen(false);
            setWorld('ruang');
            setMobileRuangView('thread');
            notify(`Pin "${placeName}" dan topik kumpulnya telah dibuat.`);
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
