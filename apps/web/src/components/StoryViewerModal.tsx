import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Send, X } from 'lucide-react';
import { useZonaStore, type Message } from '@zona/shared';
import { Avatar } from './Avatar';

interface StoryViewerModalProps {
  stories: Message[];
  initialIndex: number;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

const STORY_DURATION_MS = 5500;

function formatRelativeTime(iso: string): string {
  const diffMin = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const hrs = Math.floor(diffMin / 60);
  return `${hrs} jam lalu`;
}

export function StoryViewerModal({
  stories,
  initialIndex,
  onClose,
  onNotify,
}: StoryViewerModalProps) {
  const profiles = useZonaStore((s) => s.profiles);
  const markSnapViewed = useZonaStore((s) => s.markSnapViewed);
  const sendTextMessage = useZonaStore((s) => s.sendTextMessage);
  const startDirectMessage = useZonaStore((s) => s.startDirectMessage);

  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState('');
  const [paused, setPaused] = useState(false);

  const current = stories[index];
  const sender = current ? profiles[current.senderId] : null;

  useEffect(() => {
    if (!current) return;
    markSnapViewed(current.id);
    setProgress(0);
  }, [current?.id, markSnapViewed]);

  useEffect(() => {
    if (!current || paused) return;
    const stepMs = 50;
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + (stepMs / STORY_DURATION_MS) * 100;
        if (next >= 100) {
          if (index < stories.length - 1) {
            setIndex((i) => i + 1);
            return 0;
          }
          onClose();
          return 100;
        }
        return next;
      });
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [current, paused, index, stories.length, onClose]);

  if (!current || !sender) return null;

  const handleQuickReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply.trim()) return;
    const dm = startDirectMessage(sender.id);
    if (dm) {
      sendTextMessage(dm.id, `Membalas Snap: ${reply.trim()}`);
      onNotify(`Balasan dikirim ke ${sender.displayName}.`);
    }
    setReply('');
    onClose();
  };

  return (
    <div className="story-backdrop" onClick={onClose}>
      <div
        className="story-stage"
        style={{
          background: current.mediaUrl ? '#0F172A' : current.snapGradient,
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
      >
        {current.mediaUrl && (
          <img
            src={current.mediaUrl}
            alt={current.snapCaption ?? 'Quick Snap'}
            className="story-media-bg"
          />
        )}

        {/* Top Segmented Progress Bars */}
        <div className="story-top-chrome">
          <div className="story-progress-track">
            {stories.map((s, idx) => (
              <div key={s.id} className="story-progress-seg">
                <div
                  className="story-progress-fill"
                  style={{
                    width:
                      idx < index
                        ? '100%'
                        : idx === index
                          ? `${Math.min(100, progress)}%`
                          : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          <div className="story-header-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Avatar
                initials={sender.initials}
                color={sender.avatarColor}
                variant={sender.avatarVariant}
                seed={sender.id}
                avatarUrl={sender.avatarUrl}
                size="sm"
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>
                  {sender.displayName}
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.78)' }}>
                  {formatRelativeTime(current.createdAt)} · 24 jam
                </div>
              </div>
            </div>
            <button
              type="button"
              className="story-icon-btn"
              onClick={onClose}
              aria-label="Tutup"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Prev / Next Navigation Hit Zones */}
        {index > 0 && (
          <button
            type="button"
            className="story-nav-btn left"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            aria-label="Sebelumnya"
          >
            <ChevronLeft size={22} strokeWidth={2} />
          </button>
        )}
        {index < stories.length - 1 && (
          <button
            type="button"
            className="story-nav-btn right"
            onClick={() => setIndex((i) => Math.min(stories.length - 1, i + 1))}
            aria-label="Berikutnya"
          >
            <ChevronRight size={22} strokeWidth={2} />
          </button>
        )}

        {/* Bottom Caption & Quick Reply */}
        <div className="story-bottom-chrome">
          <div className="story-caption-card">
            <div style={{ fontSize: 16, fontWeight: 600 }}>{current.snapCaption}</div>
            {current.content && current.content !== current.snapCaption && (
              <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 3 }}>
                {current.content}
              </div>
            )}
          </div>

          <form className="story-reply-form" onSubmit={handleQuickReply}>
            <input
              className="story-reply-input"
              placeholder={`Balas ${sender.displayName}...`}
              value={reply}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              onChange={(e) => setReply(e.target.value)}
            />
            <button type="submit" className="story-send-btn" aria-label="Kirim balasan">
              <Send size={15} strokeWidth={2} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
