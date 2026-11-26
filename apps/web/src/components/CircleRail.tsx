import { Map, MessageCircle, Plus, Settings } from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { Avatar } from './Avatar';

interface CircleRailProps {
  fullMapMode: boolean;
  onToggleFullMap: () => void;
  onSelectChatSpace: () => void;
  onOpenCircleModal: () => void;
  onOpenSettings: () => void;
}

export function CircleRail({
  fullMapMode,
  onToggleFullMap,
  onSelectChatSpace,
  onOpenCircleModal,
  onOpenSettings,
}: CircleRailProps) {
  const currentUserId = useZonaStore((s) => s.currentUserId);
  const profiles = useZonaStore((s) => s.profiles);
  const circles = useZonaStore((s) => s.circles);
  const channels = useZonaStore((s) => s.channels);
  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const selectCircle = useZonaStore((s) => s.selectCircle);

  const me = profiles[currentUserId];
  const dmUnread = channels
    .filter((ch) => ch.circleId === null && !ch.isArchived)
    .reduce((acc, ch) => acc + ch.unreadCount, 0);

  return (
    <aside className="circle-rail" aria-label="Navigasi Ruang">
      <button
        id="rail-dm-btn"
        type="button"
        className={`rail-btn ${!fullMapMode && activeCircleId === null ? 'active' : ''}`}
        onClick={() => {
          selectCircle(null);
          onSelectChatSpace();
        }}
        title="Pesan Langsung"
        aria-label="Pesan Langsung"
      >
        <MessageCircle size={20} strokeWidth={1.75} />
        {dmUnread > 0 && <span className="rail-badge">{dmUnread}</span>}
      </button>

      <div className="rail-divider" />

      {circles.map((circle) => {
        const unread = channels
          .filter((ch) => ch.circleId === circle.id && !ch.isArchived)
          .reduce((acc, ch) => acc + ch.unreadCount, 0);
        const isActive = !fullMapMode && activeCircleId === circle.id;

        return (
          <button
            key={circle.id}
            id={`rail-circle-${circle.id}`}
            type="button"
            className={`rail-btn ${isActive ? 'active' : ''}`}
            style={
              isActive
                ? { background: circle.accentColor, color: '#FFFFFF' }
                : undefined
            }
            onClick={() => {
              selectCircle(circle.id);
              onSelectChatSpace();
            }}
            title={circle.name}
            aria-label={circle.name}
          >
            {circle.shortCode}
            {unread > 0 && (
              <span className="rail-badge" style={{ background: circle.accentColor }}>
                {unread}
              </span>
            )}
          </button>
        );
      })}

      <button
        id="rail-add-circle"
        type="button"
        className="rail-btn subtle"
        onClick={onOpenCircleModal}
        title="Buat atau Gabung Circle"
        aria-label="Buat atau Gabung Circle"
      >
        <Plus size={19} strokeWidth={1.75} />
      </button>

      <div className="rail-spacer" />

      <button
        id="rail-fullmap-btn"
        type="button"
        className={`rail-btn subtle ${fullMapMode ? 'active' : ''}`}
        onClick={onToggleFullMap}
        title={fullMapMode ? 'Kembali ke Obrolan' : 'Buka Peta Layar Penuh'}
        aria-label="Peta"
      >
        <Map size={19} strokeWidth={1.75} />
      </button>

      <button
        id="rail-settings-btn"
        type="button"
        className="rail-btn subtle"
        onClick={onOpenSettings}
        title="Pengaturan"
        aria-label="Pengaturan"
      >
        <Settings size={19} strokeWidth={1.75} />
      </button>

      {me && (
        <button
          id="rail-profile-btn"
          type="button"
          className="rail-avatar-btn"
          onClick={onOpenSettings}
          title={me.displayName}
          aria-label="Profil Saya"
        >
          <Avatar
            initials={me.initials}
            color={me.avatarColor}
            variant={me.avatarVariant}
            seed={me.id}
            avatarUrl={me.avatarUrl}
            size="sm"
            online={me.isOnline}
            showPresence
          />
        </button>
      )}
    </aside>
  );
}
