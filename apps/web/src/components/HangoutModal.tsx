import { useEffect, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import type { Coordinates, PlaceSuggestion } from '@zona/shared';
import { searchRealPlaces } from '../services/geocoder';

interface HangoutModalProps {
  initialCoords: Coordinates;
  initialPlace: string;
  onClose: () => void;
  onConfirm: (payload: {
    placeName: string;
    title: string;
    startsAtLabel: string;
    coords: Coordinates;
  }) => void;
}

export function HangoutModal({
  initialCoords,
  initialPlace,
  onClose,
  onConfirm,
}: HangoutModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const [placeName, setPlaceName] = useState(initialPlace);
  const [title, setTitle] = useState('Ngopi Sore');
  const [startsAtLabel, setStartsAtLabel] = useState('Hari ini · 19.00 WIB');
  const [coords, setCoords] = useState<Coordinates>(initialCoords);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const results = await searchRealPlaces(searchQuery, initialCoords);
      if (!cancelled) {
        setSuggestions(results);
        setSearching(false);
      }
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, initialCoords]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeName.trim()) return;
    onConfirm({ placeName, title, startsAtLabel, coords });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} strokeWidth={1.75} color="var(--accent)" />
            <h3>Ajak Kumpul</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <label className="field-label">
          Cari Tempat
          <div className="sidebar-search-box">
            <Search size={15} strokeWidth={1.75} className="sidebar-search-icon" />
            <input
              className="field-input"
              style={{ paddingLeft: 32 }}
              placeholder="Ketik nama kafe, taman, atau lokasi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {searching && <span className="meta-text">Mencari lokasi...</span>}
          {!searching &&
            suggestions.slice(0, 3).map((item) => (
              <button
                key={item.id}
                type="button"
                className="map-search-result"
                style={{ background: 'var(--bg-input)' }}
                onClick={() => {
                  setPlaceName(item.name);
                  setCoords(item.point);
                }}
              >
                <strong style={{ fontSize: 13 }}>{item.name}</strong>
                <span className="meta-text">{item.subtitle}</span>
              </button>
            ))}
        </div>

        <label className="field-label">
          Lokasi ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
          <input
            id="hangout-place-input"
            className="field-input"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            required
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label className="field-label">
            Agenda
            <input
              id="hangout-title-input"
              className="field-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Waktu
            <input
              id="hangout-time-input"
              className="field-input"
              value={startsAtLabel}
              onChange={(e) => setStartsAtLabel(e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button id="btn-confirm-hangout" type="submit" className="btn-primary">
            Buat Pin &amp; Kanal
          </button>
        </div>
      </form>
    </div>
  );
}
