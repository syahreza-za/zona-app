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
            <span className="mobile-fab-icon terracotta">
              <MapPin size={16} strokeWidth={2} />
            </span>
            <div>
              <strong>Pin Ajak Kumpul</strong>
              <span>Tandai lokasi & buat ruang otomatis</span>
            </div>
          </button>

          <button
            type="button"
            className="mobile-fab-action"
            onClick={() => {
              setFabMenuOpen(false);
              onOpenQuickSnap();
            }}
          >
            <span className="mobile-fab-icon teal">
              <Camera size={16} strokeWidth={2} />
            </span>
            <div>
              <strong>Bagikan Momen</strong>
              <span>Quick Snap foto 24 jam ke teman</span>
            </div>
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
            <Compass size={19} strokeWidth={world === 'pulse' ? 2.1 : 1.75} />
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
              <MessageSquare size={19} strokeWidth={world === 'ruang' ? 2.1 : 1.75} />
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
            <MapIcon size={19} strokeWidth={world === 'peta' ? 2.1 : 1.75} />
            <span>Peta</span>
          </button>
        </nav>

        <button
          id="mobile-fab-create"
          type="button"
          className={`mobile-capsule-fab ${fabMenuOpen ? 'open' : ''}`}
          onClick={() => setFabMenuOpen((v) => !v)}
          aria-label="Buat Pin Kumpul atau Quick Snap"
          aria-expanded={fabMenuOpen}
        >
          {fabMenuOpen ? <X size={21} strokeWidth={2.2} /> : <Plus size={22} strokeWidth={2.2} />}
        </button>
      </div>
    </div>
  );
}
