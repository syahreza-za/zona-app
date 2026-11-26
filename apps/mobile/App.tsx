import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
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

type MobileTab = 'chat' | 'circles' | 'map' | 'profile';
type SheetSnap = 'peek' | 'half' | 'expanded';

const STORAGE_KEY = '@zona/workspace_v1';

const mobileCloudBackend = createZonaCloudBackend({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});

const PALETTES = {
  light: {
    rail: '#EFEEE9',
    sidebar: '#F8F7F4',
    canvasByTheme: {
      clean: '#EEF3F0',
      'warm-sand': '#F4F1EA',
      'ocean-mist': '#ECF4F8',
      'midnight-forest': '#E7F1EC',
    } as Record<ChatWallpaperTheme, string>,
    elevated: '#FFFFFF',
    input: '#ECEAE3',
    bubbleIn: '#FFFFFF',
    bubbleOut: '#10B981',
    bubbleOutText: '#FFFFFF',
    hairline: 'rgba(15, 23, 42, 0.08)',
    textPrimary: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#7C8594',
    danger: '#EF4444',
    mapBg: '#F3EFE6',
    mapPark: '#CBE8C8',
    mapWater: '#A8D5F2',
    glass: 'rgba(255, 255, 255, 0.92)',
  },
  dark: {
    rail: '#0F1117',
    sidebar: '#161922',
    canvasByTheme: {
      clean: '#1B1F2A',
      'warm-sand': '#201D1A',
      'ocean-mist': '#16202C',
      'midnight-forest': '#131F1C',
    } as Record<ChatWallpaperTheme, string>,
    elevated: '#232836',
    input: '#232836',
    bubbleIn: '#232836',
    bubbleOut: '#134E4A',
    bubbleOutText: '#F3F6F8',
    hairline: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#F3F5F8',
    textSecondary: '#B7BEC9',
    textMuted: '#7C8492',
    danger: '#F87171',
    mapBg: '#121826',
    mapPark: '#172B24',
    mapWater: '#0D1626',
    glass: 'rgba(22, 25, 34, 0.92)',
  },
};

const CATEGORY_COLORS: Record<HangoutCategory, string> = {
  coffee: '#D97706',
  food: '#EA580C',
  gaming: '#3B82F6',
  sport: '#10B981',
};

const CHAT_THEMES: Array<{ id: ChatWallpaperTheme; label: string }> = [
  { id: 'clean', label: 'Default Clean' },
  { id: 'warm-sand', label: 'Warm Sand' },
  { id: 'ocean-mist', label: 'Ocean Mist' },
  { id: 'midnight-forest', label: 'Midnight Forest' },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [tab, setTab] = useState<MobileTab>('chat');
  const [inThread, setInThread] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [dmFilter, setDmFilter] = useState<'all' | 'unread'>('all');
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

  // 1. Offline Persistence (AsyncStorage) — hydrate on launch & persist changes
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
  const activeCircle = circles.find((ci) => ci.id === (activeCircleId ?? circles[0]?.id));
  const activeAccent = activeCircle?.accentColor ?? '#10B981';
  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';
  const canvasBg = c.canvasByTheme[chatTheme];

  const activeSnapStories = useMemo(() => {
    const seen = new Set<string>();
    return messages
      .filter((m) => m.type === 'quick_snap' && !m.isDeleted && !blockedUserIds.includes(m.senderId))
      .filter((m) => {
        if (seen.has(m.senderId)) return false;
        seen.add(m.senderId);
        return true;
      });
  }, [messages, blockedUserIds]);

  const dmChannels = useMemo(() => {
    const q = dmSearch.trim().toLowerCase();
    return channels
      .filter((ch) => ch.circleId === null && !ch.isArchived)
      .filter((ch) => (dmFilter === 'unread' ? ch.unreadCount > 0 : true))
      .filter((ch) => (!q ? true : ch.name.toLowerCase().includes(q)));
  }, [channels, dmSearch, dmFilter]);

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
        .map((loc) => ({
          userId: loc.userId,
          point: resolveVisibleCoordinates(loc.point, loc.privacyMode, loc.userId) ?? loc.point,
          loc,
          profile: profiles[loc.userId],
          coords: resolveVisibleCoordinates(loc.point, loc.privacyMode, loc.userId),
        }))
        .filter((entry) => entry.profile && entry.coords !== null),
    [locations, blockedUserIds, profiles]
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
    if (!activeChannel) return;
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
      const snapMsg = sendQuickSnap(activeChannel.id, 'Quick Snap dari ponsel', false, dataUrl);

      if (cloudSynced && isValidUuid(activeChannel.id)) {
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
      sendQuickSnap(activeChannel.id, 'Snap dari ponsel');
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
    setTab('chat');
    setInThread(true);
  };

  const cycleSheet = () => {
    setSheetSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'expanded' : 'peek'));
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.sidebar }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* TAB 1: CHAT (Default — Quick Snap Stories Strip + WhatsApp DM List) */}
      {tab === 'chat' && !inThread && (
        <View style={[styles.flex1, { backgroundColor: c.sidebar }]}>
          <View style={[styles.header, { borderBottomColor: c.hairline, backgroundColor: c.sidebar }]}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Pesan</Text>
          </View>

          {activeSnapStories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ maxHeight: 84, borderBottomWidth: 1, borderBottomColor: c.hairline }}
              contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 10, gap: 12 }}
            >
              {activeSnapStories.map((snap) => {
                const author = profiles[snap.senderId];
                if (!author) return null;
                return (
                  <TouchableOpacity
                    key={snap.id}
                    style={{ alignItems: 'center', gap: 4 }}
                    onPress={() => {
                      selectChannel(snap.channelId);
                      setInThread(true);
                    }}
                  >
                    <View style={[styles.storyRing, { borderColor: activeAccent }]}>
                      <View style={[styles.avatarSm, { backgroundColor: author.avatarColor }]}>
                        <Text style={styles.avatarText}>{author.initials}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: c.textSecondary, fontWeight: '500' }}>
                      {author.displayName}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.searchWrap}>
            <TextInput
              style={[styles.searchInput, { backgroundColor: c.input, color: c.textPrimary }]}
              placeholder="Cari obrolan"
              placeholderTextColor={c.textMuted}
              value={dmSearch}
              onChangeText={setDmSearch}
            />
            <View style={styles.filterRow}>
              {(['all', 'unread'] as const).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[
                    styles.filterPill,
                    { backgroundColor: dmFilter === f ? `${activeAccent}22` : c.input },
                  ]}
                  onPress={() => setDmFilter(f)}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: dmFilter === f ? '600' : '500',
                      color: dmFilter === f ? activeAccent : c.textSecondary,
                    }}
                  >
                    {f === 'all' ? 'Semua' : 'Belum Dibaca'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <ScrollView style={styles.flex1} contentContainerStyle={{ paddingHorizontal: 12 }}>
            {dmChannels.map((ch) => {
              const partnerId = ch.participantIds?.find((id) => id !== currentUserId);
              const partner = partnerId ? profiles[partnerId] : null;
              const lastMsg = [...messages].reverse().find((m) => m.channelId === ch.id);

              return (
                <TouchableOpacity
                  key={ch.id}
                  style={[styles.listRow, { borderBottomColor: c.hairline }]}
                  onPress={() => {
                    selectChannel(ch.id);
                    setInThread(true);
                  }}
                >
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: partner?.avatarColor ?? activeAccent },
                    ]}
                  >
                    <Text style={styles.avatarText}>{partner?.initials ?? 'ZN'}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                        {ch.name}
                      </Text>
                      {lastMsg && (
                        <Text style={[styles.meta, { color: c.textMuted }]}>
                          {formatTime(lastMsg.createdAt)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.rowBetween}>
                      <Text
                        numberOfLines={1}
                        style={[styles.rowSub, { color: c.textSecondary, flex: 1 }]}
                      >
                        {lastMsg?.content ?? partner?.statusText ?? ''}
                      </Text>
                      {ch.unreadCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: activeAccent }]}>
                          <Text style={styles.badgeText}>{ch.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* CHAT THREAD VIEW (Warm Textured Surface + Adaptive Circle Accent Bubbles) */}
      {tab === 'chat' && inThread && activeChannel && (
        <View style={[styles.flex1, { backgroundColor: canvasBg }]}>
          <View style={[styles.header, { borderBottomColor: c.hairline, backgroundColor: c.glass }]}>
            <TouchableOpacity onPress={() => setInThread(false)} style={styles.backBtn}>
              <Text style={{ color: activeAccent, fontWeight: '600', fontSize: 14 }}>Kembali</Text>
            </TouchableOpacity>
            <View style={styles.flex1}>
              <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
                {activeChannel.name}
              </Text>
              {activeChannel.topic && (
                <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
                  {activeChannel.topic}
                </Text>
              )}
            </View>
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
                      <Text
                        style={[
                          styles.datePill,
                          { backgroundColor: c.glass, color: c.textSecondary },
                        ]}
                      >
                        {dateLabel}
                      </Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: mine
                          ? theme === 'light'
                            ? activeAccent
                            : c.bubbleOut
                          : c.bubbleIn,
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
                          backgroundColor: '#111827',
                        }}
                        resizeMode="cover"
                      />
                    )}
                    <Text
                      style={[
                        styles.msgText,
                        { color: mine ? c.bubbleOutText : c.textPrimary },
                      ]}
                    >
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
                        { color: mine ? 'rgba(255,255,255,0.78)' : c.textMuted },
                      ]}
                    >
                      {formatTime(message.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.composer, { borderTopColor: c.hairline, backgroundColor: c.glass }]}>
            <TouchableOpacity
              style={[styles.composerAction, { backgroundColor: c.input }]}
              onPress={handlePickQuickSnap}
            >
              <Text style={{ color: c.textSecondary, fontWeight: '600', fontSize: 13 }}>Snap</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.composerInput, { backgroundColor: c.input, color: c.textPrimary }]}
              placeholder="Tulis pesan"
              placeholderTextColor={c.textMuted}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: activeAccent }]}
              onPress={handleSend}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }}>Kirim</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TAB 2: CIRCLES WITH COVER BANNER & VOICE LOUNGE */}
      {tab === 'circles' && (
        <View style={[styles.flex1, { backgroundColor: c.sidebar }]}>
          <View style={[styles.circleBanner, { backgroundColor: activeAccent }]}>
            <Text style={styles.circleBannerTitle}>{activeCircle?.name ?? 'Circles'}</Text>
            <Text style={styles.circleBannerSub}>
              {activeCircle?.memberIds.length ?? 0} anggota · {activeCircle?.inviteCode}
            </Text>
          </View>

          <ScrollView style={styles.flex1} contentContainerStyle={{ padding: 14, gap: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {circles.map((circle) => {
                const active = (activeCircleId ?? circles[0]?.id) === circle.id;
                return (
                  <TouchableOpacity
                    key={circle.id}
                    style={[
                      styles.filterPill,
                      { backgroundColor: active ? circle.accentColor : c.elevated },
                    ]}
                    onPress={() => selectCircle(circle.id)}
                  >
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : c.textPrimary,
                        fontWeight: '600',
                        fontSize: 13,
                      }}
                    >
                      {circle.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>KANAL TEKS</Text>
            {channels
              .filter((ch) => ch.circleId === (activeCircleId ?? circles[0]?.id))
              .map((ch) => (
                <TouchableOpacity
                  key={ch.id}
                  style={[styles.channelItem, { backgroundColor: c.elevated, borderColor: c.hairline }]}
                  onPress={() => {
                    selectChannel(ch.id);
                    setTab('chat');
                    setInThread(true);
                  }}
                >
                  <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                    {ch.type === 'hangout' ? 'Pin · ' : '# '}
                    {ch.name}
                  </Text>
                  {ch.topic && (
                    <Text style={[styles.meta, { color: c.textMuted, marginTop: 2 }]}>
                      {ch.topic}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}

            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 4 }]}>
              VOICE LOUNGE
            </Text>
            {voiceLounges
              .filter((vl) => vl.circleId === (activeCircleId ?? circles[0]?.id))
              .map((vl) => {
                const joined = activeVoiceLoungeId === vl.id;
                return (
                  <View
                    key={vl.id}
                    style={[styles.voiceRow, { backgroundColor: c.elevated, borderColor: c.hairline }]}
                  >
                    <View style={styles.flex1}>
                      <Text style={[styles.rowTitle, { color: c.textPrimary }]}>{vl.name}</Text>
                      <Text style={[styles.meta, { color: c.textMuted }]}>
                        {vl.participantIds.length} di ruang suara · {vl.topic}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.rsvpBtn,
                        { backgroundColor: joined ? c.danger : activeAccent },
                      ]}
                      onPress={() =>
                        joined ? leaveVoiceLounge() : joinVoiceLounge(vl.id)
                      }
                    >
                      <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12.5 }}>
                        {joined ? 'Keluar' : 'Masuk'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
          </ScrollView>
        </View>
      )}

      {/* TAB 3: FULL-BLEED COLORFUL MAP + GATHERING HALO + 3-STATE BOTTOM SHEET */}
      {tab === 'map' && (
        <View style={[styles.flex1, { backgroundColor: c.mapBg }]}>
          <View style={styles.mapTopOverlay}>
            <View style={[styles.privacyBar, { backgroundColor: c.glass, borderColor: c.hairline }]}>
              {(['exact', 'fuzzy', 'ghost'] as PrivacyMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.privacyPillBtn,
                    myPrivacy === mode && { backgroundColor: activeAccent },
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
                      fontSize: 12,
                      fontWeight: '600',
                      color: myPrivacy === mode ? '#FFFFFF' : c.textSecondary,
                    }}
                  >
                    {mode === 'exact' ? 'Tepat' : mode === 'fuzzy' ? 'Area' : 'Ghost'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.mapStage}>
            {/* Warm Gathering Halo visual */}
            <View style={styles.mobileGatheringHalo} />

            {clusters.map((cluster, idx) => {
              const first = cluster.items[0];
              return (
                <TouchableOpacity
                  key={cluster.id}
                  style={[
                    styles.mapPinPos,
                    {
                      left: `${18 + ((idx * 26) % 58)}%`,
                      top: `${24 + ((idx * 18) % 34)}%`,
                    },
                  ]}
                  onPress={() => {
                    setSelectedMapUser(first.userId);
                    setSheetSnap('half');
                  }}
                >
                  <View
                    style={[
                      styles.mapAvatarRing,
                      { backgroundColor: first.profile.avatarColor },
                    ]}
                  >
                    <Text style={styles.avatarText}>
                      {cluster.isCluster ? `+${cluster.items.length}` : first.profile.initials}
                    </Text>
                  </View>
                  <View style={[styles.mapTag, { backgroundColor: c.glass }]}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: c.textPrimary }}>
                      {first.profile.displayName}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.mapFab,
              {
                bottom: 204,
                backgroundColor: c.glass,
                borderWidth: 1,
                borderColor: c.hairline,
              },
            ]}
            onPress={handleUpdateGps}
            disabled={locatingGps}
          >
            <Text style={{ color: c.textPrimary, fontSize: 11, fontWeight: '700' }}>
              {locatingGps ? '...' : 'GPS'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mapFab, { backgroundColor: activeAccent }]}
            onPress={handleQuickHangout}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '600' }}>+</Text>
          </TouchableOpacity>

          <View
            style={[
              styles.bottomSheet,
              {
                backgroundColor: c.glass,
                borderColor: c.hairline,
                height: sheetSnap === 'peek' ? 116 : sheetSnap === 'half' ? 248 : 390,
              },
            ]}
          >
            <TouchableOpacity style={styles.grabberHit} onPress={cycleSheet}>
              <View style={[styles.grabberBar, { backgroundColor: c.textMuted }]} />
            </TouchableOpacity>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
              <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                {visibleFriends.length} teman aktif · {hangoutPins.length} pin kumpul
              </Text>
              {visibleFriends.map(({ userId, loc, profile, coords }) => (
                <View
                  key={userId}
                  style={[
                    styles.sheetCard,
                    {
                      backgroundColor: c.elevated,
                      borderColor: selectedMapUserId === userId ? activeAccent : c.hairline,
                    },
                  ]}
                >
                  <View style={[styles.avatarSm, { backgroundColor: profile.avatarColor }]}>
                    <Text style={styles.avatarText}>{profile.initials}</Text>
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
                      {profile.displayName}
                    </Text>
                    <Text style={[styles.meta, { color: c.textMuted }]}>
                      {loc.areaLabel}
                      {myLocation && coords && loc.privacyMode === 'exact'
                        ? ` · ${formatDistanceLabel(distanceMeters(myLocation.point, coords))} · ~${estimateEtaMinutes(myLocation.point, coords)} mnt`
                        : ' · Area perkiraan'}
                    </Text>
                  </View>
                  <Text style={[styles.meta, { color: c.textMuted }]}>{loc.batteryPct}%</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* TAB 4: PROFIL & 4 TEMA CHAT */}
      {tab === 'profile' && me && (
        <ScrollView
          style={[styles.flex1, { backgroundColor: c.sidebar }]}
          contentContainerStyle={{ padding: 16, gap: 14 }}
        >
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Profil</Text>
          <View style={styles.profileRow}>
            <View style={[styles.avatarLg, { backgroundColor: me.avatarColor }]}>
              <Text style={[styles.avatarText, { fontSize: 18 }]}>{me.initials}</Text>
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.rowTitle, { color: c.textPrimary, fontSize: 16 }]}>
                {me.displayName}
              </Text>
              <Text style={[styles.meta, { color: c.textMuted }]}>
                @{me.username} · {me.statusText}
              </Text>
            </View>
          </View>

          <View style={[styles.settingRow, { borderColor: c.hairline, backgroundColor: c.elevated }]}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]}>Sinkronisasi Cloud</Text>
            <Text style={{ color: cloudSynced ? activeAccent : c.textMuted, fontWeight: '600', fontSize: 12.5 }}>
              {cloudSynced
                ? 'Supabase Realtime Aktif'
                : mobileCloudBackend.isConfigured()
                  ? 'Siap Login Cloud'
                  : 'Mode Lokal (Offline)'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.settingRow, { borderColor: c.hairline, backgroundColor: c.elevated }]}
            onPress={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            <Text style={[styles.rowTitle, { color: c.textPrimary }]}>Mode Tampilan</Text>
            <Text style={{ color: activeAccent, fontWeight: '600', fontSize: 13 }}>
              {theme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>TEMA WALLPAPER CHAT</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CHAT_THEMES.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: chatTheme === item.id ? activeAccent : c.elevated,
                  },
                ]}
                onPress={() => setChatTheme(item.id)}
              >
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '600',
                    color: chatTheme === item.id ? '#FFFFFF' : c.textPrimary,
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.settingRow, { borderColor: c.hairline, backgroundColor: c.elevated }]}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
              Pengguna Diblokir ({blockedUserIds.length})
            </Text>
            {blockedUserIds.length > 0 && (
              <TouchableOpacity onPress={() => unblockUser(blockedUserIds[0])}>
                <Text style={{ color: activeAccent, fontSize: 13 }}>Buka</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.dangerBtn, { borderColor: c.danger }]}
            onPress={deleteMyAccount}
          >
            <Text style={{ color: c.danger, fontWeight: '600', fontSize: 14 }}>
              Hapus Akun Permanen
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Floating Compact Voice Pill above Bottom Bar */}
      {activeVoice && (
        <View style={[styles.floatingVoicePill, { backgroundColor: activeAccent }]}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
            Suara aktif · {activeVoice.name}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity onPress={toggleMute}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 12.5 }}>
                {isMuted ? 'Buka Mic' : 'Mute'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={leaveVoiceLounge}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12.5 }}>Keluar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Native 4-Tab Bottom Bar */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: c.elevated, borderTopColor: c.hairline },
        ]}
      >
        {(
          [
            { id: 'chat', label: 'Chat' },
            { id: 'circles', label: 'Circles' },
            { id: 'map', label: 'Map' },
            { id: 'profile', label: 'Profil' },
          ] as { id: MobileTab; label: string }[]
        ).map((item) => {
          const active = tab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={styles.tabBtn}
              onPress={() => {
                setTab(item.id);
                if (item.id === 'chat') setInThread(false);
              }}
            >
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: active ? '600' : '500',
                  color: active ? activeAccent : c.textMuted,
                }}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex1: { flex: 1 },
  header: {
    height: 54,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  backBtn: { paddingRight: 6, paddingVertical: 6 },
  storyRing: {
    padding: 2.5,
    borderRadius: 99,
    borderWidth: 2,
  },
  searchWrap: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, gap: 8 },
  searchInput: { height: 38, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 999 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSub: { fontSize: 13.5, marginTop: 2 },
  meta: { fontSize: 11.5 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSm: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLg: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  dateWrap: { alignItems: 'center', marginVertical: 10 },
  datePill: { fontSize: 11.5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  bubble: { maxWidth: '82%', borderRadius: 17, paddingHorizontal: 12, paddingVertical: 8 },
  senderLabel: { fontSize: 11.5, fontWeight: '600', marginBottom: 2 },
  msgText: { fontSize: 14.5, lineHeight: 21 },
  bubbleTime: { fontSize: 10.5, alignSelf: 'flex-end', marginTop: 3 },
  rsvpRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  rsvpBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
  },
  composerAction: { paddingHorizontal: 12, height: 38, borderRadius: 19, justifyContent: 'center' },
  composerInput: { flex: 1, height: 38, borderRadius: 19, paddingHorizontal: 14, fontSize: 14.5 },
  sendBtn: { paddingHorizontal: 15, height: 38, borderRadius: 19, justifyContent: 'center' },
  circleBanner: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 14 },
  circleBannerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  circleBannerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 2 },
  sectionLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.4 },
  channelItem: { padding: 12, borderRadius: 12, borderWidth: 1 },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  mapTopOverlay: { position: 'absolute', top: 14, left: 14, right: 14, zIndex: 10, alignItems: 'flex-end' },
  privacyBar: { flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: 1 },
  privacyPillBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  mapStage: { flex: 1, position: 'relative' },
  mobileGatheringHalo: {
    position: 'absolute',
    left: '50%',
    top: '44%',
    width: 110,
    height: 110,
    marginLeft: -55,
    marginTop: -55,
    borderRadius: 55,
    backgroundColor: 'rgba(245, 158, 11, 0.24)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.45)',
  },
  mapPinPos: { position: 'absolute', alignItems: 'center' },
  mapAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTag: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  mapFab: {
    position: 'absolute',
    right: 16,
    bottom: 266,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  bottomSheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 11,
  },
  grabberHit: { alignItems: 'center', paddingVertical: 10 },
  grabberBar: { width: 38, height: 4, borderRadius: 99, opacity: 0.4 },
  sheetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  dangerBtn: {
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  floatingVoicePill: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bottomBar: {
    height: 56,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
});
