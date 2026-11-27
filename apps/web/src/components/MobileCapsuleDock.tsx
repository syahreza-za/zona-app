import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Compass,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Plus,
  X,
} from 'lucide-react';
import type { HorizonWorld } from './HorizonBar';

interface MobileCapsuleDockProps {
  world: HorizonWorld;
  unreadCount: number;
  onChangeWorld: (world: HorizonWorld) => void;
  onOpenHangoutModal: () => void;
  onOpenQuickSnap: () => void;
}

export function MobileCapsuleDock({
  world,
  unreadCount,
  onChangeWorld,
  onOpenHangoutModal,
  onOpenQuickSnap,
}: MobileCapsuleDockProps) {
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fabMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setFabMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [fabMenuOpen]);

  return (
    <div className="mobile-dock-wrap" ref={fabRef}>
      {fabMenuOpen && (
        <div className="mobile-fab-popover" role="menu">
          <button
            type="button"
            className="mobile-fab-action"
            onClick={() => {
              setFabMenuOpen(false);
              onOpenHangoutModal();
            }}
          >
            <MapPin size={16} strokeWidth={1.9} />
            <span>Buat Pin Kumpul</span>
          </button>

          <button
            type="button"
            className="mobile-fab-action"
            onClick={() => {
              setFabMenuOpen(false);
              onOpenQuickSnap();
            }}
          >
            <Camera size={16} strokeWidth={1.9} />
            <span>Unggah Momen</span>
          </button>
        </div>
      )}

      <div className="mobile-dock-bar">
        <nav className="mobile-capsule-nav" aria-label="Navigasi Mobile ZONA">
          <button
            id="mobile-tab-pulse"
            type="button"
            className={`mobile-capsule-btn ${world === 'pulse' ? 'active' : ''}`}
            onClick={() => {
              setFabMenuOpen(false);
              onChangeWorld('pulse');
            }}
          >
            <Compass size={18} strokeWidth={world === 'pulse' ? 2 : 1.7} />
            <span>Pulse</span>
          </button>

          <button
            id="mobile-tab-ruang"
            type="button"
            className={`mobile-capsule-btn ${world === 'ruang' ? 'active' : ''}`}
            onClick={() => {
              setFabMenuOpen(false);
              onChangeWorld('ruang');
            }}
          >
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <MessageSquare size={18} strokeWidth={world === 'ruang' ? 2 : 1.7} />
              {unreadCount > 0 && <span className="mobile-capsule-dot" />}
            </span>
            <span>Ruang</span>
          </button>

          <button
            id="mobile-tab-peta"
            type="button"
            className={`mobile-capsule-btn ${world === 'peta' ? 'active' : ''}`}
            onClick={() => {
              setFabMenuOpen(false);
              onChangeWorld('peta');
            }}
          >
            <MapIcon size={18} strokeWidth={world === 'peta' ? 2 : 1.7} />
            <span>Peta</span>
          </button>
        </nav>

        <button
          id="mobile-fab-create"
          type="button"
          className={`mobile-capsule-fab ${fabMenuOpen ? 'open' : ''}`}
          onClick={() => setFabMenuOpen((v) => !v)}
          aria-label="Buat Pin atau Momen"
          aria-expanded={fabMenuOpen}
        >
          {fabMenuOpen ? <X size={19} strokeWidth={2} /> : <Plus size={20} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
