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
  const [title, setTitle] = useState('Nongkrong & Ngopi Sore');
  const [startsAtLabel, setStartsAtLabel] = useState('Hari ini • 19.00 WIB');
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
    }, 260);
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
        <div className="map-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="var(--accent-coral)" />
            <h3>Buat Pin Ajak Kumpul</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <label className="field-label">
          Cari Tempat Nyata (OpenStreetMap)
          <div style={{ position: 'relative' }}>
            <input
              className="field-input"
              style={{ width: '100%', paddingLeft: 34 }}
              placeholder="Ketik nama kafe, mall, atau taman..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 11,
                top: 13,
                color: 'var(--text-muted)',
              }}
            />
          </div>
        </label>

        <div className="place-suggestions">
          {searching && <span className="channel-meta">Mencari lokasi...</span>}
          {!searching &&
            suggestions.slice(0, 4).map((item) => (
              <button
                key={item.id}
                type="button"
                className="place-suggestion-btn"
                onClick={() => {
                  setPlaceName(item.name);
                  setCoords(item.point);
                }}
              >
                <strong>{item.name}</strong>
                <span className="channel-meta">{item.subtitle}</span>
              </button>
            ))}
        </div>

        <label className="field-label">
          Nama Lokasi Terpilih ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
          <input
            id="hangout-place-input"
            className="field-input"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
            required
          />
        </label>

        <label className="field-label">
          Agenda Singkat
          <input
            id="hangout-title-input"
            className="field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </label>

        <label className="field-label">
          Waktu Kumpul
          <input
            id="hangout-time-input"
            className="field-input"
            value={startsAtLabel}
            onChange={(e) => setStartsAtLabel(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="pill-action" onClick={onClose}>
            Batal
          </button>
          <button id="btn-confirm-hangout" type="submit" className="pill-action primary">
            Taruh Pin &amp; Buat Kanal
          </button>
        </div>
      </form>
    </div>
  );
}
