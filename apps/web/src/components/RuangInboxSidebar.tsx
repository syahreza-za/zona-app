import { useMemo, useState } from 'react';
import {
  MapPin,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { Avatar } from './Avatar';

type InboxFilter = 'all' | 'dm' | 'circle' | 'hangout';

interface RuangInboxSidebarProps {
  onConversationPicked?: () => void;
  onOpenCircleModal: () => void;
  onNotify: (msg: string) => void;
}

function formatShortTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RuangInboxSidebar({
  onConversationPicked,
  onOpenCircleModal,
  onNotify,
}: RuangInboxSidebarProps) {
  const {
    currentUserId,
    profiles,
    circles,
    channels,
    messages,
    blockedUserIds,
    activeCircleId,
    activeChannelId,
    selectCircle,
    selectChannel,
    startDirectMessage,
  } = useZonaStore();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [newDmOpen, setNewDmOpen] = useState(false);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  const lastMessageByChannel = useMemo(() => {
    const map: Record<string, { text: string; createdAt: string; senderName?: string }> = {};
    for (const msg of messages) {
      if (blockedUserIds.includes(msg.senderId)) continue;
      const existing = map[msg.channelId];
      if (!existing || msg.createdAt > existing.createdAt) {
        map[msg.channelId] = {
          text: msg.isDeleted
            ? 'Pesan dihapus'
            : msg.type === 'quick_snap'
              ? msg.snapCaption || 'Quick Snap 24 jam'
              : msg.type === 'voice_note'
                ? 'Pesan suara'
                : msg.content,
          createdAt: msg.createdAt,
          senderName: profiles[msg.senderId]?.displayName,
        };
      }
    }
    return map;
  }, [messages, blockedUserIds, profiles]);

  // Unified flat list: DMs + Circles (each Circle is a single unified item — NO #channel tree!) + Hangouts
  const unifiedItems = useMemo(() => {
    type InboxEntry =
      | {
          kind: 'dm';
          id: string;
          channelId: string;
          title: string;
          preview: string;
          time: string;
          unread: number;
          pinned?: boolean;
          partnerId?: string;
        }
      | {
          kind: 'circle';
          id: string;
          circleId: string;
          defaultChannelId: string;
          title: string;
          shortCode: string;
          accentColor: string;
          bannerImage?: string;
          topicCount: number;
          preview: string;
          time: string;
          unread: number;
        }
      | {
          kind: 'hangout';
          id: string;
          channelId: string;
          circleId: string;
          title: string;
          subtitle: string;
          accentColor: string;
          preview: string;
          time: string;
          unread: number;
        };

    const entries: InboxEntry[] = [];

    // 1. Direct Messages
    if (filter === 'all' || filter === 'dm') {
      const dms = channels.filter((ch) => ch.type === 'dm' && !ch.isArchived);
      for (const ch of dms) {
        const partnerId = ch.participantIds?.find((id) => id !== currentUserId);
        const partner = partnerId ? profiles[partnerId] : null;
        const last = lastMessageByChannel[ch.id];
        entries.push({
          kind: 'dm',
          id: ch.id,
          channelId: ch.id,
          title: ch.name,
          preview: last?.text ?? partner?.statusText ?? 'Mulai percakapan',
          time: last?.createdAt ?? '',
          unread: ch.unreadCount,
          pinned: ch.isPinned,
          partnerId,
        });
      }
    }

    // 2. Circles (1 unified card per Circle — topics appear horizontally inside the chat canvas!)
    if (filter === 'all' || filter === 'circle') {
      const scopedCircles = activeCircleId
        ? circles.filter((c) => c.id === activeCircleId)
        : circles;
      for (const circle of scopedCircles) {
        const circleChannels = channels.filter(
          (ch) => ch.circleId === circle.id && !ch.isArchived
        );
        if (circleChannels.length === 0) continue;

        // Pick latest active channel inside this circle for preview & default open
        const sorted = [...circleChannels].sort((a, b) => {
          const ta = lastMessageByChannel[a.id]?.createdAt ?? '';
          const tb = lastMessageByChannel[b.id]?.createdAt ?? '';
          return tb.localeCompare(ta);
        });
        const topCh = sorted[0];
        const last = lastMessageByChannel[topCh.id];
        const totalUnread = circleChannels.reduce((s, ch) => s + ch.unreadCount, 0);

        entries.push({
          kind: 'circle',
          id: `circle-${circle.id}`,
          circleId: circle.id,
          defaultChannelId: topCh.id,
          title: circle.name,
          shortCode: circle.shortCode,
          accentColor: circle.accentColor,
          bannerImage: circle.bannerImage,
          topicCount: circleChannels.length,
          preview: last
            ? `${last.senderName ? `${last.senderName}: ` : ''}${last.text}`
            : circle.description,
          time: last?.createdAt ?? '',
          unread: totalUnread,
        });
      }
    }

    // 3. Dedicated Hangout Kumpul Threads (when filter === 'hangout')
    if (filter === 'hangout') {
      const hangouts = channels.filter(
        (ch) =>
          ch.type === 'hangout' &&
          !ch.isArchived &&
          (!activeCircleId || ch.circleId === activeCircleId)
      );
      for (const ch of hangouts) {
        const parent = circles.find((c) => c.id === ch.circleId);
        const last = lastMessageByChannel[ch.id];
        entries.push({
          kind: 'hangout',
          id: ch.id,
          channelId: ch.id,
          circleId: ch.circleId ?? '',
          title: ch.name.replace(/-/g, ' '),
          subtitle: parent?.name ?? 'Kumpul',
          accentColor: parent?.accentColor ?? '#E05A3F',
          preview: last?.text ?? ch.topic ?? 'Ruang koordinasi kumpul',
          time: last?.createdAt ?? '',
          unread: ch.unreadCount,
        });
      }
    }

    const q = query.trim().toLowerCase();
    return entries
      .filter((item) => {
        if (!q) return true;
        return (
          item.title.toLowerCase().includes(q) ||
          item.preview.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aPin = a.kind === 'dm' && a.pinned ? 1 : 0;
        const bPin = b.kind === 'dm' && b.pinned ? 1 : 0;
        if (aPin !== bPin) return bPin - aPin;
        return b.time.localeCompare(a.time);
      });
  }, [
    filter,
    channels,
    circles,
    activeCircleId,
    currentUserId,
    profiles,
    lastMessageByChannel,
    query,
  ]);

  const otherUsers = Object.values(profiles).filter(
    (p) => p.id !== currentUserId && !blockedUserIds.includes(p.id)
  );

  return (
    <aside className="ruang-inbox" aria-label="Daftar Obrolan dan Circle">
      <div className="ruang-inbox-head">
        <h2 className="ruang-inbox-title">Ruang</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className={`icon-btn ${newDmOpen ? 'active' : ''}`}
            onClick={() => setNewDmOpen((v) => !v)}
            title="Mulai obrolan baru"
            aria-label="Obrolan baru"
          >
            <UserPlus size={17} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenCircleModal}
            title="Buat atau gabung Circle"
            aria-label="Kelola Circle"
          >
            <Users size={17} strokeWidth={1.85} />
          </button>
        </div>
      </div>

      {/* New DM Quick Picker */}
      {newDmOpen && (
        <div className="new-dm-drawer">
          <div className="new-dm-head">
            <span>Kirim pesan langsung</span>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 24, height: 24 }}
              onClick={() => setNewDmOpen(false)}
              aria-label="Tutup"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
          <div className="new-dm-list">
            {otherUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className="new-dm-item"
                onClick={() => {
                  const ch = startDirectMessage(u.id);
                  if (ch) {
                    setNewDmOpen(false);
                    onConversationPicked?.();
                    onNotify(`Membuka obrolan dengan ${u.displayName}.`);
                  }
                }}
              >
                <Avatar
                  initials={u.initials}
                  color={u.avatarColor}
                  variant={u.avatarVariant}
                  seed={u.id}
                  avatarUrl={u.avatarUrl}
                  size="xs"
                  online={u.isOnline}
                  showPresence
                />
                <span>{u.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search & Horizontal Filter Pills */}
      <div className="ruang-search-area">
        <div className="ruang-search-box">
          <Search size={15} strokeWidth={1.85} color="var(--text-muted)" />
          <input
            className="ruang-search-input"
            placeholder="Cari percakapan atau circle..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Bersihkan pencarian"
            >
              <X size={14} strokeWidth={2} color="var(--text-muted)" />
            </button>
          )}
        </div>

        <div className="ruang-filter-pills" role="tablist" aria-label="Filter Percakapan">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'dm', label: 'Langsung' },
              { id: 'circle', label: 'Circle' },
              { id: 'hangout', label: 'Kumpul' },
            ] as { id: InboxFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`ruang-filter-pill ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Unified Flat Conversation List */}
      <div className="ruang-inbox-scroll">
        {unifiedItems.length === 0 && (
          <div className="ruang-empty-list">
            <p>Tidak ada obrolan ditemukan.</p>
          </div>
        )}

        {unifiedItems.map((item) => {
          if (item.kind === 'dm') {
            const partner = item.partnerId ? profiles[item.partnerId] : null;
            const selected = activeChannelId === item.channelId;
            return (
              <button
                key={item.id}
                id={`inbox-item-${item.channelId}`}
                type="button"
                className={`inbox-row ${selected ? 'active' : ''}`}
                onClick={() => {
                  selectChannel(item.channelId);
                  onConversationPicked?.();
                }}
              >
                <Avatar
                  initials={partner?.initials ?? 'ZN'}
                  color={partner?.avatarColor ?? '#E05A3F'}
                  variant={partner?.avatarVariant ?? 0}
                  seed={item.partnerId ?? item.id}
                  avatarUrl={partner?.avatarUrl}
                  size="md"
                  online={partner?.isOnline}
                  showPresence
                />
                <div className="inbox-row-body">
                  <div className="inbox-row-top">
                    <strong className="inbox-row-title">{item.title}</strong>
                    <span className="meta-text">{formatShortTime(item.time)}</span>
                  </div>
                  <div className="inbox-row-bottom">
                    <span className="inbox-row-preview">{item.preview}</span>
                    {item.unread > 0 && <span className="unread-badge">{item.unread}</span>}
                  </div>
                </div>
              </button>
            );
          }

          if (item.kind === 'circle') {
            const selected = activeChannel?.circleId === item.circleId;
            return (
              <button
                key={item.id}
                id={`inbox-circle-${item.circleId}`}
                type="button"
                className={`inbox-row ${selected ? 'active' : ''}`}
                onClick={() => {
                  selectCircle(item.circleId);
                  // Keep current channel if already inside this circle, else pick most recent topic
                  if (activeChannel?.circleId !== item.circleId) {
                    selectChannel(item.defaultChannelId);
                  }
                  onConversationPicked?.();
                }}
              >
                <div
                  className="inbox-circle-emblem"
                  style={{ background: item.accentColor }}
                >
                  {item.bannerImage ? (
                    <img src={item.bannerImage} alt={item.title} className="inbox-circle-img" />
                  ) : (
                    <span>{item.shortCode}</span>
                  )}
                </div>
                <div className="inbox-row-body">
                  <div className="inbox-row-top">
                    <strong className="inbox-row-title">{item.title}</strong>
                    <span className="meta-text">{formatShortTime(item.time)}</span>
                  </div>
                  <div className="inbox-row-bottom">
                    <span className="inbox-row-preview">{item.preview}</span>
                    {item.unread > 0 ? (
                      <span className="unread-badge">{item.unread}</span>
                    ) : (
                      <span className="inbox-topic-count">{item.topicCount} topik</span>
                    )}
                  </div>
                </div>
              </button>
            );
          }

          const selected = activeChannelId === item.channelId;
          return (
            <button
              key={item.id}
              type="button"
              className={`inbox-row ${selected ? 'active' : ''}`}
              onClick={() => {
                if (item.circleId) selectCircle(item.circleId);
                selectChannel(item.channelId);
                onConversationPicked?.();
              }}
            >
              <div
                className="inbox-circle-emblem"
                style={{ background: item.accentColor }}
              >
                <MapPin size={17} strokeWidth={2} />
              </div>
              <div className="inbox-row-body">
                <div className="inbox-row-top">
                  <strong className="inbox-row-title" style={{ textTransform: 'capitalize' }}>
                    {item.title}
                  </strong>
                  <span className="meta-text">{formatShortTime(item.time)}</span>
                </div>
                <div className="inbox-row-bottom">
                  <span className="inbox-row-preview">
                    {item.subtitle} · {item.preview}
                  </span>
                  {item.unread > 0 && <span className="unread-badge">{item.unread}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
