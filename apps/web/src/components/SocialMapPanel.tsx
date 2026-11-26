import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Battery,
  Compass,
  Crosshair,
  Eye,
  EyeOff,
  Globe,
  Layers,
  MapPin,
  Navigation,
  Shield,
} from 'lucide-react';
import {
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  resolveVisibleCoordinates,
  useZonaStore,
  type Coordinates,
  type PrivacyMode,
} from '@zona/shared';
import { getBrowserGps } from '../services/geocoder';

interface SocialMapPanelProps {
  onRequestPinAt: (coords: Coordinates, placeGuess: string) => void;
  highlightedPinId?: string | null;
  onNotify: (msg: string) => void;
}

const BOUNDS = {
  minLat: -6.272,
  maxLat: -6.222,
  minLng: 106.786,
  maxLng: 106.826,
};

function projectToPercent(point: Coordinates): { x: number; y: number } {
  const x = ((point.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - point.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return {
    x: Math.max(8, Math.min(92, x)),
    y: Math.max(10, Math.min(88, y)),
  };
}

function unprojectPercent(xPct: number, yPct: number): Coordinates {
  const lng = BOUNDS.minLng + (xPct / 100) * (BOUNDS.maxLng - BOUNDS.minLng);
  const lat = BOUNDS.maxLat - (yPct / 100) * (BOUNDS.maxLat - BOUNDS.minLat);
  return {
    lat: Number(lat.toFixed(5)),
    lng: Number(lng.toFixed(5)),
  };
}

export function SocialMapPanel({
  onRequestPinAt,
  highlightedPinId,
  onNotify,
}: SocialMapPanelProps) {
  const {
    currentUserId,
    profiles,
    locations,
    hangoutPins,
    blockedUserIds,
    selectedMapUserId,
    setSelectedMapUser,
    setMyPrivacyMode,
    updateMyCoordinates,
    selectChannel,
  } = useZonaStore();

  const [mapEngine, setMapEngine] = useState<'stylized' | 'maplibre'>('stylized');
  const [locating, setLocating] = useState(false);
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';

  const visibleFriends = Object.values(locations)
    .filter((loc) => !blockedUserIds.includes(loc.userId))
    .map((loc) => {
      const visiblePoint = resolveVisibleCoordinates(
        loc.point,
        loc.privacyMode,
        loc.userId
      );
      return {
        loc,
        profile: profiles[loc.userId],
        visiblePoint,
      };
    })
    .filter((entry) => entry.profile && entry.visiblePoint !== null);

  const handleUseRealGps = async () => {
    setLocating(true);
    try {
      const gps = await getBrowserGps();
      updateMyCoordinates(gps, 'GPS Aktif');
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo({ center: [gps.lng, gps.lat], zoom: 14.5 });
      }
      onNotify(`Lokasi GPS diperbarui (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gagal mengakses GPS perangkat.');
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (mapEngine !== 'maplibre' || !mapHostRef.current) return;

    const styleUrl =
      import.meta.env.VITE_MAP_STYLE_URL ||
      'https://tiles.openfreemap.org/styles/liberty';

    const centerPoint = myLocation?.point ?? { lat: -6.248, lng: 106.8065 };
    const map = new maplibregl.Map({
      container: mapHostRef.current,
      style: styleUrl,
      center: [centerPoint.lng, centerPoint.lat],
      zoom: 13.2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('click', (evt) => {
      onRequestPinAt(
        {
          lat: Number(evt.lngLat.lat.toFixed(5)),
          lng: Number(evt.lngLat.lng.toFixed(5)),
        },
        'Titik Pilihan Peta'
      );
    });

    visibleFriends.forEach(({ loc, profile, visiblePoint }) => {
      if (!visiblePoint) return;
      const el = document.createElement('div');
      el.className = 'map-avatar-pin';
      el.style.background = profile.avatarColor;
      el.textContent = profile.initials;
      el.title = `${profile.displayName} • ${loc.activityEmoji} ${loc.activityText}`;
      new maplibregl.Marker({ element: el })
        .setLngLat([visiblePoint.lng, visiblePoint.lat])
        .addTo(map);
    });

    hangoutPins.forEach((pin) => {
      const el = document.createElement('div');
      el.className = 'hangout-pin-badge';
      el.textContent = `📍 ${pin.placeName}`;
      el.onclick = () => selectChannel(pin.channelId);
      new maplibregl.Marker({ element: el })
        .setLngLat([pin.point.lng, pin.point.lat])
        .addTo(map);
    });

    mapInstanceRef.current = map;
    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [mapEngine, hangoutPins.length, myPrivacy, myLocation?.point.lat, myLocation?.point.lng]);

  const handleStylizedClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const coords = unprojectPercent(xPct, yPct);
    const guess =
      yPct < 42 ? 'Area Senopati / SCBD' : xPct > 55 ? 'Area Kemang Raya' : 'Area Blok M';
    onRequestPinAt(coords, guess);
  };

  const selectedEntry = selectedMapUserId
    ? visibleFriends.find((f) => f.loc.userId === selectedMapUserId)
    : null;

  return (
    <aside className="map-panel" aria-label="Live Social Map">
      <header className="map-header">
        <div className="map-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Compass size={17} color="var(--accent-yellow)" />
            <strong style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
              Live Social Map
            </strong>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="pill-action"
              onClick={handleUseRealGps}
              disabled={locating}
              title="Perbarui titik dari GPS perangkat"
            >
              <Crosshair size={13} />
              <span>{locating ? '...' : 'GPS'}</span>
            </button>
            <button
              id="btn-toggle-map-engine"
              type="button"
              className="pill-action"
              onClick={() =>
                setMapEngine((m) => (m === 'stylized' ? 'maplibre' : 'stylized'))
              }
              title="Ganti antara Peta Ilustrasi Offline & MapLibre Vector Live"
            >
              {mapEngine === 'stylized' ? (
                <>
                  <Globe size={13} />
                  <span>Vector</span>
                </>
              ) : (
                <>
                  <Layers size={13} />
                  <span>Ilustrasi</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="privacy-segment" role="group" aria-label="Mode Privasi Peta">
          {(
            [
              { mode: 'exact', label: 'Tepat', icon: Eye },
              { mode: 'fuzzy', label: 'Area', icon: Shield },
              { mode: 'ghost', label: 'Ghost', icon: EyeOff },
            ] as { mode: PrivacyMode; label: string; icon: typeof Eye }[]
          ).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              id={`privacy-btn-${mode}`}
              type="button"
              className={`privacy-btn ${myPrivacy === mode ? `active ${mode}` : ''}`}
              onClick={() => {
                setMyPrivacyMode(mode);
                onNotify(`Mode lokasi diubah ke ${label}.`);
              }}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="map-viewport">
        {mapEngine === 'maplibre' ? (
          <div ref={mapHostRef} className="maplibre-host" />
        ) : (
          <div
            id="stylized-social-map"
            className="stylized-map"
            onClick={handleStylizedClick}
            title="Klik titik mana saja di peta untuk membuat Pin Ajak Kumpul"
          >
            <svg className="map-svg-roads" viewBox="0 0 400 420" preserveAspectRatio="none">
              <path
                d="M 10 95 Q 150 115 390 65"
                stroke="rgba(148,163,184,0.22)"
                strokeWidth="4"
                fill="none"
              />
              <path
                d="M 75 10 Q 115 210 190 410"
                stroke="rgba(148,163,184,0.25)"
                strokeWidth="5"
                fill="none"
              />
              <path
                d="M 270 15 Q 250 190 315 410"
                stroke="rgba(250,204,21,0.18)"
                strokeWidth="4"
                fill="none"
              />
              <path
                d="M 10 260 Q 195 235 390 295"
                stroke="rgba(148,163,184,0.2)"
                strokeWidth="3.5"
                fill="none"
              />
              <circle cx="145" cy="185" r="24" fill="rgba(34,197,94,0.12)" />
              <circle cx="285" cy="315" r="30" fill="rgba(249,115,22,0.11)" />
            </svg>

            <span className="map-district-label" style={{ left: '54%', top: '16%' }}>
              SENOPATI · SCBD
            </span>
            <span className="map-district-label" style={{ left: '16%', top: '46%' }}>
              BLOK M
            </span>
            <span className="map-district-label" style={{ left: '56%', top: '76%' }}>
              KEMANG RAYA
            </span>

            {visibleFriends.map(({ loc, profile, visiblePoint }) => {
              if (!visiblePoint) return null;
              const pos = projectToPercent(visiblePoint);
              const isSelected = selectedMapUserId === loc.userId;
              return (
                <div
                  key={loc.userId}
                  className="map-pin-node"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMapUser(isSelected ? null : loc.userId);
                  }}
                >
                  {loc.privacyMode === 'fuzzy' && <div className="fuzzy-ring" />}
                  <div
                    className="map-avatar-pin"
                    style={{
                      background: profile.avatarColor,
                      transform: isSelected ? 'scale(1.14)' : undefined,
                    }}
                  >
                    {profile.initials}
                  </div>
                  <span className="map-status-bubble">
                    {loc.activityEmoji} {profile.displayName}
                  </span>
                </div>
              );
            })}

            {hangoutPins.map((pin) => {
              const pos = projectToPercent(pin.point);
              const isHighlighted = highlightedPinId === pin.id;
              return (
                <button
                  key={pin.id}
                  type="button"
                  className="hangout-map-pin"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: isHighlighted
                      ? 'translate(-50%, -50%) scale(1.12)'
                      : undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectChannel(pin.channelId);
                  }}
                >
                  <span className="hangout-pin-badge">
                    <MapPin size={12} />
                    {pin.placeName}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="map-bottom-card">
        {selectedEntry && selectedEntry.visiblePoint && myLocation ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: 13 }}>
                {selectedEntry.profile.displayName} · {selectedEntry.loc.activityEmoji}{' '}
                {selectedEntry.loc.activityText}
              </strong>
              <p className="channel-meta" style={{ marginTop: 2 }}>
                {selectedEntry.loc.areaLabel} ·{' '}
                {selectedEntry.loc.privacyMode === 'fuzzy'
                  ? 'Mode Area (~400m)'
                  : `${formatDistanceLabel(
                      distanceMeters(myLocation.point, selectedEntry.visiblePoint)
                    )} · ~${estimateEtaMinutes(
                      myLocation.point,
                      selectedEntry.visiblePoint
                    )} mnt`}
              </p>
            </div>
            <span className="pill-action" style={{ fontSize: 11 }}>
              <Battery size={12} /> {selectedEntry.loc.batteryPct}%
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="channel-meta" style={{ margin: 0 }}>
              <Navigation size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Tap area peta untuk bikin <strong>Pin Ajak Kumpul</strong>
            </span>
            <span className="channel-meta" style={{ margin: 0 }}>
              {visibleFriends.length} aktif
            </span>
          </div>
        )}

        <div className="friend-strip">
          {visibleFriends.map(({ loc, profile }) => (
            <button
              key={loc.userId}
              type="button"
              className={`friend-mini-card ${
                selectedMapUserId === loc.userId ? 'selected' : ''
              }`}
              onClick={() => setSelectedMapUser(loc.userId)}
            >
              <span
                className="avatar sm"
                style={{ background: profile.avatarColor }}
              >
                {profile.initials}
              </span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {profile.displayName}
                </div>
                <div className="channel-meta" style={{ fontSize: 10 }}>
                  {loc.activityEmoji} {loc.areaLabel}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
