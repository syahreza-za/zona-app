import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import {
  clusterMapMarkers,
  createZonaCloudBackend,
  dataUrlToBlob,
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  groupMessages,
  isValidUuid,
  resolveVisibleCoordinates,
  useZonaStore,
  type ChatWallpaperTheme,
  type HangoutCategory,
  type PrivacyMode,
} from '@zona/shared';

type MobileWorld = 'pulse' | 'ruang' | 'peta';
type InboxFilter = 'all' | 'dm' | 'circle' | 'hangout';
type SheetSnap = 'peek' | 'half' | 'expanded';

const STORAGE_KEY = '@zona/workspace_v1';

const mobileCloudBackend = createZonaCloudBackend({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

const PALETTES = {
  light: {
    canvas: '#FFFFFF',
    panel: '#FFFFFF',
    input: '#F5F5F5',
    canvasByTheme: {
      clean: '#FFFFFF',
      'warm-sand': '#FAFAFA',
      'ocean-mist': '#F8F9FA',
      'midnight-forest': '#F8F8F8',
    } as Record<ChatWallpaperTheme, string>,
    bubbleIn: '#F5F5F5',
    bubbleOut: '#0A0A0A',
    bubbleOutText: '#FFFFFF',
    hairline: '#EAEAEA',
    textPrimary: '#0A0A0A',
    textSecondary: '#6E6E73',
    textMuted: '#9A9AA0',
    accent: '#0A0A0A',
    accentSoft: '#F5F5F5',
    live: '#E05A3F',
    liveSoft: 'rgba(224, 90, 63, 0.1)',
    danger: '#DC2626',
    mapBg: '#F5F5F5',
    mapPark: '#E2ECE0',
    mapWater: '#D6E6F2',
    glass: 'rgba(255, 255, 255, 0.94)',
    capsuleActiveBg: '#0A0A0A',
    capsuleActiveText: '#FFFFFF',
  },
  dark: {
    canvas: '#0A0A0A',
    panel: '#0A0A0A',
    input: '#161616',
    canvasByTheme: {
      clean: '#0A0A0A',
      'warm-sand': '#0D0D0D',
      'ocean-mist': '#0B0D0E',
      'midnight-forest': '#0B0C0B',
    } as Record<ChatWallpaperTheme, string>,
    bubbleIn: '#1A1A1A',
    bubbleOut: '#F5F5F5',
    bubbleOutText: '#0A0A0A',
    hairline: '#222222',
    textPrimary: '#F5F5F5',
    textSecondary: '#8E8E93',
    textMuted: '#5C5C60',
    accent: '#FFFFFF',
    accentSoft: '#161616',
    live: '#FF5A36',
    liveSoft: 'rgba(255, 90, 54, 0.14)',
    danger: '#F87171',
    mapBg: '#121212',
    mapPark: '#17221B',
    mapWater: '#121922',
    glass: 'rgba(18, 18, 18, 0.94)',
    capsuleActiveBg: '#FFFFFF',
    capsuleActiveText: '#0A0A0A',
  },
};

const CATEGORY_COLORS: Record<HangoutCategory, string> = {
  coffee: '#0A0A0A',
  food: '#0A0A0A',
  gaming: '#0A0A0A',
  sport: '#0A0A0A',
};

const CHAT_THEMES: Array<{ id: ChatWallpaperTheme; label: string }> = [
  { id: 'clean', label: 'Murni' },
  { id: 'warm-sand', label: 'Halus' },
  { id: 'ocean-mist', label: 'Sejuk' },
  { id: 'midnight-forest', label: 'Netral' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTopicLabel(name: string): string {
  if (name.toLowerCase() === 'umum') return 'Obrolan';
  return name.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [world, setWorld] = useState<MobileWorld>('pulse');
  const [inThread, setInThread] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [circlePickerOpen, setCirclePickerOpen] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [draft, setDraft] = useState('');
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');
  const [locatingGps, setLocatingGps] = useState(false);
  const [cloudSynced, setCloudSynced] = useState(false);

  const {
    currentUserId,
    chatTheme,
    setChatTheme,
    profiles,
    circles,
    channels,
    messages,
    locations,
    hangoutPins,
    voiceLounges,
    blockedUserIds,
    activeCircleId,
    activeChannelId,
    activeVoiceLoungeId,
    isMuted,
    selectedMapUserId,
    selectCircle,
    selectChannel,
    sendTextMessage,
    sendQuickSnap,
    joinVoiceLounge,
    leaveVoiceLounge,
    toggleMute,
    setMyPrivacyMode,
    updateMyCoordinates,
    setSelectedMapUser,
    createHangoutPin,
    respondToHangout,
    unblockUser,
    deleteMyAccount,
    hydrateSnapshot,
  } = useZonaStore();

  // 1. Offline Persistence (AsyncStorage)
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        hydrateSnapshot(parsed);
      })
      .catch(() => undefined);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useZonaStore.subscribe((state) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            isAuthenticated: state.isAuthenticated,
            profiles: state.profiles,
            circles: state.circles,
            channels: state.channels,
            messages: state.messages,
            hangoutPins: state.hangoutPins,
            locations: state.locations,
            blockedUserIds: state.blockedUserIds,
            outbox: state.outbox,
          })
        ).catch(() => undefined);
      }, 300);
    });

    return () => {
      active = false;
      if (saveTimer) clearTimeout(saveTimer);
      unsubscribe();
    };
  }, [hydrateSnapshot]);

  // 2. Shared Supabase Cloud Hydration & Realtime Sync (Phone <-> PC)
  useEffect(() => {
    if (!mobileCloudBackend.isConfigured()) return;
    let active = true;
    let rtSub: ReturnType<typeof mobileCloudBackend.subscribeWorkspaceChanges> = null;

    mobileCloudBackend
      .getSession()
      .then(async (session) => {
        if (!active || !session?.user) return;
        const snap = await mobileCloudBackend.fetchCloudWorkspace(session.user.id);
        if (!active) return;
        useZonaStore.getState().hydrateCloudWorkspace(snap);
        setCloudSynced(true);

        rtSub = mobileCloudBackend.subscribeWorkspaceChanges({
          onMessageInsert: (msg) => useZonaStore.getState().applyIncomingMessage(msg),
          onMessageUpdate: (id, patch) => useZonaStore.getState().applyMessageUpdate(id, patch),
          onChannelUpsert: (ch) => useZonaStore.getState().applyIncomingChannel(ch),
          onHangoutPinUpsert: (pin) => useZonaStore.getState().applyIncomingHangoutPin(pin),
          onHangoutRsvpUpsert: (pinId, uid, st) =>
            useZonaStore.getState().applyIncomingHangoutRsvp(pinId, uid, st),
        });
      })
      .catch(() => undefined);

    return () => {
      active = false;
      if (rtSub && mobileCloudBackend.isConfigured()) {
        mobileCloudBackend.getClient().removeChannel(rtSub).catch(() => undefined);
      }
    };
  }, []);

  const c = PALETTES[theme];
  const me = profiles[currentUserId];
  const activeChannel = channels.find((ch) => ch.id === activeChannelId);
  const activeCircle = circles.find((ci) => ci.id === activeCircleId) ?? null;
  const threadCircle = activeChannel?.circleId
    ? circles.find((ci) => ci.id === activeChannel.circleId) ?? null
    : null;
  const threadTopics = useMemo(
    () =>
      threadCircle
        ? channels.filter((ch) => ch.circleId === threadCircle.id && !ch.isArchived)
        : [],
    [channels, threadCircle]
  );
  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';
  const canvasBg = c.canvasByTheme[chatTheme];

  const activeSnapStories = useMemo(() => {
    return messages
      .filter((m) => m.type === 'quick_snap' && !m.isDeleted && !blockedUserIds.includes(m.senderId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [messages, blockedUserIds]);

  const visibleVoiceLounges = useMemo(
    () =>
      voiceLounges.filter((vl) => (!activeCircleId ? true : vl.circleId === activeCircleId)),
    [voiceLounges, activeCircleId]
  );

  const visibleHangouts = useMemo(
    () =>
      hangoutPins.filter((p) => (!activeCircleId ? true : p.circleId === activeCircleId)),
    [hangoutPins, activeCircleId]
  );

  const lastMessageByChannel = useMemo(() => {
    const map: Record<string, { text: string; createdAt: string }> = {};
    for (const m of messages) {
      if (blockedUserIds.includes(m.senderId)) continue;
      const existing = map[m.channelId];
      if (!existing || m.createdAt > existing.createdAt) {
        map[m.channelId] = {
          text: m.isDeleted ? 'Pesan dihapus' : m.content,
          createdAt: m.createdAt,
        };
      }
    }
    return map;
  }, [messages, blockedUserIds]);

  // Unified Inbox entries for Ruang (DMs + Circles as flat items, NO #channel sidebar!)
  const unifiedInbox = useMemo(() => {
    const q = inboxSearch.trim().toLowerCase();
    const list: Array<{
      kind: 'dm' | 'circle' | 'hangout';
      id: string;
      channelId: string;
      circleId?: string;
      title: string;
      preview: string;
      time: string;
      unread: number;
      badgeBg: string;
      badgeText: string;
    }> = [];

    if (inboxFilter === 'all' || inboxFilter === 'dm') {
      channels
        .filter((ch) => ch.type === 'dm' && !ch.isArchived)
        .forEach((ch) => {
          const partnerId = ch.participantIds?.find((id) => id !== currentUserId);
          const partner = partnerId ? profiles[partnerId] : null;
          const last = lastMessageByChannel[ch.id];
          list.push({
            kind: 'dm',
            id: ch.id,
            channelId: ch.id,
            title: ch.name,
            preview: last?.text ?? partner?.statusText ?? 'Mulai obrolan',
            time: last?.createdAt ?? '',
            unread: ch.unreadCount,
            badgeBg: partner?.avatarColor ?? c.accent,
            badgeText: partner?.initials ?? 'ZN',
          });
        });
    }

    if (inboxFilter === 'all' || inboxFilter === 'circle') {
      (activeCircleId ? circles.filter((ci) => ci.id === activeCircleId) : circles).forEach(
        (ci) => {
          const ciChs = channels.filter((ch) => ch.circleId === ci.id && !ch.isArchived);
          if (ciChs.length === 0) return;
          const topCh = [...ciChs].sort((a, b) =>
            (lastMessageByChannel[b.id]?.createdAt ?? '').localeCompare(
              lastMessageByChannel[a.id]?.createdAt ?? ''
            )
          )[0];
          const last = lastMessageByChannel[topCh.id];
          list.push({
            kind: 'circle',
            id: `circle-${ci.id}`,
            channelId: topCh.id,
            circleId: ci.id,
            title: ci.name,
            preview: last?.text ?? ci.description,
            time: last?.createdAt ?? '',
            unread: ciChs.reduce((s, ch) => s + ch.unreadCount, 0),
            badgeBg: ci.accentColor,
            badgeText: ci.shortCode,
          });
        }
      );
    }

    if (inboxFilter === 'hangout') {
      channels
        .filter(
          (ch) =>
            ch.type === 'hangout' &&
            !ch.isArchived &&
            (!activeCircleId || ch.circleId === activeCircleId)
        )
        .forEach((ch) => {
          const parent = circles.find((ci) => ci.id === ch.circleId);
          const last = lastMessageByChannel[ch.id];
          list.push({
            kind: 'hangout',
            id: ch.id,
            channelId: ch.id,
            circleId: ch.circleId ?? undefined,
            title: formatTopicLabel(ch.name),
            preview: last?.text ?? ch.topic ?? 'Koordinasi kumpul',
            time: last?.createdAt ?? '',
            unread: ch.unreadCount,
            badgeBg: parent?.accentColor ?? c.accent,
            badgeText: 'PIN',
          });
        });
    }

    return list
      .filter((item) => (!q ? true : item.title.toLowerCase().includes(q) || item.preview.toLowerCase().includes(q)))
      .sort((a, b) => b.time.localeCompare(a.time));
  }, [channels, circles, activeCircleId, currentUserId, profiles, lastMessageByChannel, inboxFilter, inboxSearch, c.accent]);

  const channelMessages = useMemo(
    () =>
      groupMessages(
        messages.filter(
          (m) => m.channelId === activeChannelId && !blockedUserIds.includes(m.senderId)
        )
      ),
    [messages, activeChannelId, blockedUserIds]
  );

  const visibleFriends = useMemo(
    () =>
      Object.values(locations)
        .filter((loc) => !blockedUserIds.includes(loc.userId))
        .filter((loc) => (!activeCircle ? true : activeCircle.memberIds.includes(loc.userId)))
        .map((loc) => ({
          userId: loc.userId,
          point: resolveVisibleCoordinates(loc.point, loc.privacyMode, loc.userId) ?? loc.point,
          loc,
          profile: profiles[loc.userId],
          coords: resolveVisibleCoordinates(loc.point, loc.privacyMode, loc.userId),
        }))
        .filter((entry) => entry.profile && entry.coords !== null),
    [locations, blockedUserIds, activeCircle, profiles]
  );

  const clusters = useMemo(() => clusterMapMarkers(visibleFriends, 220), [visibleFriends]);

  const handleSend = () => {
    if (!activeChannel || !draft.trim()) return;
    const msg = sendTextMessage(activeChannel.id, draft);
    setDraft('');
    if (cloudSynced && isValidUuid(msg.channelId)) {
      mobileCloudBackend.sendMessage(msg).catch(() => {
        useZonaStore.getState().queueMessageForOutbox(msg.id, msg.channelId);
      });
    }
  };

  // 3. Real Photo Picker for Quick Snap (expo-image-picker)
  const handlePickQuickSnap = async () => {
    const targetChannel = activeChannel ?? channels[0];
    if (!targetChannel) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Izin Galeri', 'Izinkan akses foto untuk mengirim Quick Snap.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.72,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const dataUrl = asset.base64
        ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`
        : asset.uri;
      const snapMsg = sendQuickSnap(targetChannel.id, 'Quick Snap 24 jam', false, dataUrl);

      if (cloudSynced && isValidUuid(targetChannel.id)) {
        try {
          let outbound = snapMsg;
          if (dataUrl.startsWith('data:')) {
            const converted = dataUrlToBlob(dataUrl);
            if (converted) {
              const signedUrl = await mobileCloudBackend.uploadMediaBlob(
                currentUserId,
                converted.blob,
                converted.ext
              );
              outbound = { ...snapMsg, mediaUrl: signedUrl };
              useZonaStore.getState().markMessageSynced(snapMsg.id, { mediaUrl: signedUrl });
            }
          }
          await mobileCloudBackend.sendMessage(outbound);
        } catch {
          useZonaStore.getState().queueMessageForOutbox(snapMsg.id, snapMsg.channelId);
        }
      }
    } catch {
      sendQuickSnap(targetChannel.id, 'Momen spontan dari ponsel');
    }
  };

  // 4. Real Device GPS (expo-location)
  const handleUpdateGps = async () => {
    setLocatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Izin Lokasi', 'Aktifkan izin lokasi untuk memperbarui posisi di Peta Sosial.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateMyCoordinates(coords, 'Lokasi GPS Saat Ini');
      if (cloudSynced) {
        await mobileCloudBackend
          .updateLocation(
            currentUserId,
            coords,
            myPrivacy,
            'Lokasi GPS Saat Ini',
            me?.statusEmoji ?? '☕',
            me?.statusText ?? ''
          )
          .catch(() => undefined);
      }
    } catch {
      Alert.alert('GPS', 'Tidak dapat mengambil posisi GPS saat ini.');
    } finally {
      setLocatingGps(false);
    }
  };

  const handleQuickHangout = () => {
    const circleId = activeCircleId ?? circles[0]?.id ?? 'c-kampus';
    const point = myLocation?.point ?? { lat: -6.2442, lng: 106.8006 };
    const { pin, channel } = createHangoutPin({
      circleId,
      title: 'Ngopi Sore',
      placeName: 'M Bloc Space',
      category: 'coffee',
      startsAtLabel: 'Hari ini · 18.30 WIB',
      point,
    });
    if (cloudSynced && isValidUuid(circleId)) {
      mobileCloudBackend
        .createHangoutPin(circleId, pin.title, pin.placeName, point)
        .then((res) => {
          useZonaStore.getState().replaceEntityId('pin', pin.id, res.pin_id);
          useZonaStore.getState().replaceEntityId('channel', channel.id, res.channel_id);
        })
        .catch(() => undefined);
    }
    setWorld('ruang');
    setInThread(true);
  };

  const handleFabCreate = () => {
    Alert.alert('Buat di ZONA', 'Pilih aksi cepat:', [
      { text: 'Pin Ajak Kumpul', onPress: handleQuickHangout },
      { text: 'Bagikan Quick Snap (24j)', onPress: () => void handlePickQuickSnap() },
      { text: 'Batal', style: 'cancel' },
    ]);
  };

  const showFloatingDock = !(world === 'ruang' && inThread);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.canvas }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* Minimalist Top Header (Circle Selector Pill + Theme & Profile Avatar) */}
      {showFloatingDock && (
        <View style={[styles.topBar, { borderBottomColor: c.hairline, backgroundColor: c.canvas }]}>
          <TouchableOpacity
            style={[styles.circleSelectorPill, { backgroundColor: c.panel, borderColor: c.hairline }]}
            onPress={() => setCirclePickerOpen(true)}
          >
            <View
              style={[
                styles.selectorDot,
                { backgroundColor: activeCircle?.accentColor ?? c.accent },
              ]}
            />
            <Text style={[styles.selectorLabel, { color: c.textPrimary }]} numberOfLines={1}>
              {activeCircle ? activeCircle.name : 'Semua Circle'} ▾
            </Text>
          </TouchableOpacity>

          <View style={styles.topRightRow}>
            <TouchableOpacity
              style={[styles.topIconBtn, { backgroundColor: c.panel, borderColor: c.hairline }]}
              onPress={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600' }}>
                {theme === 'dark' ? 'Terang' : 'Gelap'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.avatarSm, { backgroundColor: me?.avatarColor ?? c.accent }]}
              onPress={() => setProfileModalOpen(true)}
            >
              <Text style={styles.avatarText}>{me?.initials ?? 'RZ'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* WORLD 1: PULSE (Bento Home) */}
      {world === 'pulse' && (
        <ScrollView
          style={[styles.flex1, { backgroundColor: c.canvas }]}
          contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 112 }}
        >
          {/* Hero Map Preview Card */}
          <View style={[styles.heroMapCard, { backgroundColor: c.mapBg, borderColor: c.hairline }]}>
            <View style={[styles.heroMapBlob, { backgroundColor: c.mapPark, left: 16, top: 24, width: 120, height: 84 }]} />
            <View style={[styles.heroMapBlob, { backgroundColor: c.mapWater, right: 20, bottom: 26, width: 140, height: 56 }]} />

            <View style={styles.heroMapTopRow}>
              <View style={[styles.heroLiveChip, { backgroundColor: c.glass }]}>
                <View style={[styles.liveDot, { backgroundColor: c.live }]} />
                <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600' }}>
                  {visibleFriends.length} teman aktif
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.heroExpandBtn, { backgroundColor: c.capsuleActiveBg }]}
                onPress={() => setWorld('peta')}
              >
                <Text style={{ color: c.capsuleActiveText, fontSize: 12, fontWeight: '600' }}>
                  Perbesar Peta
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.heroAvatarRow}>
              {visibleFriends.slice(0, 4).map(({ userId, loc, profile }) => (
                <TouchableOpacity
                  key={userId}
                  style={[styles.heroFriendChip, { backgroundColor: c.glass, borderColor: c.hairline }]}
                  onPress={() => {
                    setSelectedMapUser(userId);
                    setWorld('peta');
                  }}
                >
                  <View style={[styles.avatarXs, { backgroundColor: profile.avatarColor }]}>
                    <Text style={styles.avatarTextXs}>{profile.initials}</Text>
                  </View>
                  <View>
                    <Text style={{ color: c.textPrimary, fontSize: 12, fontWeight: '600' }}>
                      {profile.displayName}
                    </Text>
                    <Text style={{ color: c.textMuted, fontSize: 10.5 }}>{loc.areaLabel}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 3:4 Quick Snap Moments Strip (Flat Section) */}
          <View style={[styles.bentoCard, { borderColor: c.hairline }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Momen</Text>
              <TouchableOpacity onPress={() => void handlePickQuickSnap()}>
                <Text style={{ color: c.textSecondary, fontSize: 12.5, fontWeight: '500' }}>+ Unggah</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingTop: 10 }}>
              <TouchableOpacity
                style={[styles.momentCardCreate, { backgroundColor: c.canvas, borderColor: c.hairline }]}
                onPress={() => void handlePickQuickSnap()}
              >
                <View style={[styles.momentPlusBadge, { backgroundColor: c.capsuleActiveBg }]}>
                  <Text style={{ color: c.capsuleActiveText, fontSize: 18, fontWeight: '600' }}>+</Text>
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12, fontWeight: '500', textAlign: 'center' }}>
                  Bagikan
                </Text>
              </TouchableOpacity>

              {activeSnapStories.map((snap) => {
                const author = profiles[snap.senderId];
                if (!author) return null;
                return (
                  <TouchableOpacity
                    key={snap.id}
                    style={[styles.momentCard, { backgroundColor: author.avatarColor }]}
                    onPress={() => {
                      selectChannel(snap.channelId);
                      setWorld('ruang');
                      setInThread(true);
                    }}
                  >
                    <Text style={styles.momentAuthor}>{author.displayName}</Text>
                    <Text style={styles.momentCaption} numberOfLines={2}>
                      {snap.snapCaption || 'Momen'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Suara (Flat Section) */}
          <View style={[styles.bentoCard, { borderColor: c.hairline }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 8 }]}>
              Suara
            </Text>
            {visibleVoiceLounges.map((vl) => {
              const joined = activeVoiceLoungeId === vl.id;
              return (
                <View
                  key={vl.id}
                  style={[styles.voiceCard, { borderColor: c.hairline }]}
                >
                  <View style={[styles.liveDot, { backgroundColor: c.live }]} />
                  <View style={styles.flex1}>
                    <Text style={[styles.rowTitle, { color: c.textPrimary }]}>{vl.name}</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.actionPill,
                      {
                        backgroundColor: joined ? c.capsuleActiveBg : 'transparent',
                        borderWidth: 1,
                        borderColor: joined ? c.capsuleActiveBg : c.hairline,
                      },
                    ]}
                    onPress={() => (joined ? leaveVoiceLounge() : joinVoiceLounge(vl.id))}
                  >
                    <Text
                      style={{
                        color: joined ? c.capsuleActiveText : c.textPrimary,
                        fontSize: 12.5,
                        fontWeight: '600',
                      }}
                    >
                      {joined ? 'Keluar' : 'Masuk'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Kumpul (Flat Section with ON/OFF RSVP) */}
          {visibleHangouts.slice(0, 1).map((pin) => {
            const myRsvp = pin.rsvps.find((r) => r.userId === currentUserId);
            return (
              <View
                key={pin.id}
                style={[styles.bentoCard, { borderColor: c.hairline }]}
              >
                <View style={styles.rowBetween}>
                  <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Kumpul</Text>
                  <Text style={[styles.meta, { color: c.textSecondary }]}>
                    {pin.startsAtLabel.replace('Hari ini · ', '')}
                  </Text>
                </View>
                <Text style={[styles.rowTitle, { color: c.textPrimary, marginTop: 6 }]}>
                  {pin.title}
                </Text>
                <Text style={[styles.meta, { color: c.textSecondary, marginBottom: 10 }]}>
                  {pin.placeName} · {pin.rsvps.length} respon
                </Text>
                <View style={styles.rsvpRow}>
                  {(['going', 'otw', 'maybe'] as const).map((status) => {
                    const selected = myRsvp?.status === status;
                    return (
                      <TouchableOpacity
                        key={status}
                        style={[
                          styles.rsvpBtn,
                          {
                            backgroundColor: selected ? c.capsuleActiveBg : 'transparent',
                            borderWidth: 1,
                            borderColor: selected ? c.capsuleActiveBg : c.hairline,
                          },
                        ]}
                        onPress={() => {
                          respondToHangout(pin.id, status);
                          if (cloudSynced && isValidUuid(pin.id)) {
                            void mobileCloudBackend
                              .upsertHangoutRsvp(pin.id, currentUserId, status)
                              .catch(() => undefined);
                          }
                        }}
                      >
                        <Text
                          style={{
                            color: selected ? c.capsuleActiveText : c.textSecondary,
                            fontSize: 12.5,
                            fontWeight: '600',
                          }}
                        >
                          {status === 'going' ? 'Ikut' : status === 'otw' ? 'OTW' : 'Nanti'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* WORLD 2: RUANG (Unified Inbox List) */}
      {world === 'ruang' && !inThread && (
        <View style={[styles.flex1, { backgroundColor: c.canvas }]}>
          <View style={styles.searchWrap}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: c.panel, color: c.textPrimary, borderColor: c.hairline }]}
              placeholder="Cari percakapan atau circle..."
              placeholderTextColor={c.textMuted}
              value={inboxSearch}
              onChangeText={setInboxSearch}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'dm', label: 'Langsung' },
                  { id: 'circle', label: 'Circle' },
                  { id: 'hangout', label: 'Kumpul' },
                ] as { id: InboxFilter; label: string }[]
              ).map((f) => (
                <TouchableOpacity
                  key={f.id}
                  style={[
                    styles.filterPill,
                    { backgroundColor: inboxFilter === f.id ? c.capsuleActiveBg : c.panel },
                  ]}
                  onPress={() => setInboxFilter(f.id)}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '600',
                      color: inboxFilter === f.id ? c.capsuleActiveText : c.textSecondary,
                    }}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView style={styles.flex1} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 110 }}>
            {unifiedInbox.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.inboxCard, { backgroundColor: c.panel, borderColor: c.hairline }]}
                onPress={() => {
                  if (item.circleId) selectCircle(item.circleId);
                  selectChannel(item.channelId);
                  setInThread(true);
                }}
              >
                <View style={[styles.avatar, { backgroundColor: item.badgeBg, borderRadius: item.kind === 'dm' ? 99 : 13 }]}>
                  <Text style={styles.avatarText}>{item.badgeText}</Text>
                </View>
                <View style={styles.flex1}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.rowTitle, { color: c.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.time ? (
                      <Text style={[styles.meta, { color: c.textMuted }]}>
                        {formatTime(item.time)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowBetween}>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: c.textSecondary, flex: 1 }]}>
                      {item.preview}
                    </Text>
                    {item.unread > 0 && (
                      <View style={[styles.badge, { backgroundColor: c.accent }]}>
                        <Text style={styles.badgeText}>{item.unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* WORLD 2: RUANG THREAD (with Horizontal Topic Pill Bar for Circles!) */}
      {world === 'ruang' && inThread && activeChannel && (
        <View style={[styles.flex1, { backgroundColor: canvasBg }]}>
          <View style={[styles.threadHeaderWrap, { backgroundColor: c.panel, borderBottomColor: c.hairline }]}>
            <View style={styles.threadHeader}>
              <TouchableOpacity onPress={() => setInThread(false)} style={styles.backBtn}>
                <Text style={{ color: c.accent, fontWeight: '600', fontSize: 14 }}>← Ruang</Text>
              </TouchableOpacity>
              <View style={styles.flex1}>
                <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
                  {threadCircle ? threadCircle.name : activeChannel.name}
                </Text>
                <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
                  {activeChannel.topic ?? `${threadCircle?.memberIds.length ?? 2} peserta`}
                </Text>
              </View>
            </View>

            {/* Horizontal Topic Pill Bar (No Discord vertical #channel list!) */}
            {threadCircle && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10, gap: 6 }}
              >
                {threadTopics.map((topic) => {
                  const selected = topic.id === activeChannelId;
                  return (
                    <TouchableOpacity
                      key={topic.id}
                      style={[
                        styles.topicPill,
                        { backgroundColor: selected ? c.capsuleActiveBg : c.input },
                      ]}
                      onPress={() => selectChannel(topic.id)}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: '600',
                          color: selected ? c.capsuleActiveText : c.textSecondary,
                        }}
                      >
                        {formatTopicLabel(topic.name)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <FlatList
            data={channelMessages}
            keyExtractor={(item) => item.message.id}
            contentContainerStyle={{ padding: 14 }}
            renderItem={({ item }) => {
              const { message, groupPosition, showDateSeparator, dateLabel, showSenderName } = item;
              const mine = message.senderId === currentUserId;
              const sender = profiles[message.senderId];
              const pin = message.hangoutPinId
                ? hangoutPins.find((p) => p.id === message.hangoutPinId)
                : null;
              const isGrouped = groupPosition === 'middle' || groupPosition === 'last';

              return (
                <View>
                  {showDateSeparator && dateLabel && (
                    <View style={styles.dateWrap}>
                      <Text style={[styles.datePill, { backgroundColor: c.glass, color: c.textSecondary }]}>
                        {dateLabel}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: mine ? c.bubbleOut : c.bubbleIn,
                        borderColor: mine ? 'transparent' : c.hairline,
                        borderWidth: mine ? 0 : 1,
                        alignSelf: mine ? 'flex-end' : 'flex-start',
                        marginTop: isGrouped ? 3 : 10,
                      },
                    ]}
                  >
                    {!mine && showSenderName && activeChannel.type !== 'dm' && sender && (
                      <Text style={[styles.senderLabel, { color: c.textSecondary }]}>
                        {sender.displayName}
                      </Text>
                    )}
                    {message.type === 'quick_snap' && message.mediaUrl && (
                      <Image
                        source={{ uri: message.mediaUrl }}
                        style={{
                          width: 196,
                          height: 248,
                          borderRadius: 12,
                          marginBottom: 6,
                          backgroundColor: '#1C1917',
                        }}
                        resizeMode="cover"
                      />
                    )}
                    <Text style={[styles.msgText, { color: mine ? c.bubbleOutText : c.textPrimary }]}>
                      {message.content}
                    </Text>
                    {pin && (
                      <View style={styles.rsvpRow}>
                        {(['going', 'otw', 'maybe'] as const).map((status) => (
                          <TouchableOpacity
                            key={status}
                            style={[
                              styles.rsvpBtn,
                              { backgroundColor: CATEGORY_COLORS[pin.category ?? 'coffee'] },
                            ]}
                            onPress={() => {
                              respondToHangout(pin.id, status);
                              if (cloudSynced && isValidUuid(pin.id)) {
                                void mobileCloudBackend
                                  .upsertHangoutRsvp(pin.id, currentUserId, status)
                                  .catch(() => undefined);
                              }
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                              {status === 'going' ? 'Ikut' : status === 'otw' ? 'OTW' : 'Nanti'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <Text
                      style={[
                        styles.bubbleTime,
                        { color: mine ? 'rgba(250,250,249,0.75)' : c.textMuted },
                      ]}
                    >
                      {formatTime(message.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.composer, { borderTopColor: c.hairline, backgroundColor: c.panel }]}>
            <TouchableOpacity
              style={[styles.composerAction, { backgroundColor: c.input }]}
              onPress={() => void handlePickQuickSnap()}
            >
              <Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 13 }}>Snap</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.composerInput, { backgroundColor: c.input, color: c.textPrimary }]}
              placeholder="Tulis pesan..."
              placeholderTextColor={c.textMuted}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: c.capsuleActiveBg }]}
              onPress={handleSend}
            >
              <Text style={{ color: c.capsuleActiveText, fontWeight: '600', fontSize: 13 }}>Kirim</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* WORLD 3: PETA (Full-Canvas Live Social Map) */}
      {world === 'peta' && (
        <View style={[styles.flex1, { backgroundColor: c.mapBg }]}>
          <View style={styles.mapTopOverlay}>
            <View style={[styles.privacyBar, { backgroundColor: c.glass, borderColor: c.hairline }]}>
              {(['exact', 'fuzzy', 'ghost'] as PrivacyMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.privacyPillBtn,
                    { backgroundColor: myPrivacy === mode ? c.capsuleActiveBg : 'transparent' },
                  ]}
                  onPress={() => {
                    setMyPrivacyMode(mode);
                    if (cloudSynced && myLocation) {
                      void mobileCloudBackend
                        .updateLocation(
                          currentUserId,
                          myLocation.point,
                          mode,
                          myLocation.areaLabel,
                          myLocation.activityEmoji,
                          myLocation.activityText
                        )
                        .catch(() => undefined);
                    }
                  }}
                >
                  <Text
                    style={{
                      color: myPrivacy === mode ? c.capsuleActiveText : c.textSecondary,
                      fontWeight: '600',
                      fontSize: 12,
                    }}
                  >
                    {mode === 'exact' ? 'Tepat' : mode === 'fuzzy' ? 'Area' : 'Mati'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.gpsBtn, { backgroundColor: c.glass, borderColor: c.hairline }]}
              onPress={() => void handleUpdateGps()}
              disabled={locatingGps}
            >
              <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 12 }}>
                {locatingGps ? '...' : 'GPS'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.mapCanvas}>
            <View style={[styles.heroMapBlob, { backgroundColor: c.mapPark, left: 20, top: 64, width: 150, height: 110 }]} />
            <View style={[styles.heroMapBlob, { backgroundColor: c.mapWater, right: 16, top: 140, width: 160, height: 64 }]} />

            {clusters.map((cluster, idx) => {
              const top = 76 + idx * 54;
              const left = 24 + (idx % 2) * 140;
              if (cluster.isCluster) {
                return (
                  <View key={cluster.id} style={[styles.mapMarker, { top, left }]}>
                    <View style={[styles.clusterBadge, { backgroundColor: c.capsuleActiveBg }]}>
                      <Text style={{ color: c.capsuleActiveText, fontWeight: '700', fontSize: 12 }}>
                        +{cluster.items.length}
                      </Text>
                    </View>
                  </View>
                );
              }
              const entry = cluster.items[0];
              return (
                <TouchableOpacity
                  key={entry.userId}
                  style={[styles.mapMarker, { top, left }]}
                  onPress={() => {
                    setSelectedMapUser(entry.userId);
                    setSheetSnap('half');
                  }}
                >
                  <View style={[styles.avatar, { backgroundColor: entry.profile.avatarColor, borderWidth: 3, borderColor: '#FFFFFF' }]}>
                    <Text style={styles.avatarText}>{entry.profile.initials}</Text>
                  </View>
                  <View style={[styles.markerTag, { backgroundColor: c.glass }]}>
                    <Text style={{ color: c.textPrimary, fontSize: 11, fontWeight: '600' }}>
                      {entry.profile.displayName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View
            style={[
              styles.mapSheet,
              {
                backgroundColor: c.glass,
                borderColor: c.hairline,
                height: sheetSnap === 'peek' ? 110 : sheetSnap === 'half' ? 185 : 270,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.grabberHit}
              onPress={() =>
                setSheetSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'expanded' : 'peek'))
              }
            >
              <View style={[styles.grabber, { backgroundColor: c.textMuted }]} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
              <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                {visibleFriends.length} teman · {visibleHangouts.length} pin
              </Text>
              {visibleFriends.map(({ userId, loc, profile, coords }) => {
                const dist =
                  myLocation && coords
                    ? `${formatDistanceLabel(distanceMeters(myLocation.point, coords))} · ~${estimateEtaMinutes(myLocation.point, coords)} mnt`
                    : loc.areaLabel;
                return (
                  <View
                    key={userId}
                    style={[
                      styles.sheetRow,
                      {
                        backgroundColor: selectedMapUserId === userId ? c.accentSoft : c.panel,
                        borderColor: c.hairline,
                      },
                    ]}
                  >
                    <Text style={{ color: c.textPrimary, fontWeight: '600', fontSize: 13 }}>
                      {profile.displayName} · {loc.areaLabel}
                    </Text>
                    <Text style={[styles.meta, { color: c.textMuted }]}>{dist}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Persistent Floating Voice Island (above Floating Capsule Dock!) */}
      {activeVoice && (
        <View style={[styles.voiceIsland, { bottom: showFloatingDock ? 88 : 68, backgroundColor: c.capsuleActiveBg }]}>
          <View style={[styles.liveDot, { backgroundColor: c.live }]} />
          <View style={styles.flex1}>
            <Text style={{ color: c.capsuleActiveText, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
              {activeVoice.name}
            </Text>
          </View>
          <TouchableOpacity style={styles.islandBtn} onPress={toggleMute}>
            <Text style={{ color: c.capsuleActiveText, fontSize: 12, fontWeight: '600' }}>
              {isMuted ? 'Buka' : 'Mute'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.islandBtn, { backgroundColor: c.danger }]}
            onPress={leaveVoiceLounge}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>Keluar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating Capsule Bottom Dock (3 Worlds + Monochrome + FAB) */}
      {showFloatingDock && (
        <View style={styles.dockWrap}>
          <View style={[styles.dockCapsule, { backgroundColor: c.glass, borderColor: c.hairline }]}>
            {(
              [
                { id: 'pulse', label: 'Pulse' },
                { id: 'ruang', label: 'Ruang' },
                { id: 'peta', label: 'Peta' },
              ] as { id: MobileWorld; label: string }[]
            ).map((item) => {
              const active = world === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.dockBtn,
                    { backgroundColor: active ? c.capsuleActiveBg : 'transparent' },
                  ]}
                  onPress={() => {
                    setWorld(item.id);
                    if (item.id === 'ruang') setInThread(false);
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: active ? '600' : '500',
                      color: active ? c.capsuleActiveText : c.textSecondary,
                    }}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.dockFab, { backgroundColor: c.capsuleActiveBg }]}
            onPress={handleFabCreate}
          >
            <Text style={{ color: c.capsuleActiveText, fontSize: 22, fontWeight: '500', lineHeight: 24 }}>+</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Circle Selector Modal */}
      <Modal visible={circlePickerOpen} transparent animationType="fade" onRequestClose={() => setCirclePickerOpen(false)}>
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setCirclePickerOpen(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: c.panel, borderColor: c.hairline }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 10 }]}>
              Pilih Circle
            </Text>
            <TouchableOpacity
              style={[
                styles.sheetRow,
                { backgroundColor: activeCircleId === null ? c.accentSoft : c.canvas, borderColor: c.hairline },
              ]}
              onPress={() => {
                selectCircle(null);
                setCirclePickerOpen(false);
              }}
            >
              <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Semua Circle</Text>
            </TouchableOpacity>
            {circles.map((ci) => (
              <TouchableOpacity
                key={ci.id}
                style={[
                  styles.sheetRow,
                  { backgroundColor: activeCircleId === ci.id ? c.accentSoft : c.canvas, borderColor: c.hairline },
                ]}
                onPress={() => {
                  selectCircle(ci.id);
                  setCirclePickerOpen(false);
                }}
              >
                <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{ci.name}</Text>
                <Text style={[styles.meta, { color: c.textMuted }]}>
                  {ci.memberIds.length} anggota · {ci.inviteCode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Profile & Settings Modal (Opened from Header Avatar) */}
      <Modal visible={profileModalOpen} animationType="slide" onRequestClose={() => setProfileModalOpen(false)}>
        <SafeAreaView style={[styles.root, { backgroundColor: c.canvas }]}>
          <View style={[styles.topBar, { borderBottomColor: c.hairline, backgroundColor: c.panel }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Profil & Pengaturan</Text>
            <TouchableOpacity onPress={() => setProfileModalOpen(false)}>
              <Text style={{ color: c.accent, fontWeight: '600', fontSize: 14 }}>Selesai</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
            <View style={[styles.bentoCard, { backgroundColor: c.panel, borderColor: c.hairline }]}>
              <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                {me?.displayName ?? 'Reza'} (@{me?.username ?? 'syahreza'})
              </Text>
              <Text style={[styles.meta, { color: c.textSecondary, marginTop: 2 }]}>
                {me?.statusEmoji} {me?.statusText}
              </Text>
            </View>

            <View style={[styles.bentoCard, { backgroundColor: c.panel, borderColor: c.hairline }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 8 }]}>
                Tema Kanvas Obrolan
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CHAT_THEMES.map((ct) => (
                  <TouchableOpacity
                    key={ct.id}
                    style={[
                      styles.filterPill,
                      { backgroundColor: chatTheme === ct.id ? c.accent : c.input },
                    ]}
                    onPress={() => setChatTheme(ct.id)}
                  >
                    <Text
                      style={{
                        color: chatTheme === ct.id ? '#FFFFFF' : c.textPrimary,
                        fontSize: 12.5,
                        fontWeight: '600',
                      }}
                    >
                      {ct.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {blockedUserIds.length > 0 && (
              <View style={[styles.bentoCard, { backgroundColor: c.panel, borderColor: c.hairline }]}>
                <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 8 }]}>
                  Pengguna Diblokir
                </Text>
                {blockedUserIds.map((uid) => (
                  <View key={uid} style={styles.rowBetween}>
                    <Text style={{ color: c.textPrimary }}>{profiles[uid]?.displayName ?? uid}</Text>
                    <TouchableOpacity onPress={() => unblockUser(uid)}>
                      <Text style={{ color: c.accent, fontWeight: '600' }}>Buka Blokir</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.dangerBtn, { borderColor: c.danger }]}
              onPress={() =>
                Alert.alert('Hapus Akun', 'Hapus akun dan data lokal secara permanen?', [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Hapus',
                    style: 'destructive',
                    onPress: () => {
                      deleteMyAccount();
                      setProfileModalOpen(false);
                    },
                  },
                ])
              }
            >
              <Text style={{ color: c.danger, fontWeight: '700' }}>Hapus Akun Permanen</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  topBar: {
    height: 54,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  circleSelectorPill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 210,
  },
  selectorDot: { width: 8, height: 8, borderRadius: 99 },
  selectorLabel: { fontSize: 13.5, fontWeight: '600' },
  topRightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topIconBtn: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMapCard: {
    height: 230,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'space-between',
  },
  heroMapBlob: { position: 'absolute', borderRadius: 48, opacity: 0.72 },
  heroMapTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLiveChip: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 99 },
  heroExpandBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heroFriendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  bentoCard: {
    borderBottomWidth: 1,
    paddingVertical: 16,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  momentCardCreate: {
    width: 116,
    height: 156,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    gap: 8,
  },
  momentPlusBadge: {
    width: 38,
    height: 38,
    borderRadius: 99,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentCard: {
    width: 116,
    height: 156,
    borderRadius: 16,
    padding: 10,
    justifyContent: 'flex-end',
  },
  momentAuthor: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  momentCaption: { color: 'rgba(255,255,255,0.88)', fontSize: 11, marginTop: 2 },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionPill: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: { padding: 14, paddingBottom: 10 },
  searchInput: {
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  filterPill: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: { width: 42, height: 42, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  avatarSm: { width: 34, height: 34, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  avatarXs: { width: 24, height: 24, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  avatarTextXs: { color: '#FFFFFF', fontWeight: '700', fontSize: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  meta: { fontSize: 11.5 },
  badge: { minWidth: 20, height: 20, borderRadius: 99, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  threadHeaderWrap: { borderBottomWidth: 1 },
  threadHeader: {
    height: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  backBtn: { paddingVertical: 6, paddingRight: 6 },
  topicPill: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateWrap: { alignItems: 'center', marginVertical: 10 },
  datePill: { fontSize: 11.5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  senderLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 2 },
  msgText: { fontSize: 14.5, lineHeight: 20 },
  bubbleTime: { fontSize: 10.5, textAlign: 'right', marginTop: 4 },
  rsvpRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  rsvpBtn: { flex: 1, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  composerAction: { height: 38, paddingHorizontal: 12, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  composerInput: { flex: 1, height: 40, borderRadius: 99, paddingHorizontal: 14, fontSize: 14 },
  sendBtn: { height: 38, paddingHorizontal: 15, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  mapTopOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  privacyBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    gap: 3,
  },
  privacyPillBtn: { height: 30, paddingHorizontal: 11, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  gpsBtn: { height: 36, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mapCanvas: { flex: 1 },
  mapMarker: { position: 'absolute', alignItems: 'center', gap: 4 },
  clusterBadge: { width: 42, height: 42, borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  markerTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  mapSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 86,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  grabberHit: { alignItems: 'center', paddingVertical: 10 },
  grabber: { width: 38, height: 4, borderRadius: 99, opacity: 0.45 },
  sheetRow: { padding: 11, borderRadius: 13, borderWidth: 1, marginBottom: 6 },
  voiceIsland: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(25, 24, 28, 0.95)',
  },
  islandBtn: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dockCapsule: {
    flex: 1,
    height: 54,
    padding: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
  },
  dockBtn: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockFab: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  dangerBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
