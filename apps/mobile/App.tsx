import React, { useState } from 'react';
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
  resolveVisibleCoordinates,
  useZonaStore,
  type PrivacyMode,
} from '@zona/shared';

type MobileScreen = 'map' | 'chat' | 'circles';

export default function App() {
  const [screen, setScreen] = useState<MobileScreen>('chat');
  const [draft, setDraft] = useState('');

  const {
    currentUserId,
    profiles,
    circles,
    channels,
    messages,
    locations,
    hangoutPins,
    voiceLounges,
    activeCircleId,
    activeChannelId,
    activeVoiceLoungeId,
    selectCircle,
    selectChannel,
    sendTextMessage,
    sendQuickSnap,
    joinVoiceLounge,
    leaveVoiceLounge,
    setMyPrivacyMode,
    createHangoutPin,
    respondToHangout,
  } = useZonaStore();

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);
  const myPrivacy: PrivacyMode = locations[currentUserId]?.privacyMode ?? 'exact';

  const visibleFriends = Object.values(locations)
    .map((loc) => ({
      loc,
      profile: profiles[loc.userId],
      coords: resolveVisibleCoordinates(loc.point, loc.privacyMode, loc.userId),
    }))
    .filter((entry) => entry.profile && entry.coords !== null);

  const handleSend = () => {
    if (!activeChannel || !draft.trim()) return;
    sendTextMessage(activeChannel.id, draft);
    setDraft('');
  };

  const handleQuickHangout = () => {
    createHangoutPin({
      circleId: activeCircleId ?? circles[0]?.id ?? 'c-kampus',
      title: 'Ngopi Spontan Sore Ini',
      placeName: 'M Bloc Space Blok M',
      startsAtLabel: 'Hari ini • 18.30 WIB',
      point: { lat: -6.2442, lng: 106.8006 },
    });
    setScreen('chat');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandText}>Z</Text>
          </View>
          <View>
            <Text style={styles.headerTitle}>
              {screen === 'map'
                ? 'Live Social Map'
                : screen === 'circles'
                  ? 'Circles & Voice Lounge'
                  : activeChannel?.name ?? 'ZONA Chat'}
            </Text>
            <Text style={styles.headerSub}>
              {screen === 'map'
                ? `${visibleFriends.length} teman aktif · Mode ${myPrivacy.toUpperCase()}`
                : 'Mode Demo Offline-First'}
            </Text>
          </View>
        </View>

        {activeVoiceLoungeId && (
          <TouchableOpacity
            style={styles.voicePill}
            onPress={leaveVoiceLounge}
          >
            <Text style={styles.voicePillText}>● Voice · Keluar</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* SCREEN 1: LIVE MAP (SNAPCHAT DNA) */}
      {screen === 'map' && (
        <ScrollView style={styles.body} contentContainerStyle={styles.pad}>
          <View style={styles.privacyRow}>
            {(['exact', 'fuzzy', 'ghost'] as PrivacyMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.privacyBtn,
                  myPrivacy === mode && styles.privacyBtnActive,
                ]}
                onPress={() => setMyPrivacyMode(mode)}
              >
                <Text
                  style={[
                    styles.privacyText,
                    myPrivacy === mode && styles.privacyTextActive,
                  ]}
                >
                  {mode === 'exact'
                    ? 'Tepat'
                    : mode === 'fuzzy'
                      ? 'Area (~400m)'
                      : 'Ghost Mode'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.mapCard}>
            <Text style={styles.sectionTitle}>Teman di Sekitar (Jakarta Selatan)</Text>
            {visibleFriends.map(({ loc, profile }) => (
              <View key={loc.userId} style={styles.friendRow}>
                <View
                  style={[styles.avatar, { backgroundColor: profile.avatarColor }]}
                >
                  <Text style={styles.avatarText}>{profile.initials}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.friendName}>
                    {profile.displayName} · {loc.activityEmoji} {loc.activityText}
                  </Text>
                  <Text style={styles.metaText}>
                    {loc.areaLabel} · Baterai {loc.batteryPct}%
                  </Text>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleQuickHangout}>
              <Text style={styles.primaryBtnText}>
                + Taruh Pin Ajak Kumpul (Auto Channel)
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Pin Kumpul Aktif</Text>
          {hangoutPins.map((pin) => (
            <TouchableOpacity
              key={pin.id}
              style={styles.pinCard}
              onPress={() => {
                selectChannel(pin.channelId);
                setScreen('chat');
              }}
            >
              <Text style={styles.pinTitle}>📍 {pin.placeName}</Text>
              <Text style={styles.metaText}>
                {pin.title} · {pin.startsAtLabel} ({pin.rsvps.length} respon)
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* SCREEN 2: FAST CHAT (WHATSAPP DNA) */}
      {screen === 'chat' && (
        <View style={styles.flex1}>
          <FlatList
            data={channelMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.pad}
            renderItem={({ item }) => {
              const mine = item.senderId === currentUserId;
              const sender = profiles[item.senderId];
              const pin = item.hangoutPinId
                ? hangoutPins.find((p) => p.id === item.hangoutPinId)
                : null;
              return (
                <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  <Text style={styles.senderName}>
                    {sender?.displayName ?? 'Anggota'}
                  </Text>
                  <Text style={styles.msgText}>{item.content}</Text>
                  {pin && (
                    <View style={styles.rsvpRow}>
                      <TouchableOpacity
                        style={styles.smallBtn}
                        onPress={() => respondToHangout(pin.id, 'going')}
                      >
                        <Text style={styles.smallBtnText}>Ikut</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.smallBtn}
                        onPress={() => respondToHangout(pin.id, 'otw')}
                      >
                        <Text style={styles.smallBtnText}>OTW</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
          />

          <View style={styles.composer}>
            <TouchableOpacity
              style={styles.snapBtn}
              onPress={() =>
                activeChannel && sendQuickSnap(activeChannel.id, 'Snap dari HP!')
              }
            >
              <Text style={styles.snapBtnText}>Snap</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Ketik pesan cepat..."
              placeholderTextColor="#687283"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
              <Text style={styles.sendBtnText}>Kirim</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* SCREEN 3: CIRCLES & VOICE LOUNGE (DISCORD LITE DNA) */}
      {screen === 'circles' && (
        <ScrollView style={styles.body} contentContainerStyle={styles.pad}>
          <View style={styles.circleChips}>
            <TouchableOpacity
              style={[styles.chip, activeCircleId === null && styles.chipActive]}
              onPress={() => selectCircle(null)}
            >
              <Text
                style={[
                  styles.chipText,
                  activeCircleId === null && styles.chipTextActive,
                ]}
              >
                DM
              </Text>
            </TouchableOpacity>
            {circles.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, activeCircleId === c.id && styles.chipActive]}
                onPress={() => selectCircle(c.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    activeCircleId === c.id && styles.chipTextActive,
                  ]}
                >
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Kanal & Obrolan</Text>
          {channels
            .filter((ch) => ch.circleId === activeCircleId)
            .map((ch) => (
              <TouchableOpacity
                key={ch.id}
                style={[
                  styles.channelRow,
                  ch.id === activeChannelId && styles.channelRowActive,
                ]}
                onPress={() => {
                  selectChannel(ch.id);
                  setScreen('chat');
                }}
              >
                <Text style={styles.channelName}>
                  {ch.type === 'hangout' ? '📍 ' : ch.type === 'dm' ? '💬 ' : '# '}
                  {ch.name}
                </Text>
                {ch.topic && <Text style={styles.metaText}>{ch.topic}</Text>}
              </TouchableOpacity>
            ))}

          <Text style={[styles.sectionTitle, { marginTop: 18 }]}>
            Voice Lounge (1-Tap Drop-In)
          </Text>
          {voiceLounges.map((vl) => {
            const joined = activeVoiceLoungeId === vl.id;
            return (
              <View key={vl.id} style={styles.voiceCard}>
                <View style={styles.flex1}>
                  <Text style={styles.friendName}>🎧 {vl.name}</Text>
                  <Text style={styles.metaText}>
                    {vl.participantIds.length} orang di dalam · {vl.topic}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.smallBtn, joined && styles.leaveBtn]}
                  onPress={() =>
                    joined ? leaveVoiceLounge() : joinVoiceLounge(vl.id)
                  }
                >
                  <Text style={styles.smallBtnText}>
                    {joined ? 'Keluar' : 'Masuk'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Bottom 3-Screen Navigation Dock */}
      <View style={styles.bottomNav}>
        {(
          [
            { id: 'map', label: 'Live Map' },
            { id: 'chat', label: 'Fast Chat' },
            { id: 'circles', label: 'Circles' },
          ] as { id: MobileScreen; label: string }[]
        ).map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.navBtn, screen === tab.id && styles.navBtnActive]}
            onPress={() => setScreen(tab.id)}
          >
            <Text
              style={[
                styles.navText,
                screen === tab.id && styles.navTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0F13' },
  flex1: { flex: 1 },
  body: { flex: 1 },
  pad: { padding: 14, gap: 10 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#12151C',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FACC15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { color: '#0D0F13', fontWeight: '800', fontSize: 17 },
  headerTitle: { color: '#F3F5F8', fontWeight: '700', fontSize: 16 },
  headerSub: { color: '#8A94A6', fontSize: 12 },
  voicePill: {
    backgroundColor: 'rgba(34,197,94,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  voicePillText: { color: '#22C55E', fontWeight: '700', fontSize: 12 },
  privacyRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  privacyBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#181C25',
    alignItems: 'center',
  },
  privacyBtnActive: { backgroundColor: '#FACC15' },
  privacyText: { color: '#9AA3B2', fontWeight: '700', fontSize: 12 },
  privacyTextActive: { color: '#0D0F13' },
  mapCard: {
    backgroundColor: '#151922',
    borderRadius: 16,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    color: '#9AA3B2',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#0D0F13', fontWeight: '800', fontSize: 12 },
  friendName: { color: '#F3F5F8', fontWeight: '700', fontSize: 14 },
  metaText: { color: '#8A94A6', fontSize: 12, marginTop: 2 },
  primaryBtn: {
    backgroundColor: '#FACC15',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#0D0F13', fontWeight: '800', fontSize: 13 },
  pinCard: {
    backgroundColor: '#181C25',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(249,115,22,0.35)',
  },
  pinTitle: { color: '#F3F5F8', fontWeight: '700', fontSize: 14 },
  bubble: {
    backgroundColor: '#1A1F2A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    maxWidth: '85%',
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#252E1B',
  },
  senderName: { color: '#FACC15', fontWeight: '700', fontSize: 12, marginBottom: 4 },
  msgText: { color: '#F3F5F8', fontSize: 14, lineHeight: 20 },
  rsvpRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  smallBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  leaveBtn: { backgroundColor: '#EF4444' },
  smallBtnText: { color: '#0D0F13', fontWeight: '800', fontSize: 12 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#12151C',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  snapBtn: {
    backgroundColor: '#202633',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  snapBtnText: { color: '#FACC15', fontWeight: '700', fontSize: 12 },
  input: {
    flex: 1,
    backgroundColor: '#181C25',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F3F5F8',
  },
  sendBtn: {
    backgroundColor: '#FACC15',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 999,
  },
  sendBtnText: { color: '#0D0F13', fontWeight: '800', fontSize: 13 },
  circleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#181C25',
  },
  chipActive: { backgroundColor: '#FACC15' },
  chipText: { color: '#9AA3B2', fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: '#0D0F13' },
  channelRow: {
    backgroundColor: '#151922',
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
  },
  channelRowActive: { borderWidth: 1, borderColor: '#FACC15' },
  channelName: { color: '#F3F5F8', fontWeight: '700', fontSize: 14 },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151922',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#090B0E',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    padding: 8,
    gap: 8,
  },
  navBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  navBtnActive: { backgroundColor: '#1C212D' },
  navText: { color: '#687283', fontWeight: '700', fontSize: 12 },
  navTextActive: { color: '#FACC15' },
});
