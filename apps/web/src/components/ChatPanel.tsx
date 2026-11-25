import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCheck,
  Hash,
  MapPin,
  Mic,
  Play,
  Reply,
  Send,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useZonaStore, type Message, type RsvpStatus } from '@zona/shared';

interface ChatPanelProps {
  onOpenHangoutModal: () => void;
  onFocusMapPin?: (pinId: string) => void;
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
}: ChatPanelProps) {
  const {
    currentUserId,
    profiles,
    channels,
    messages,
    hangoutPins,
    activeChannelId,
    replyToMessageId,
    sendTextMessage,
    sendVoiceNote,
    sendQuickSnap,
    toggleReaction,
    setReplyToMessage,
    markSnapViewed,
    respondToHangout,
  } = useZonaStore();

  const [draft, setDraft] = useState('');
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapCaption, setSnapCaption] = useState('');
  const [snapViewOnce, setSnapViewOnce] = useState(false);
  const [viewingSnap, setViewingSnap] = useState<Message | null>(null);
  const [playingVnId, setPlayingVnId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const channelMessages = messages.filter((m) => m.channelId === activeChannelId);
  const replyMessage = replyToMessageId
    ? channelMessages.find((m) => m.id === replyToMessageId)
    : null;

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

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !draft.trim()) return;
    sendTextMessage(activeChannel.id, draft);
    setDraft('');
  };

  const handleToggleVoiceNote = () => {
    if (!activeChannel) return;
    if (recordingSec === null) {
      setRecordingSec(1);
    } else {
      sendVoiceNote(activeChannel.id, recordingSec);
      setRecordingSec(null);
    }
  };

  const handleSendSnap = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel) return;
    sendQuickSnap(activeChannel.id, snapCaption, snapViewOnce);
    setSnapCaption('');
    setSnapViewOnce(false);
    setSnapOpen(false);
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
              {activeChannel.topic ?? 'Offline-first · Sinkron otomatis'}
            </p>
          </div>
        </div>

        <div className="chat-header-actions">
          <button
            id="btn-chat-quick-snap"
            type="button"
            className="pill-action"
            onClick={() => setSnapOpen(true)}
            title="Kirim Quick Snap (24 jam)"
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

      <div className="messages-scroll">
        {channelMessages.map((msg) => {
          const sender = profiles[msg.senderId];
          const isMine = msg.senderId === currentUserId;
          const quoted = msg.replyToId
            ? channelMessages.find((m) => m.id === msg.replyToId)
            : null;
          const pin = msg.hangoutPinId
            ? hangoutPins.find((p) => p.id === msg.hangoutPinId)
            : null;
          const snapConsumed =
            msg.snapViewOnce && msg.snapViewedBy?.includes(currentUserId);

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
                  {isMine && (
                    <CheckCheck size={13} color="var(--accent-emerald)" />
                  )}
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
                      onClick={() =>
                        setPlayingVnId((id) => (id === msg.id ? null : msg.id))
                      }
                      aria-label="Putar Voice Note"
                    >
                      {playingVnId === msg.id ? (
                        <Square size={12} fill="currentColor" />
                      ) : (
                        <Play size={13} fill="currentColor" />
                      )}
                    </button>
                    <div className="vn-bars">
                      {[9, 16, 12, 22, 18, 10, 20, 15, 23, 13, 17, 11].map(
                        (h, idx) => (
                          <span
                            key={idx}
                            className={`vn-bar ${
                              playingVnId === msg.id && idx % 2 === 0
                                ? 'active'
                                : ''
                            }`}
                            style={{ height: `${h}px` }}
                          />
                        )
                      )}
                    </div>
                    <span className="msg-time">{msg.voiceDurationSec ?? 8}s</span>
                  </div>
                )}

                {msg.type === 'quick_snap' && (
                  <div
                    className="snap-card"
                    style={{
                      background: snapConsumed
                        ? 'var(--bg-elevated)'
                        : msg.snapGradient,
                      opacity: snapConsumed ? 0.6 : 1,
                    }}
                    onClick={() => handleOpenSnap(msg)}
                  >
                    <span className="snap-badge">
                      {snapConsumed
                        ? 'Sudah dibuka (View Once)'
                        : msg.snapViewOnce
                          ? 'Quick Snap · Sekali Lihat'
                          : 'Quick Snap · 24 Jam'}
                    </span>
                    <div>
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
                      <button
                        type="button"
                        className="pill-action"
                        onClick={() => onFocusMapPin?.(pin.id)}
                      >
                        Lihat Peta
                      </button>
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
            title="Kirim Quick Snap"
          >
            <Camera size={19} />
          </button>

          <input
            id="chat-composer-input"
            className="composer-input"
            placeholder={
              recordingSec !== null
                ? `Merekam Voice Note... 0:${String(recordingSec).padStart(2, '0')}`
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
                : 'Rekam Voice Note Cepat'
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

      {/* Quick Snap Composer Modal */}
      {snapOpen && (
        <div className="modal-backdrop" onClick={() => setSnapOpen(false)}>
          <form
            className="modal-sheet"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSendSnap}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={18} color="var(--accent-yellow)" />
              <h3>Kirim Quick Snap</h3>
            </div>
            <label className="field-label">
              Caption Momen
              <input
                className="field-input"
                placeholder="Mis: Kopi susu udah nyampe, buruan!"
                value={snapCaption}
                onChange={(e) => setSnapCaption(e.target.value)}
                autoFocus
              />
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                color: 'var(--text-secondary)',
              }}
            >
              <input
                type="checkbox"
                checked={snapViewOnce}
                onChange={(e) => setSnapViewOnce(e.target.checked)}
              />
              Aktifkan mode Sekali Lihat (View Once)
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="pill-action"
                onClick={() => setSnapOpen(false)}
              >
                Batal
              </button>
              <button type="submit" className="pill-action primary">
                Kirim Snap
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Snap Lightbox Viewer */}
      {viewingSnap && (
        <div className="modal-backdrop" onClick={() => setViewingSnap(null)}>
          <div
            className="modal-sheet"
            style={{
              background: viewingSnap.snapGradient,
              color: '#fff',
              minHeight: 340,
              justifyContent: 'space-between',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="map-header-row">
              <strong>{profiles[viewingSnap.senderId]?.displayName}</strong>
              <button
                type="button"
                className="pill-action"
                onClick={() => setViewingSnap(null)}
              >
                Tutup
              </button>
            </div>
            <div>
              <h3 style={{ fontSize: 22, marginBottom: 6 }}>
                {viewingSnap.snapCaption}
              </h3>
              <p style={{ margin: 0, opacity: 0.9, fontSize: 13 }}>
                {viewingSnap.content}
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
