import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Camera,
  CheckCheck,
  Clock,
  ExternalLink,
  Hash,
  MapPin,
  Mic,
  Pause,
  Play,
  Reply,
  Search,
  Send,
  Square,
  X,
} from 'lucide-react';
import { useZonaStore, type Message, type RsvpStatus } from '@zona/shared';
import { VoiceNoteRecorder } from '../services/mediaTools';
import { buildDirectionsUrl } from '../services/geocoder';
import { QuickSnapModal } from './QuickSnapModal';

interface ChatPanelProps {
  onOpenHangoutModal: () => void;
  onFocusMapPin?: (pinId: string) => void;
  onNotify: (msg: string) => void;
}

const QUICK_EMOJIS = ['🔥', '👍', '😂', '☕', '🎧'];

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatPanel({
  onOpenHangoutModal,
  onFocusMapPin,
  onNotify,
}: ChatPanelProps) {
  const {
    currentUserId,
    profiles,
    channels,
    messages,
    hangoutPins,
    blockedUserIds,
    typingUsersByChannel,
    activeChannelId,
    replyToMessageId,
    searchQuery,
    sendTextMessage,
    sendVoiceNote,
    sendQuickSnap,
    toggleReaction,
    setReplyToMessage,
    setSearchQuery,
    markSnapViewed,
    respondToHangout,
    blockUser,
  } = useZonaStore();

  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [liveMicLevel, setLiveMicLevel] = useState(8);
  const [realMicActive, setRealMicActive] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [viewingSnap, setViewingSnap] = useState<Message | null>(null);
  const [playingVnId, setPlayingVnId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<VoiceNoteRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const rawMessages = messages.filter(
    (m) => m.channelId === activeChannelId && !blockedUserIds.includes(m.senderId)
  );
  const channelMessages = searchQuery.trim()
    ? rawMessages.filter((m) =>
        `${m.content} ${m.snapCaption ?? ''}`
          .toLowerCase()
          .includes(searchQuery.trim().toLowerCase())
      )
    : rawMessages;

  const replyMessage = replyToMessageId
    ? rawMessages.find((m) => m.id === replyToMessageId)
    : null;
  const typingUsers = typingUsersByChannel[activeChannelId] ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [channelMessages.length, activeChannelId]);

  useEffect(() => {
    if (recordingSec === null) return;
    const timer = window.setInterval(() => {
      setRecordingSec((prev) => (prev === null ? null : prev + 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recordingSec !== null]);

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      audioPlayerRef.current?.pause();
    };
  }, []);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !draft.trim()) return;
    sendTextMessage(activeChannel.id, draft);
    setDraft('');
  };

  const handleToggleVoiceNote = async () => {
    if (!activeChannel) return;

    if (recordingSec === null) {
      const recorder = new VoiceNoteRecorder();
      recorderRef.current = recorder;
      try {
        await recorder.start((lvl) => setLiveMicLevel(lvl));
        setRealMicActive(true);
        setRecordingSec(1);
      } catch {
        setRealMicActive(false);
        setRecordingSec(1);
        onNotify('Izin mikrofon tidak tersedia — beralih ke simulasi Voice Note.');
      }
      return;
    }

    if (realMicActive && recorderRef.current) {
      try {
        const recorded = await recorderRef.current.stop();
        sendVoiceNote(
          activeChannel.id,
          recorded.durationSec,
          recorded.dataUrl,
          recorded.waveformPeaks
        );
        onNotify(`Voice Note asli (${recorded.durationSec}s) terkirim!`);
      } catch {
        sendVoiceNote(activeChannel.id, recordingSec);
      }
    } else {
      sendVoiceNote(activeChannel.id, recordingSec);
    }

    recorderRef.current = null;
    setRealMicActive(false);
    setRecordingSec(null);
  };

  const handlePlayVoiceNote = (msg: Message) => {
    if (playingVnId === msg.id) {
      audioPlayerRef.current?.pause();
      setPlayingVnId(null);
      return;
    }

    audioPlayerRef.current?.pause();

    if (msg.audioUrl) {
      const audio = new Audio(msg.audioUrl);
      audioPlayerRef.current = audio;
      setPlayingVnId(msg.id);
      audio.onended = () => setPlayingVnId(null);
      audio.onerror = () => setPlayingVnId(null);
      audio.play().catch(() => {
        setPlayingVnId(null);
        onNotify('Gagal memutar audio di browser ini.');
      });
    } else {
      setPlayingVnId(msg.id);
      window.setTimeout(() => {
        setPlayingVnId((cur) => (cur === msg.id ? null : cur));
      }, Math.min(4000, (msg.voiceDurationSec ?? 4) * 1000));
    }
  };

  const handleOpenSnap = (msg: Message) => {
    const alreadyViewed = msg.snapViewedBy?.includes(currentUserId);
    if (msg.snapViewOnce && alreadyViewed) return;
    markSnapViewed(msg.id);
    setViewingSnap(msg);
  };

  if (!activeChannel) return null;

  return (
    <main className="chat-panel" aria-label="Ruang Obrolan Utama">
      <header className="chat-header">
        <div className="chat-header-left">
          {activeChannel.type === 'hangout' ? (
            <MapPin size={19} color="var(--accent-coral)" />
          ) : (
            <Hash size={19} color="var(--text-secondary)" />
          )}
          <div style={{ minWidth: 0 }}>
            <h1 className="chat-header-title">{activeChannel.name}</h1>
            <p className="chat-header-topic">
              {typingUsers.length > 0
                ? `${typingUsers.join(', ')} sedang mengetik...`
                : activeChannel.topic ?? 'Offline-first · Sinkron otomatis'}
            </p>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            type="button"
            className={`icon-btn ${searchOpen ? 'active' : ''}`}
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearchQuery('');
            }}
            title="Cari pesan di kanal ini"
          >
            <Search size={16} />
          </button>
          <button
            id="btn-chat-quick-snap"
            type="button"
            className="pill-action"
            onClick={() => setSnapOpen(true)}
            title="Ambil foto atau pilih Quick Snap (24 jam)"
          >
            <Camera size={14} />
            <span>Snap</span>
          </button>
          <button
            id="btn-chat-ajak-kumpul"
            type="button"
            className="pill-action primary"
            onClick={onOpenHangoutModal}
          >
            <MapPin size={14} />
            <span>Ajak Kumpul</span>
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-bar-strip">
          <Search size={14} color="var(--text-muted)" />
          <input
            className="search-inline-input"
            placeholder="Cari teks atau caption Snap di kanal ini..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setSearchQuery('')}
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}

      <div className="messages-scroll">
        {channelMessages.length === 0 && (
          <div className="empty-chat-state">
            <strong>Belum ada pesan yang cocok</strong>
            <span className="channel-meta">
              Mulai obrolan, kirim Voice Note asli, atau ambil Quick Snap.
            </span>
          </div>
        )}

        {channelMessages.map((msg) => {
          const sender = profiles[msg.senderId];
          const isMine = msg.senderId === currentUserId;
          const quoted = msg.replyToId
            ? rawMessages.find((m) => m.id === msg.replyToId)
            : null;
          const pin = msg.hangoutPinId
            ? hangoutPins.find((p) => p.id === msg.hangoutPinId)
            : null;
          const snapConsumed =
            msg.snapViewOnce && msg.snapViewedBy?.includes(currentUserId);
          const peaks =
            msg.waveformPeaks ?? [9, 16, 12, 22, 18, 10, 20, 15, 23, 13, 17, 11];

          return (
            <article key={msg.id} className={`msg-row ${isMine ? 'mine' : ''}`}>
              {!isMine && sender && (
                <div
                  className="avatar sm"
                  style={{ background: sender.avatarColor }}
                >
                  {sender.initials}
                </div>
              )}

              <div className="msg-bubble">
                <div className="msg-sender">
                  <span>{sender?.displayName ?? 'Anggota'}</span>
                  <span className="msg-time">{formatTime(msg.createdAt)}</span>
                  {isMine &&
                    (msg.status === 'sending' ? (
                      <Clock size={12} color="var(--text-muted)" />
                    ) : (
                      <CheckCheck size={13} color="var(--accent-emerald)" />
                    ))}
                </div>

                {quoted && (
                  <div className="msg-reply-quote">
                    Membalas {profiles[quoted.senderId]?.displayName}: “
                    {quoted.content.slice(0, 64)}”
                  </div>
                )}

                {msg.type === 'text' && <p className="msg-text">{msg.content}</p>}

                {msg.type === 'voice_note' && (
                  <div className="voice-note-box">
                    <button
                      type="button"
                      className="vn-play-btn"
                      onClick={() => handlePlayVoiceNote(msg)}
                      aria-label="Putar Voice Note"
                    >
                      {playingVnId === msg.id ? (
                        <Pause size={13} fill="currentColor" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                    </button>
                    <div className="vn-bars">
                      {peaks.map((h, idx) => (
                        <span
                          key={idx}
                          className={`vn-bar ${playingVnId === msg.id ? 'active' : ''}`}
                          style={{ height: `${h}px` }}
                        />
                      ))}
                    </div>
                    <span className="msg-time">
                      {msg.voiceDurationSec ?? 8}s{msg.audioUrl ? ' · HD' : ''}
                    </span>
                  </div>
                )}

                {msg.type === 'quick_snap' && (
                  <div
                    className="snap-card"
                    style={{
                      background: snapConsumed
                        ? 'var(--bg-elevated)'
                        : msg.mediaUrl
                          ? '#0d0f13'
                          : msg.snapGradient,
                      opacity: snapConsumed ? 0.6 : 1,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                    onClick={() => handleOpenSnap(msg)}
                  >
                    {!snapConsumed && msg.mediaUrl && (
                      <img
                        src={msg.mediaUrl}
                        alt={msg.snapCaption ?? 'Quick Snap'}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                    <span className="snap-badge" style={{ position: 'relative', zIndex: 2 }}>
                      {snapConsumed
                        ? 'Sudah dibuka (View Once)'
                        : msg.snapViewOnce
                          ? 'Quick Snap · Sekali Lihat'
                          : 'Quick Snap · 24 Jam'}
                    </span>
                    <div
                      style={{
                        position: 'relative',
                        zIndex: 2,
                        background: msg.mediaUrl ? 'rgba(0,0,0,0.52)' : 'transparent',
                        padding: msg.mediaUrl ? '6px 8px' : 0,
                        borderRadius: 10,
                      }}
                    >
                      <strong style={{ display: 'block', fontSize: 13 }}>
                        {snapConsumed ? 'Snap berakhir' : msg.snapCaption}
                      </strong>
                      {!snapConsumed && (
                        <span style={{ fontSize: 11, opacity: 0.88 }}>
                          Klik untuk perbesar
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {msg.type === 'hangout_card' && pin && (
                  <div className="hangout-card">
                    <div className="hangout-card-top">
                      <div>
                        <h4>{pin.title}</h4>
                        <p className="hangout-place">
                          📍 {pin.placeName} · {pin.startsAtLabel}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          className="pill-action"
                          onClick={() => onFocusMapPin?.(pin.id)}
                        >
                          Peta
                        </button>
                        <a
                          href={buildDirectionsUrl(pin.point, pin.placeName)}
                          target="_blank"
                          rel="noreferrer"
                          className="pill-action"
                          style={{ textDecoration: 'none' }}
                          title="Buka rute di Google Maps"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>

                    <div className="rsvp-row">
                      {(
                        [
                          { id: 'going', label: 'Ikut' },
                          { id: 'otw', label: 'OTW' },
                          { id: 'maybe', label: 'Nanti' },
                        ] as { id: RsvpStatus; label: string }[]
                      ).map((opt) => {
                        const myRsvp = pin.rsvps.find(
                          (r) => r.userId === currentUserId
                        );
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            className={`rsvp-btn ${
                              myRsvp?.status === opt.id ? 'selected' : ''
                            }`}
                            onClick={() => respondToHangout(pin.id, opt.id)}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="rsvp-list">
                      {pin.rsvps.map((r) => {
                        const p = profiles[r.userId];
                        if (!p) return null;
                        return (
                          <span key={r.userId}>
                            {p.displayName} ({r.status.toUpperCase()}
                            {r.etaMinutes ? ` · ${r.etaMinutes}m` : ''})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="msg-toolbar">
                  {msg.reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      className={`reaction-chip ${
                        r.userIds.includes(currentUserId) ? 'active' : ''
                      }`}
                      onClick={() => toggleReaction(msg.id, r.emoji)}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.userIds.length}</span>
                    </button>
                  ))}

                  {QUICK_EMOJIS.slice(0, 3).map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="quick-act-btn"
                      onClick={() => toggleReaction(msg.id, emoji)}
                      title={`Reaksi ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}

                  <button
                    type="button"
                    className="quick-act-btn"
                    onClick={() => setReplyToMessage(msg.id)}
                    title="Balas pesan"
                  >
                    <Reply size={12} />
                  </button>

                  {!isMine && (
                    <button
                      type="button"
                      className="quick-act-btn"
                      onClick={() => {
                        blockUser(msg.senderId);
                        onNotify(`${sender?.displayName ?? 'Pengguna'} diblokir. Kamu bisa membuka blokir di Pengaturan.`);
                      }}
                      title="Blokir pengguna (Keamanan)"
                    >
                      <Ban size={11} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="composer-wrap" onSubmit={handleSend}>
        {replyMessage && (
          <div className="reply-banner">
            <span>
              Membalas <strong>{profiles[replyMessage.senderId]?.displayName}</strong>:{' '}
              {replyMessage.content.slice(0, 70)}
            </span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setReplyToMessage(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="composer-row">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setSnapOpen(true)}
            title="Buka Kamera / Upload Quick Snap"
          >
            <Camera size={19} />
          </button>

          <input
            id="chat-composer-input"
            className="composer-input"
            placeholder={
              recordingSec !== null
                ? `Merekam ${realMicActive ? 'Audio Asli' : 'Voice Note'}... 0:${String(
                    recordingSec
                  ).padStart(2, '0')} (level ${liveMicLevel})`
                : `Kirim pesan ke ${activeChannel.name}...`
            }
            value={draft}
            disabled={recordingSec !== null}
            onChange={(e) => setDraft(e.target.value)}
          />

          <button
            id="btn-voice-note"
            type="button"
            className={`icon-btn ${recordingSec !== null ? 'active' : ''}`}
            onClick={handleToggleVoiceNote}
            title={
              recordingSec !== null
                ? 'Hentikan & Kirim Voice Note'
                : 'Rekam Voice Note Mikrofon Asli'
            }
          >
            {recordingSec !== null ? (
              <Square size={17} color="var(--accent-coral)" />
            ) : (
              <Mic size={19} />
            )}
          </button>

          <button id="btn-send-message" type="submit" className="send-btn">
            <Send size={15} />
            <span>Kirim</span>
          </button>
        </div>
      </form>

      {snapOpen && (
        <QuickSnapModal
          onClose={() => setSnapOpen(false)}
          onSend={({ caption, viewOnce, mediaUrl }) => {
            sendQuickSnap(activeChannel.id, caption, viewOnce, mediaUrl);
            onNotify(mediaUrl ? 'Foto Quick Snap terkirim!' : 'Quick Snap terkirim!');
          }}
        />
      )}

      {viewingSnap && (
        <div className="modal-backdrop" onClick={() => setViewingSnap(null)}>
          <div
            className="modal-sheet"
            style={{
              background: viewingSnap.mediaUrl ? '#0d0f13' : viewingSnap.snapGradient,
              color: '#fff',
              minHeight: 380,
              justifyContent: 'space-between',
              position: 'relative',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {viewingSnap.mediaUrl && (
              <img
                src={viewingSnap.mediaUrl}
                alt={viewingSnap.snapCaption ?? 'Quick Snap'}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            <div className="map-header-row" style={{ position: 'relative', zIndex: 2 }}>
              <strong style={{ background: 'rgba(0,0,0,0.45)', padding: '4px 10px', borderRadius: 999 }}>
                {profiles[viewingSnap.senderId]?.displayName}
              </strong>
              <button
                type="button"
                className="pill-action"
                onClick={() => setViewingSnap(null)}
              >
                Tutup
              </button>
            </div>
            <div
              style={{
                position: 'relative',
                zIndex: 2,
                background: 'rgba(0,0,0,0.55)',
                padding: '10px 12px',
                borderRadius: 12,
              }}
            >
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>
                {viewingSnap.snapCaption}
              </h3>
              <p style={{ margin: 0, opacity: 0.9, fontSize: 12 }}>
                {viewingSnap.snapViewOnce
                  ? 'Mode Sekali Lihat — Snap akan terkunci setelah ditutup.'
                  : 'Otomatis kedaluwarsa dalam 24 jam.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
