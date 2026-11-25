import { Map, MessageCircle, Moon, Sun } from 'lucide-react';
import { useZonaStore } from '@zona/shared';

interface CircleRailProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  showMap: boolean;
  onToggleMap: () => void;
}

export function CircleRail({
  theme,
  onToggleTheme,
  showMap,
  onToggleMap,
}: CircleRailProps) {
  const circles = useZonaStore((s) => s.circles);
  const channels = useZonaStore((s) => s.channels);
  const activeCircleId = useZonaStore((s) => s.activeCircleId);
  const selectCircle = useZonaStore((s) => s.selectCircle);

  const dmUnread = channels
    .filter((ch) => ch.circleId === null)
    .reduce((acc, ch) => acc + ch.unreadCount, 0);

  return (
    <aside className="circle-rail" aria-label="Navigasi Circle">
      <div className="brand-mark" title="ZONA — Chat × Circles × Live Map">
        Z
      </div>

      <div className="rail-divider" />

      <button
        id="rail-dm-btn"
        type="button"
        className={`rail-btn ${activeCircleId === null ? 'active' : ''}`}
        onClick={() => selectCircle(null)}
        title="Pesan Langsung (WhatsApp Fast Chat)"
      >
        <MessageCircle size={20} />
        {dmUnread > 0 && <span className="rail-badge">{dmUnread}</span>}
      </button>

      {circles.map((circle) => {
        const unread = channels
          .filter((ch) => ch.circleId === circle.id)
          .reduce((acc, ch) => acc + ch.unreadCount, 0);
        const isActive = activeCircleId === circle.id;

        return (
          <button
            key={circle.id}
            id={`rail-circle-${circle.id}`}
            type="button"
            className={`rail-btn ${isActive ? 'active' : ''}`}
            onClick={() => selectCircle(circle.id)}
            title={`${circle.name} (${circle.inviteCode})`}
          >
            {circle.shortCode}
            {unread > 0 && <span className="rail-badge">{unread}</span>}
          </button>
        );
      })}

      <div className="rail-spacer" />

      <button
        id="rail-map-toggle"
        type="button"
        className={`rail-btn ${showMap ? 'active' : ''}`}
        onClick={onToggleMap}
        title={showMap ? 'Sembunyikan Live Map' : 'Tampilkan Live Map'}
      >
        <Map size={19} />
      </button>

      <button
        id="rail-theme-toggle"
        type="button"
        className="rail-btn"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'}
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </aside>
  );
}
