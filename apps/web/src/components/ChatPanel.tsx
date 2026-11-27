import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Camera,
  Check,
  CheckCheck,
  Clock,
  Copy,
  ExternalLink,
  Flag,
  Hash,
  Info,
  Map as MapIcon,
  MapPin,
  Mic,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import {
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  groupMessages,
  useZonaStore,
  type Message,
  type RsvpStatus,
} from '@zona/shared';
import { Avatar } from './Avatar';
import { QuickSnapModal } from './QuickSnapModal';
import { ReportModal } from './ReportModal';
import { HANGOUT_CATEGORY_META } from './SocialMapPanel';
import { VoiceNoteRecorder } from '../services/mediaTools';
import { buildDirectionsUrl } from '../services/geocoder';
import { zonaCloudSync } from '../services/cloudSync';

interface ChatPanelProps {
  theme: 'dark' | 'light';
  splitMapOpen: boolean;
  onToggleSplitMap: () => void;
  onBackMobile?: () => void;
  onOpenHangoutModal: () => void;
  onFocusMapPin?: (pinId: string) => void;
  onNotify: (msg: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂'];
const COMPOSER_EMOJIS = [
  '😀', '😂', '🥹', '😍', '🔥', '👍',
  '🙏', '☕', '🎧', '🛵', '🎉', '❤️',
  '😮', '😢', '👏', '✨', '🍕', '👌',
];
const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function ChatPanel({
  theme,
  splitMapOpen,
  onToggleSplitMap,
  onBackMobile,
  onOpenHangoutModal,
  onFocusMapPin,
  onNotify,
}: ChatPanelProps) {
  const {
    currentUserId,
    profiles,
    circles,
    channels,
    messages,
    locations,
    hangoutPins,
    blockedUserIds,
    typingUsersByChannel,
    activeChannelId,
    replyToMessageId,
    editingMessageId,
    searchQuery,
    sendTextMessage,
    editMessage,
    deleteMessage,
    sendVoiceNote,
    sendQuickSnap,
    toggleReaction,
    setReplyToMessage,
    setEditingMessage,
    setSearchQuery,
    markSnapViewed,
    respondToHangout,
    blockUser,
    reportContent,
  } = useZonaStore();

  const [draft, setDraft] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [openMenuMsgId, setOpenMenuMsgId] = useState<string | null>(null);
  const [recordingSec, setRecordingSec] = useState<number | null>(null);
  const [realMicActive, setRealMicActive] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [viewingSnap, setViewingSnap] = useState<Message | null>(null);
  const [playingVnId, setPlayingVnId] = useState<string | null>(null);
  const [vnProgress, setVnProgress] = useState<number>(0);
  const [playbackSpeedIdx, setPlaybackSpeedIdx] = useState<number>(0);
  const [reportTarget, setReportTarget] = useState<{
    label: string;
    userId?: string;
    messageId?: string;
  } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<VoiceNoteRecorder | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const simTimerRef = useRef<number | null>(null);

  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const activeCircle = activeChannel?.circleId
    ? circles.find((c) => c.id === activeChannel.circleId)
    : null;
  const dmPartnerId =
    activeChannel?.type === 'dm'
      ? activeChannel.participantIds?.find((id) => id !== currentUserId)
      : undefined;
  const dmPartner = dmPartnerId ? profiles[dmPartnerId] : null;
  const myLoc = locations[currentUserId];

  const rawMessages = useMemo(
    () =>
      messages.filter(
        (m) => m.channelId === activeChannelId && !blockedUserIds.includes(m.senderId)
      ),
    [messages, activeChannelId, blockedUserIds]
  );

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawMessages;
    return rawMessages.filter((m) =>
      `${m.content} ${m.snapCaption ?? ''}`.toLowerCase().includes(q)
    );
  }, [rawMessages, searchQuery]);

  const groupedMessages = useMemo(
    () => groupMessages(filteredMessages),
    [filteredMessages]
  );

  const replyMessage = replyToMessageId
    ? rawMessages.find((m) => m.id === replyToMessageId)
    : null;
  const editingMessage = editingMessageId
    ? rawMessages.find((m) => m.id === editingMessageId)
    : null;
  const typingUsers = typingUsersByChannel[activeChannelId] ?? [];
  const playbackSpeed = PLAYBACK_SPEEDS[playbackSpeedIdx];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages.length, activeChannelId]);

  useEffect(() => {
    if (editingMessage) {
      setDraft(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

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
      if (simTimerRef.current) window.clearInterval(simTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  const adjustTextareaHeight = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = '24px';
    el.style.height = `${Math.min(120, el.scrollHeight)}px`;
  };

  const submitMessage = () => {
    if (!activeChannel || !draft.trim()) return;
    zonaCloudSync.notifyTyping(false);
    if (editingMessage) {
      editMessage(editingMessage.id, draft);
      void zonaCloudSync.syncEditMessage(editingMessage.id, draft.trim());
      onNotify('Pesan diperbarui.');
    } else {
      const sent = sendTextMessage(activeChannel.id, draft);
      void zonaCloudSync.syncSendMessage(sent);
    }
    setDraft('');
    setAttachOpen(false);
    setEmojiOpen(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = '24px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
  };

  const startVoiceRecording = async () => {
    if (!activeChannel) return;
    const recorder = new VoiceNoteRecorder();
    recorderRef.current = recorder;
    try {
      await recorder.start();
      setRealMicActive(true);
      setRecordingSec(0);
    } catch {
      setRealMicActive(false);
      setRecordingSec(0);
    }
  };

  const cancelVoiceRecording = () => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setRealMicActive(false);
    setRecordingSec(null);
  };

  const finishVoiceRecording = async () => {
    if (!activeChannel || recordingSec === null) return;
    const fallbackDuration = Math.max(1, recordingSec);

    if (realMicActive && recorderRef.current) {
      try {
        const recorded = await recorderRef.current.stop();
        const vnMsg = sendVoiceNote(
          activeChannel.id,
          recorded.durationSec,
          recorded.dataUrl,
          recorded.waveformPeaks
        );
        void zonaCloudSync.syncSendMessage(vnMsg);
      } catch {
        const vnMsg = sendVoiceNote(activeChannel.id, fallbackDuration);
        void zonaCloudSync.syncSendMessage(vnMsg);
      }
    } else {
      const vnMsg = sendVoiceNote(activeChannel.id, fallbackDuration);
      void zonaCloudSync.syncSendMessage(vnMsg);
    }

    recorderRef.current = null;
    setRealMicActive(false);
    setRecordingSec(null);
  };

  const stopActiveVoicePlayback = () => {
    audioPlayerRef.current?.pause();
    audioPlayerRef.current = null;
    if (simTimerRef.current) {
      window.clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setPlayingVnId(null);
    setVnProgress(0);
  };

  const handlePlayVoiceNote = (msg: Message) => {
    if (playingVnId === msg.id) {
      stopActiveVoicePlayback();
      return;
    }

    stopActiveVoicePlayback();
    setPlayingVnId(msg.id);
    setVnProgress(0);

    if (msg.audioUrl) {
      const audio = new Audio(msg.audioUrl);
      audio.playbackRate = playbackSpeed;
      audioPlayerRef.current = audio;
      audio.ontimeupdate = () => {
        if (audio.duration > 0) {
          setVnProgress(audio.currentTime / audio.duration);
        }
      };
      audio.onended = () => stopActiveVoicePlayback();
      audio.onerror = () => stopActiveVoicePlayback();
      audio.play().catch(() => stopActiveVoicePlayback());
    } else {
      const totalMs = Math.min(6000, ((msg.voiceDurationSec ?? 6) * 1000) / playbackSpeed);
      const started = Date.now();
      simTimerRef.current = window.setInterval(() => {
        const ratio = (Date.now() - started) / totalMs;
        if (ratio >= 1) {
          stopActiveVoicePlayback();
        } else {
          setVnProgress(ratio);
        }
      }, 80);
    }
  };

  const handleOpenSnap = (msg: Message) => {
    const alreadyViewed = msg.snapViewedBy?.includes(currentUserId);
    if (msg.snapViewOnce && alreadyViewed) return;
    markSnapViewed(msg.id);
    setViewingSnap(msg);
  };

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify('Pesan disalin.');
    } catch {
      onNotify('Tidak dapat menyalin pesan.');
    }
  };

  if (!activeChannel) return null;

  const headerSubtitle =
    typingUsers.length > 0
      ? `${typingUsers.join(', ')} sedang mengetik...`
      : dmPartner
        ? dmPartner.isOnline
          ? 'Online'
          : `Terakhir dilihat ${formatTime(dmPartner.lastSeenAt)}`
        : activeChannel.topic ?? `${activeCircle?.memberIds.length ?? 0} anggota`;

  return (
    <main
      className="chat-panel"
      aria-label="Ruang Obrolan"
      onClick={() => {
        if (openMenuMsgId) setOpenMenuMsgId(null);
      }}
    >
      {/* Floating Liquid-Glass Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          {onBackMobile && (
            <button
              type="button"
              className="icon-btn mobile-only"
              onClick={onBackMobile}
              aria-label="Kembali"
            >
              <ArrowLeft size={19} strokeWidth={1.75} />
            </button>
          )}

          {dmPartner ? (
            <Avatar
              initials={dmPartner.initials}
              color={dmPartner.avatarColor}
              variant={dmPartner.avatarVariant}
              seed={dmPartner.id}
              avatarUrl={dmPartner.avatarUrl}
              size="sm"
              online={dmPartner.isOnline}
              showPresence
            />
          ) : activeChannel.type === 'hangout' ? (
            <MapPin size={19} strokeWidth={1.75} color="var(--accent)" />
          ) : (
            <Hash size={19} strokeWidth={1.75} color="var(--text-secondary)" />
          )}

          <div style={{ minWidth: 0 }}>
            <h1 className="chat-header-title">{activeChannel.name}</h1>
            <p className={`chat-header-sub ${typingUsers.length > 0 ? 'typing' : ''}`}>
              {headerSubtitle}
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
            title="Cari pesan"
            aria-label="Cari pesan"
          >
            <Search size={18} strokeWidth={1.75} />
          </button>

          <button
            id="btn-split-map-toggle"
            type="button"
            className={`header-map-pill desktop-only ${splitMapOpen ? 'active' : ''}`}
            onClick={onToggleSplitMap}
            title={splitMapOpen ? 'Tutup panel peta' : 'Buka peta samping'}
            aria-label="Panel peta"
          >
            <MapIcon size={16} strokeWidth={1.75} />
            <span>Peta</span>
          </button>

          <button
            type="button"
            className={`icon-btn ${infoOpen ? 'active' : ''}`}
            onClick={() => setInfoOpen((v) => !v)}
            title="Info obrolan"
            aria-label="Info obrolan"
          >
            <Info size={18} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="chat-search-bar">
          <Search size={15} strokeWidth={1.75} color="var(--text-muted)" />
          <input
            className="chat-search-input"
            placeholder="Cari dalam percakapan..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              className="icon-btn"
              style={{ width: 26, height: 26 }}
              onClick={() => setSearchQuery('')}
              aria-label="Bersihkan pencarian"
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}

      {/* Textured Wallpaper Message Stream */}
      <div className="messages-scroll">
        <div className="messages-inner">
          {groupedMessages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', padding: 24 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Belum ada pesan</p>
              <p className="meta-text" style={{ marginTop: 4 }}>
                Kirim pesan untuk memulai percakapan.
              </p>
            </div>
          )}

        {groupedMessages.map((item) => {
          const {
            message: msg,
            groupPosition,
            showDateSeparator,
            dateLabel,
            showAvatar,
            showSenderName,
          } = item;
          const sender = profiles[msg.senderId];
          const isMine = msg.senderId === currentUserId;
          const isGrouped = groupPosition === 'middle' || groupPosition === 'last';
          const quoted = msg.replyToId
            ? rawMessages.find((m) => m.id === msg.replyToId)
            : null;
          const pin = msg.hangoutPinId
            ? hangoutPins.find((p) => p.id === msg.hangoutPinId)
            : null;
          const snapConsumed =
            msg.snapViewOnce && msg.snapViewedBy?.includes(currentUserId);
          const peaks =
            msg.waveformPeaks ?? [9, 15, 19, 12, 22, 16, 11, 20, 14, 21, 13, 17, 10, 15, 11, 8];
          const isPlayingThis = playingVnId === msg.id;

          return (
            <div key={msg.id}>
              {showDateSeparator && dateLabel && (
                <div className="date-separator">
                  <span className="date-separator-pill">{dateLabel}</span>
                </div>
              )}

              <article
                className={`msg-row ${isMine ? 'mine' : ''} ${
                  isGrouped ? 'grouped' : ''
                } pos-${groupPosition} ${openMenuMsgId === msg.id ? 'menu-open' : ''}`}
              >
                {!isMine && (
                  <div className="msg-avatar-slot">
                    {showAvatar && sender && (
                      <Avatar
                        initials={sender.initials}
                        color={sender.avatarColor}
                        variant={sender.avatarVariant}
                        seed={sender.id}
                        avatarUrl={sender.avatarUrl}
                        size="sm"
                      />
                    )}
                  </div>
                )}

                <div className="msg-stack">
                  {!isMine && showSenderName && activeChannel.type !== 'dm' && sender && (
                    <span className="msg-sender-name">{sender.displayName}</span>
                  )}

                  {/* Hover Action Bar */}
                  {!msg.isDeleted && (
                    <div
                      className="msg-hover-bar"
                      role="toolbar"
                      aria-label="Aksi pesan"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {QUICK_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          className="hover-act-btn"
                          onClick={() => {
                            toggleReaction(msg.id, emoji);
                            void zonaCloudSync.syncToggleReaction(msg.id, emoji);
                          }}
                          title={`Reaksi ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="hover-act-btn"
                        onClick={() => setReplyToMessage(msg.id)}
                        title="Balas"
                        aria-label="Balas pesan"
                      >
                        <Reply size={14} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        className="hover-act-btn"
                        onClick={() => handleCopyText(msg.content)}
                        title="Salin"
                        aria-label="Salin pesan"
                      >
                        <Copy size={13} strokeWidth={1.75} />
                      </button>
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className="hover-act-btn"
                          onClick={() =>
                            setOpenMenuMsgId((cur) => (cur === msg.id ? null : msg.id))
                          }
                          title="Lainnya"
                          aria-label="Menu pesan"
                        >
                          <MoreHorizontal size={14} strokeWidth={1.75} />
                        </button>

                        {openMenuMsgId === msg.id && (
                          <div className="msg-context-menu">
                            {isMine && msg.type === 'text' && (
                              <button
                                type="button"
                                className="context-menu-item"
                                onClick={() => {
                                  setEditingMessage(msg.id);
                                  setOpenMenuMsgId(null);
                                }}
                              >
                                <Pencil size={14} strokeWidth={1.75} />
                                <span>Edit pesan</span>
                              </button>
                            )}
                            {isMine && (
                              <button
                                type="button"
                                className="context-menu-item danger"
                                onClick={() => {
                                  deleteMessage(msg.id);
                                  void zonaCloudSync.syncDeleteMessage(msg.id);
                                  setOpenMenuMsgId(null);
                                  onNotify('Pesan dihapus.');
                                }}
                              >
                                <Trash2 size={14} strokeWidth={1.75} />
                                <span>Hapus pesan</span>
                              </button>
                            )}
                            {!isMine && (
                              <>
                                <button
                                  type="button"
                                  className="context-menu-item"
                                  onClick={() => {
                                    setReportTarget({
                                      label: sender?.displayName ?? 'pesan ini',
                                      userId: msg.senderId,
                                      messageId: msg.id,
                                    });
                                    setOpenMenuMsgId(null);
                                  }}
                                >
                                  <Flag size={14} strokeWidth={1.75} />
                                  <span>Laporkan</span>
                                </button>
                                <button
                                  type="button"
                                  className="context-menu-item danger"
                                  onClick={() => {
                                    blockUser(msg.senderId);
                                    void zonaCloudSync.syncBlockUser(msg.senderId);
                                    setOpenMenuMsgId(null);
                                    onNotify(`${sender?.displayName ?? 'Pengguna'} diblokir.`);
                                  }}
                                >
                                  <Ban size={14} strokeWidth={1.75} />
                                  <span>Blokir pengguna</span>
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className={`msg-bubble ${msg.type === 'hangout_card' ? 'hangout-shell' : ''}`}>
                    {quoted && !msg.isDeleted && (
                      <div className="msg-reply-quote">
                        <span className="msg-reply-author">
                          {profiles[quoted.senderId]?.displayName ?? 'Anggota'}
                        </span>
                        <span>{quoted.content.slice(0, 72)}</span>
                      </div>
                    )}

                    {msg.isDeleted ? (
                      <div className="msg-body-wrap">
                        <p className="msg-text deleted">{msg.content}</p>
                        <span className="msg-meta-inline">{formatTime(msg.createdAt)}</span>
                      </div>
                    ) : msg.type === 'text' ? (
                      <div className="msg-body-wrap">
                        <p className="msg-text">{msg.content}</p>
                        <span className="msg-meta-inline">
                          {msg.editedAt && <span>diedit ·</span>}
                          <span>{formatTime(msg.createdAt)}</span>
                          {isMine &&
                            (msg.status === 'sending' ? (
                              <Clock size={12} strokeWidth={1.75} />
                            ) : msg.status === 'sent' ? (
                              <Check size={13} strokeWidth={2} />
                            ) : (
                              <CheckCheck
                                size={13}
                                strokeWidth={2}
                                className={msg.status === 'read' ? 'msg-check-read' : undefined}
                              />
                            ))}
                        </span>
                      </div>
                    ) : msg.type === 'voice_note' ? (
                      <div>
                        <div className="vn-player">
                          <button
                            type="button"
                            className="vn-play-btn"
                            onClick={() => handlePlayVoiceNote(msg)}
                            aria-label={isPlayingThis ? 'Jeda pesan suara' : 'Putar pesan suara'}
                          >
                            {isPlayingThis ? (
                              <Pause size={14} fill="currentColor" strokeWidth={1.75} />
                            ) : (
                              <Play size={14} fill="currentColor" strokeWidth={1.75} />
                            )}
                          </button>
                          <div className="vn-waveform">
                            {peaks.map((h, idx) => {
                              const barThreshold = (idx + 1) / peaks.length;
                              const isPlayed = isPlayingThis && vnProgress >= barThreshold;
                              return (
                                <span
                                  key={idx}
                                  className={`vn-bar ${isPlayed ? 'played' : ''}`}
                                  style={{ height: `${Math.max(5, Math.min(24, h))}px` }}
                                />
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            className="vn-speed-btn"
                            onClick={() =>
                              setPlaybackSpeedIdx((i) => (i + 1) % PLAYBACK_SPEEDS.length)
                            }
                            title="Kecepatan putar"
                          >
                            {playbackSpeed}x
                          </button>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginTop: 4,
                          }}
                        >
                          <span className="meta-text">
                            {formatDuration(msg.voiceDurationSec ?? 8)}
                          </span>
                          <span className="msg-meta-inline">
                            <span>{formatTime(msg.createdAt)}</span>
                            {isMine && (
                              <CheckCheck
                                size={13}
                                strokeWidth={2}
                                className={msg.status === 'read' ? 'msg-check-read' : undefined}
                              />
                            )}
                          </span>
                        </div>
                      </div>
                    ) : msg.type === 'quick_snap' ? (
                      <div>
                        <div
                          className={`snap-bubble-card ${snapConsumed ? 'consumed' : ''}`}
                          style={{
                            background: snapConsumed
                              ? undefined
                              : msg.mediaUrl
                                ? '#111827'
                                : msg.snapGradient,
                          }}
                          onClick={() => handleOpenSnap(msg)}
                        >
                          {!snapConsumed && msg.mediaUrl && (
                            <img
                              src={msg.mediaUrl}
                              alt={msg.snapCaption ?? 'Quick Snap'}
                              className="snap-bubble-img"
                            />
                          )}
                          <span className="snap-pill-top">
                            <Camera size={11} strokeWidth={1.75} />
                            {snapConsumed
                              ? 'Sudah dibuka'
                              : msg.snapViewOnce
                                ? 'Sekali lihat'
                                : '24j'}
                          </span>
                          <div className="snap-caption-bar">
                            {snapConsumed ? 'Foto sekali lihat telah berakhir' : msg.snapCaption}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <span className="msg-meta-inline">
                            <span>{formatTime(msg.createdAt)}</span>
                            {isMine && (
                              <CheckCheck
                                size={13}
                                strokeWidth={2}
                                className={msg.status === 'read' ? 'msg-check-read' : undefined}
                              />
                            )}
                          </span>
                        </div>
                      </div>
                    ) : msg.type === 'hangout_card' && pin ? (() => {
                      const cat = HANGOUT_CATEGORY_META[pin.category ?? 'coffee'];
                      const CatIcon = cat.icon;
                      const distLabel = myLoc
                        ? `${formatDistanceLabel(distanceMeters(myLoc.point, pin.point))} · ~${estimateEtaMinutes(myLoc.point, pin.point)} mnt`
                        : 'Sekitar lokasi';
                      const goingRsvps = pin.rsvps.filter((r) => r.status !== 'maybe');

                      return (
                        <div className="hangout-inline-card">
                          {/* Real 3D Cartographic Mini-Map Preview */}
                          <div
                            className="hangout-minimap"
                            onClick={() => onFocusMapPin?.(pin.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onFocusMapPin?.(pin.id);
                            }}
                          >
                            <img
                              src={
                                theme === 'dark'
                                  ? './media/minimap-kemang-dark.webp'
                                  : './media/minimap-kemang-light.webp'
                              }
                              alt={`Peta lokasi ${pin.placeName}`}
                              className="hangout-minimap-img"
                            />
                            <div className="hangout-minimap-scrim" aria-hidden="true" />

                            <span
                              className="minimap-cat-badge"
                              style={{ background: cat.color }}
                            >
                              <CatIcon size={11} strokeWidth={2} />
                              <span>{cat.label}</span>
                            </span>

                            <div className="minimap-center-pin">
                              <span
                                className="minimap-pin-pulse"
                                style={{ background: `${cat.color}40` }}
                              />
                              <span
                                className="minimap-pin-core"
                                style={{ background: cat.color }}
                              >
                                <MapPin size={13} strokeWidth={2.2} color="#FFFFFF" />
                              </span>
                            </div>

                            <span className="minimap-eta-badge">{distLabel}</span>
                          </div>

                          <div className="hangout-card-body">
                            <div>
                              <h4 className="hangout-inline-title">{pin.title}</h4>
                              <p className="hangout-inline-place">
                                <MapPin size={13} strokeWidth={1.75} color={cat.color} />
                                <span>
                                  {pin.placeName} · {pin.startsAtLabel}
                                </span>
                              </p>
                            </div>

                            {/* Overlapping Illustrated Avatar Stack of RSVPs */}
                            <div className="rsvp-avatar-bar">
                              <div className="avatar-stack">
                                {pin.rsvps.slice(0, 5).map((r) => {
                                  const p = profiles[r.userId];
                                  if (!p) return null;
                                  return (
                                    <span key={r.userId} className="avatar-stack-item" title={`${p.displayName} (${r.status})`}>
                                      <Avatar
                                        initials={p.initials}
                                        color={p.avatarColor}
                                        variant={p.avatarVariant}
                                        seed={p.id}
                                        avatarUrl={p.avatarUrl}
                                        size="xs"
                                      />
                                    </span>
                                  );
                                })}
                              </div>
                              <span className="meta-text">
                                {goingRsvps.length} ikut / OTW · {pin.rsvps.length} respon
                              </span>
                            </div>

                            <div className="rsvp-segment">
                              {(
                                [
                                  { id: 'going', label: 'Ikut' },
                                  { id: 'otw', label: 'OTW' },
                                  { id: 'maybe', label: 'Nanti' },
                                ] as { id: RsvpStatus; label: string }[]
                              ).map((opt) => {
                                const myRsvp = pin.rsvps.find((r) => r.userId === currentUserId);
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    className={`rsvp-choice ${
                                      myRsvp?.status === opt.id ? 'selected' : ''
                                    }`}
                                    onClick={() => {
                                      respondToHangout(pin.id, opt.id);
                                      void zonaCloudSync.syncHangoutRsvp(pin.id, opt.id);
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <div className="hangout-inline-links">
                                <button
                                  type="button"
                                  className="inline-link-btn"
                                  onClick={() => onFocusMapPin?.(pin.id)}
                                >
                                  <MapIcon size={12} strokeWidth={1.75} />
                                  <span>Lihat di Peta</span>
                                </button>
                                <a
                                  href={buildDirectionsUrl(pin.point, pin.placeName)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-link-btn"
                                >
                                  <ExternalLink size={12} strokeWidth={1.75} />
                                  <span>Rute</span>
                                </a>
                              </div>
                              <span className="msg-meta-inline">{formatTime(msg.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })() : null}
                  </div>

                  {msg.reactions.length > 0 && !msg.isDeleted && (
                    <div className="msg-reactions">
                      {msg.reactions.map((r) => (
                        <button
                          key={r.emoji}
                          type="button"
                          className={`reaction-pill ${
                            r.userIds.includes(currentUserId) ? 'mine' : ''
                          }`}
                          onClick={() => {
                            toggleReaction(msg.id, r.emoji);
                            void zonaCloudSync.syncToggleReaction(msg.id, r.emoji);
                          }}
                        >
                          <span>{r.emoji}</span>
                          <span>{r.userIds.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            </div>
          );
        })}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* Info Drawer */}
      {infoOpen && (
        <aside className="info-drawer" aria-label="Informasi Obrolan">
          <div className="modal-head">
            <h3>Informasi</h3>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setInfoOpen(false)}
              aria-label="Tutup info"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div>
            <strong style={{ fontSize: 15 }}>{activeChannel.name}</strong>
            <p className="meta-text" style={{ marginTop: 4 }}>
              {activeChannel.topic ?? 'Percakapan pribadi'}
            </p>
          </div>
          {activeCircle && (
            <>
              <div className="settings-divider" />
              <div>
                <div className="sidebar-section-header" style={{ padding: '0 0 8px' }}>
                  <span>Anggota ({activeCircle.memberIds.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {activeCircle.memberIds.map((uid) => {
                    const p = profiles[uid];
                    if (!p) return null;
                    const role = activeCircle.memberRoles?.[uid] ?? 'member';
                    return (
                      <div
                        key={uid}
                        style={{ display: 'flex', alignItems: 'center', gap: 9 }}
                      >
                        <Avatar
                          initials={p.initials}
                          color={p.avatarColor}
                          variant={p.avatarVariant}
                          seed={uid}
                          avatarUrl={p.avatarUrl}
                          size="xs"
                          online={p.isOnline}
                          showPresence
                        />
                        <span style={{ flex: 1, fontSize: 13.5 }}>{p.displayName}</span>
                        {role !== 'member' && (
                          <span className="meta-text" style={{ textTransform: 'capitalize' }}>
                            {role}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </aside>
      )}

      {/* Floating Liquid-Glass Composer Bar */}
      <div className="composer-shell">
        <div className="composer-inner">
          {attachOpen && (
            <div className="composer-popover">
              <button
                id="btn-attach-snap"
                type="button"
                className="context-menu-item"
                onClick={() => {
                  setAttachOpen(false);
                  setSnapOpen(true);
                }}
              >
                <Camera size={16} strokeWidth={1.75} />
                <span>Quick Snap (24 jam)</span>
              </button>
              <button
                id="btn-attach-hangout"
                type="button"
                className="context-menu-item"
                onClick={() => {
                  setAttachOpen(false);
                  onOpenHangoutModal();
                }}
              >
                <MapPin size={16} strokeWidth={1.75} />
                <span>Pin Ajak Kumpul</span>
              </button>
            </div>
          )}

          {emojiOpen && (
            <div className="emoji-popover">
              {COMPOSER_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  className="emoji-pick-btn"
                  onClick={() => {
                    setDraft((d) => d + em);
                    textareaRef.current?.focus();
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          {(replyMessage || editingMessage) && (
            <div className="composer-context-bar">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {editingMessage ? (
                  <>
                    <strong>Edit pesan</strong> · {editingMessage.content.slice(0, 60)}
                  </>
                ) : (
                  <>
                    Membalas <strong>{profiles[replyMessage!.senderId]?.displayName}</strong>:{' '}
                    {replyMessage!.content.slice(0, 60)}
                  </>
                )}
              </span>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 24, height: 24 }}
                onClick={() => {
                  setReplyToMessage(null);
                  setEditingMessage(null);
                  if (editingMessage) setDraft('');
                }}
                aria-label="Batalkan"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          )}

          <div className="composer-box">
            {recordingSec !== null ? (
              <>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={cancelVoiceRecording}
                  title="Batalkan rekaman"
                  aria-label="Batalkan rekaman"
                >
                  <Trash2 size={18} strokeWidth={1.75} />
                </button>
                <div className="composer-recording-bar">
                  <span className="rec-dot" />
                  <span>Merekam suara · {formatDuration(recordingSec)}</span>
                </div>
                <button
                  id="btn-finish-voice-note"
                  type="button"
                  className="composer-send-btn"
                  onClick={finishVoiceRecording}
                  title="Kirim pesan suara"
                  aria-label="Kirim pesan suara"
                >
                  <Send size={16} strokeWidth={1.75} />
                </button>
              </>
            ) : (
              <>
                <button
                  id="btn-composer-attach"
                  type="button"
                  className={`icon-btn ${attachOpen ? 'active' : ''}`}
                  onClick={() => {
                    setAttachOpen((v) => !v);
                    setEmojiOpen(false);
                  }}
                  title="Lampirkan"
                  aria-label="Lampirkan media atau pin kumpul"
                >
                  <Plus size={19} strokeWidth={1.75} />
                </button>

                <textarea
                  ref={textareaRef}
                  id="chat-composer-input"
                  rows={1}
                  className="composer-textarea"
                  placeholder={`Tulis pesan ke ${activeChannel.name}`}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    adjustTextareaHeight(e.target);
                    zonaCloudSync.notifyTyping(e.target.value.trim().length > 0);
                  }}
                  onKeyDown={handleKeyDown}
                />

                <button
                  type="button"
                  className={`icon-btn ${emojiOpen ? 'active' : ''}`}
                  onClick={() => {
                    setEmojiOpen((v) => !v);
                    setAttachOpen(false);
                  }}
                  title="Emoji"
                  aria-label="Pilih emoji"
                >
                  <Smile size={19} strokeWidth={1.75} />
                </button>

                {draft.trim().length > 0 ? (
                  <button
                    id="btn-send-message"
                    type="button"
                    className="composer-send-btn"
                    onClick={submitMessage}
                    title="Kirim pesan"
                    aria-label="Kirim pesan"
                  >
                    <Send size={16} strokeWidth={1.75} />
                  </button>
                ) : (
                  <button
                    id="btn-voice-note"
                    type="button"
                    className="icon-btn"
                    onClick={startVoiceRecording}
                    title="Rekam pesan suara"
                    aria-label="Rekam pesan suara"
                  >
                    <Mic size={19} strokeWidth={1.75} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {snapOpen && (
        <QuickSnapModal
          onClose={() => setSnapOpen(false)}
          onSend={({ caption, viewOnce, mediaUrl }) => {
            const snapMsg = sendQuickSnap(activeChannel.id, caption, viewOnce, mediaUrl);
            void zonaCloudSync.syncSendMessage(snapMsg);
            onNotify('Quick Snap terkirim.');
          }}
        />
      )}

      {reportTarget && (
        <ReportModal
          targetLabel={reportTarget.label}
          onClose={() => setReportTarget(null)}
          onSubmit={(reason) => {
            reportContent({
              targetUserId: reportTarget.userId,
              targetMessageId: reportTarget.messageId,
              reason,
            });
            void zonaCloudSync.syncReportContent({
              targetUserId: reportTarget.userId,
              targetMessageId: reportTarget.messageId,
              reason,
            });
            onNotify('Laporan dikirim untuk ditinjau.');
          }}
        />
      )}

      {viewingSnap && (
        <div className="modal-backdrop" onClick={() => setViewingSnap(null)}>
          <div
            className="modal-sheet"
            style={{
              background: viewingSnap.mediaUrl ? '#111827' : viewingSnap.snapGradient,
              color: '#ffffff',
              minHeight: 400,
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
                className="snap-bubble-img"
              />
            )}
            <div className="modal-head" style={{ position: 'relative', zIndex: 2 }}>
              <span className="snap-pill-top">
                {profiles[viewingSnap.senderId]?.displayName}
              </span>
              <button
                type="button"
                className="snap-pill-top"
                onClick={() => setViewingSnap(null)}
              >
                Tutup
              </button>
            </div>
            <div className="snap-caption-bar" style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{viewingSnap.snapCaption}</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
                {viewingSnap.snapViewOnce
                  ? 'Mode sekali lihat — akan terkunci setelah ditutup.'
                  : 'Otomatis hilang dalam 24 jam.'}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
