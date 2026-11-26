import React, { useMemo, useState } from 'react';
import {
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  clusterMapMarkers,
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  groupMessages,
  resolveVisibleCoordinates,
  useZonaStore,
  type PrivacyMode,
} from '@zona/shared';

type MobileTab = 'chat' | 'circles' | 'map' | 'profile';
type SheetSnap = 'peek' | 'half' | 'expanded';

const PALETTES = {
  light: {
    rail: '#F2F3F5',
    sidebar: '#F8F9FA',
    canvas: '#FFFFFF',
    input: '#F2F3F5',
    bubbleIn: '#F2F3F5',
    bubbleOut: '#DCFCE7',
    hairline: 'rgba(15, 23, 42, 0.08)',
    textPrimary: '#111827',
    textSecondary: '#4B5563',
    textMuted: '#86909C',
    accent: '#10B981',
    accentInk: '#FFFFFF',
    accentSoft: 'rgba(16, 185, 129, 0.12)',
    danger: '#EF4444',
    mapBg: '#EAEFF5',
    glass: 'rgba(255, 255, 255, 0.92)',
  },
  dark: {
    rail: '#1E1F22',
    sidebar: '#2B2D31',
    canvas: '#313338',
    input: '#383A40',
    bubbleIn: '#2B2D31',
    bubbleOut: '#1F3A33',
    hairline: 'rgba(255, 255, 255, 0.06)',
    textPrimary: '#F2F3F5',
    textSecondary: '#B5BAC1',
    textMuted: '#72767D',
    accent: '#10B981',
    accentInk: '#FFFFFF',
    accentSoft: 'rgba(16, 185, 129, 0.18)',
    danger: '#F87171',
    mapBg: '#23262D',
    glass: 'rgba(30, 31, 34, 0.9)',
  },
};

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

  const c = PALETTES[theme];

  const {
    currentUserId,
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
    setSelectedMapUser,
    createHangoutPin,
    respondToHangout,
    unblockUser,
    deleteMyAccount,
  } = useZonaStore();

  const me = profiles[currentUserId];
  const activeChannel = channels.find((ch) => ch.id === activeChannelId);
  const activeVoice = voiceLounges.find((v) => v.id === activeVoiceLoungeId);
  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';

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

  const clusters = useMemo(() => clusterMapMarkers(visibleFriends, 260), [visibleFriends]);

  const handleSend = () => {
    if (!activeChannel || !draft.trim()) return;
    sendTextMessage(activeChannel.id, draft);
    setDraft('');
  };

  const handleQuickHangout = () => {
    createHangoutPin({
      circleId: activeCircleId ?? circles[0]?.id ?? 'c-kampus',
      title: 'Ngopi Sore',
      placeName: 'M Bloc Space',
      startsAtLabel: 'Hari ini · 18.30 WIB',
      point: { lat: -6.2442, lng: 106.8006 },
    });
    setTab('chat');
    setInThread(true);
  };

  const cycleSheet = () => {
    setSheetSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'expanded' : 'peek'));
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.canvas }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

      {/* TAB 1: CHAT (Default — WhatsApp UX: List -> Thread) */}
      {tab === 'chat' && !inThread && (
        <View style={[styles.flex1, { backgroundColor: c.canvas }]}>
          <View style={[styles.header, { borderBottomColor: c.hairline }]}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Chat</Text>
          </View>

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
                    { backgroundColor: dmFilter === f ? c.accentSoft : c.input },
                  ]}
                  onPress={() => setDmFilter(f)}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: dmFilter === f ? '600' : '500',
                      color: dmFilter === f ? c.accent : c.textSecondary,
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
              const lastMsg = [...messages]
                .reverse()
                .find((m) => m.channelId === ch.id);

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
                      { backgroundColor: partner?.avatarColor ?? c.accent },
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
                        <View style={[styles.badge, { backgroundColor: c.accent }]}>
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

      {/* CHAT THREAD VIEW */}
      {tab === 'chat' && inThread && activeChannel && (
        <View style={[styles.flex1, { backgroundColor: c.canvas }]}>
          <View style={[styles.header, { borderBottomColor: c.hairline }]}>
            <TouchableOpacity onPress={() => setInThread(false)} style={styles.backBtn}>
              <Text style={{ color: c.accent, fontWeight: '600', fontSize: 14 }}>Kembali</Text>
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
                          { backgroundColor: c.input, color: c.textSecondary },
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
                        backgroundColor: mine ? c.bubbleOut : c.bubbleIn,
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
                    <Text style={[styles.msgText, { color: c.textPrimary }]}>
                      {message.content}
                    </Text>
                    {pin && (
                      <View style={styles.rsvpRow}>
                        {(['going', 'otw', 'maybe'] as const).map((status) => (
                          <TouchableOpacity
                            key={status}
                            style={[styles.rsvpBtn, { backgroundColor: c.accent }]}
                            onPress={() => respondToHangout(pin.id, status)}
                          >
                            <Text style={{ color: c.accentInk, fontSize: 12, fontWeight: '600' }}>
                              {status === 'going' ? 'Ikut' : status === 'otw' ? 'OTW' : 'Nanti'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <Text style={[styles.bubbleTime, { color: c.textMuted }]}>
                      {formatTime(message.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />

          <View style={[styles.composer, { borderTopColor: c.hairline, backgroundColor: c.canvas }]}>
            <TouchableOpacity
              style={[styles.composerAction, { backgroundColor: c.input }]}
              onPress={() => sendQuickSnap(activeChannel.id, 'Snap dari ponsel')}
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
              style={[styles.sendBtn, { backgroundColor: c.accent }]}
              onPress={handleSend}
            >
              <Text style={{ color: c.accentInk, fontWeight: '600', fontSize: 13 }}>Kirim</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* TAB 2: CIRCLES & VOICE LOUNGE */}
      {tab === 'circles' && (
        <View style={[styles.flex1, { backgroundColor: c.sidebar }]}>
          <View style={[styles.header, { borderBottomColor: c.hairline, backgroundColor: c.canvas }]}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Circles</Text>
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
                      { backgroundColor: active ? c.accent : c.canvas },
                    ]}
                    onPress={() => selectCircle(circle.id)}
                  >
                    <Text
                      style={{
                        color: active ? c.accentInk : c.textPrimary,
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
                  style={[styles.channelItem, { backgroundColor: c.canvas, borderColor: c.hairline }]}
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
                    style={[styles.voiceRow, { backgroundColor: c.canvas, borderColor: c.hairline }]}
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
                        { backgroundColor: joined ? c.danger : c.accent },
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

      {/* TAB 3: FULL-BLEED MAP + FLOATING CONTROLS + DRAGGABLE BOTTOM SHEET */}
      {tab === 'map' && (
        <View style={[styles.flex1, { backgroundColor: c.mapBg }]}>
          {/* Floating Top Privacy Pill */}
          <View style={styles.mapTopOverlay}>
            <View style={[styles.privacyBar, { backgroundColor: c.glass, borderColor: c.hairline }]}>
              {(['exact', 'fuzzy', 'ghost'] as PrivacyMode[]).map((mode) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.privacyPillBtn,
                    myPrivacy === mode && { backgroundColor: c.accent },
                  ]}
                  onPress={() => setMyPrivacyMode(mode)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: myPrivacy === mode ? c.accentInk : c.textSecondary,
                    }}
                  >
                    {mode === 'exact' ? 'Tepat' : mode === 'fuzzy' ? 'Area' : 'Ghost'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Clean Circular Avatar Markers on Full-Bleed Canvas */}
          <View style={styles.mapStage}>
            {clusters.map((cluster, idx) => {
              const first = cluster.items[0];
              return (
                <TouchableOpacity
                  key={cluster.id}
                  style={[
                    styles.mapPinPos,
                    {
                      left: `${20 + ((idx * 27) % 58)}%`,
                      top: `${24 + ((idx * 19) % 34)}%`,
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

          {/* Floating Add Hangout Pin FAB */}
          <TouchableOpacity
            style={[styles.mapFab, { backgroundColor: c.accent }]}
            onPress={handleQuickHangout}
          >
            <Text style={{ color: c.accentInk, fontSize: 22, fontWeight: '600' }}>+</Text>
          </TouchableOpacity>

          {/* 3-State Bottom Sheet (Peek / Half / Expanded) */}
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
                      backgroundColor: c.canvas,
                      borderColor: selectedMapUserId === userId ? c.accent : c.hairline,
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

      {/* TAB 4: PROFIL & PENGATURAN */}
      {tab === 'profile' && me && (
        <ScrollView
          style={[styles.flex1, { backgroundColor: c.canvas }]}
          contentContainerStyle={{ padding: 16, gap: 16 }}
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

          <TouchableOpacity
            style={[styles.settingRow, { borderColor: c.hairline, backgroundColor: c.sidebar }]}
            onPress={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            <Text style={[styles.rowTitle, { color: c.textPrimary }]}>Tema Tampilan</Text>
            <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>
              {theme === 'dark' ? 'Mode Gelap' : 'Mode Terang'}
            </Text>
          </TouchableOpacity>

          <View style={[styles.settingRow, { borderColor: c.hairline, backgroundColor: c.sidebar }]}>
            <Text style={[styles.rowTitle, { color: c.textPrimary }]}>
              Pengguna Diblokir ({blockedUserIds.length})
            </Text>
            {blockedUserIds.length > 0 && (
              <TouchableOpacity onPress={() => unblockUser(blockedUserIds[0])}>
                <Text style={{ color: c.accent, fontSize: 13 }}>Buka</Text>
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
        <View style={[styles.floatingVoicePill, { backgroundColor: c.accent }]}>
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

      {/* Native 4-Tab Bottom Bar (Chat, Circles, Map, Profil) */}
      <View
        style={[
          styles.bottomBar,
          { backgroundColor: c.canvas, borderTopColor: c.hairline },
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
                  color: active ? c.accent : c.textMuted,
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
  headerTitle: { fontSize: 17, fontWeight: '600' },
  backBtn: { paddingRight: 6, paddingVertical: 6 },
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
    width: 34,
    height: 34,
    borderRadius: 17,
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
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
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
  mapPinPos: { position: 'absolute', alignItems: 'center' },
  mapAvatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2.5,
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
