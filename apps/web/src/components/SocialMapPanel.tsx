import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Battery,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  MapPin,
  Plus,
  Search,
  Shield,
  X,
} from 'lucide-react';
import {
  clusterMapMarkers,
  distanceMeters,
  estimateEtaMinutes,
  formatDistanceLabel,
  resolveVisibleCoordinates,
  useZonaStore,
  type Coordinates,
  type PlaceSuggestion,
  type PrivacyMode,
} from '@zona/shared';
import { Avatar } from './Avatar';
import { buildDirectionsUrl, getBrowserGps, searchRealPlaces } from '../services/geocoder';

interface SocialMapPanelProps {
  theme: 'dark' | 'light';
  onRequestPinAt: (coords: Coordinates, placeGuess: string) => void;
  highlightedPinId?: string | null;
  onCloseDrawer?: () => void;
  onSelectHangoutChannel?: () => void;
  onNotify: (msg: string) => void;
}

type SheetSnap = 'peek' | 'half' | 'expanded';

const BOUNDS = {
  minLat: -6.274,
  maxLat: -6.22,
  minLng: 106.784,
  maxLng: 106.828,
};

function projectToPercent(point: Coordinates): { x: number; y: number } {
  const x = ((point.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - point.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return {
    x: Math.max(8, Math.min(92, x)),
    y: Math.max(14, Math.min(78, y)),
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
  theme,
  onRequestPinAt,
  highlightedPinId,
  onCloseDrawer,
  onSelectHangoutChannel,
  onNotify,
}: SocialMapPanelProps) {
  const {
    currentUserId,
    profiles,
    circles,
    locations,
    hangoutPins,
    blockedUserIds,
    selectedMapUserId,
    setSelectedMapUser,
    setMyPrivacyMode,
    updateMyCoordinates,
    selectChannel,
  } = useZonaStore();

  const [useVectorMap, setUseVectorMap] = useState(true);
  const [circleFilter, setCircleFilter] = useState<string>('all');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<PlaceSuggestion[]>([]);
  const [locating, setLocating] = useState(false);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('peek');

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const dragStartY = useRef<number | null>(null);

  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';

  const visibleFriends = useMemo(() => {
    const circle = circleFilter === 'all' ? null : circles.find((c) => c.id === circleFilter);
    return Object.values(locations)
      .filter((loc) => !blockedUserIds.includes(loc.userId))
      .filter((loc) => (!circle ? true : circle.memberIds.includes(loc.userId)))
      .map((loc) => {
        const visiblePoint = resolveVisibleCoordinates(
          loc.point,
          loc.privacyMode,
          loc.userId
        );
        return {
          userId: loc.userId,
          point: visiblePoint ?? loc.point,
          loc,
          profile: profiles[loc.userId],
          visiblePoint,
        };
      })
      .filter((entry) => entry.profile && entry.visiblePoint !== null);
  }, [locations, blockedUserIds, circles, circleFilter, profiles]);

  const clusters = useMemo(
    () => clusterMapMarkers(visibleFriends, 260),
    [visibleFriends]
  );

  // Place search via Photon OpenStreetMap
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setPlaceResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      const res = await searchRealPlaces(q, myLocation?.point);
      if (active) setPlaceResults(res.slice(0, 4));
    }, 240);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [placeQuery, myLocation?.point]);

  // MapLibre GL initialization synced with Light/Dark theme
  useEffect(() => {
    if (!useVectorMap || !mapHostRef.current) return;

    const styleUrl =
      import.meta.env.VITE_MAP_STYLE_URL ||
      (theme === 'dark'
        ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        : 'https://tiles.openfreemap.org/styles/positron');

    const centerPoint = myLocation?.point ?? { lat: -6.248, lng: 106.8065 };
    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: mapHostRef.current,
        style: styleUrl,
        center: [centerPoint.lng, centerPoint.lat],
        zoom: 13.1,
        attributionControl: false,
      });
    } catch {
      setUseVectorMap(false);
      return;
    }

    let tileErrorCount = 0;
    map.on('error', () => {
      tileErrorCount += 1;
      if (tileErrorCount >= 2) {
        setUseVectorMap(false);
      }
    });

    map.on('click', (evt) => {
      onRequestPinAt(
        {
          lat: Number(evt.lngLat.lat.toFixed(5)),
          lng: Number(evt.lngLat.lng.toFixed(5)),
        },
        'Titik Pilihan Peta'
      );
    });

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [useVectorMap, theme]);

  // Sync markers on MapLibre GL
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !useVectorMap) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    clusters.forEach((cluster) => {
      const el = document.createElement('div');
      el.style.display = 'flex';
      el.style.flexDirection = 'column';
      el.style.alignItems = 'center';
      el.style.cursor = 'pointer';

      if (cluster.isCluster) {
        const badge = document.createElement('div');
        badge.className = 'map-cluster-badge';
        badge.textContent = `+${cluster.items.length}`;
        el.appendChild(badge);
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [cluster.point.lng, cluster.point.lat], zoom: 15.2 });
        };
      } else {
        const entry = cluster.items[0];
        if (entry.loc.privacyMode === 'fuzzy') {
          const halo = document.createElement('div');
          halo.className = 'map-fuzzy-halo';
          el.appendChild(halo);
        }
        const ring = document.createElement('div');
        ring.className = 'map-marker-ring';
        ring.style.background = entry.profile.avatarColor;
        ring.textContent = entry.profile.initials;
        el.appendChild(ring);

        const tag = document.createElement('span');
        tag.className = 'map-marker-tag';
        tag.textContent = entry.profile.displayName;
        el.appendChild(tag);

        el.onclick = (e) => {
          e.stopPropagation();
          setSelectedMapUser(entry.userId);
          setSheetSnap('half');
        };
      }

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([cluster.point.lng, cluster.point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    hangoutPins.forEach((pin) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hangout-pin-pill ${highlightedPinId === pin.id ? 'highlighted' : ''}`;
      el.style.position = 'static';
      el.style.transform = 'none';
      el.textContent = pin.placeName;
      el.onclick = (e) => {
        e.stopPropagation();
        selectChannel(pin.channelId);
        onSelectHangoutChannel?.();
      };
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.point.lng, pin.point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [clusters, hangoutPins, highlightedPinId, useVectorMap, selectChannel, setSelectedMapUser, onSelectHangoutChannel]);

  const handleRecenterGps = async () => {
    setLocating(true);
    try {
      const gps = await getBrowserGps();
      updateMyCoordinates(gps, 'Lokasi Saat Ini');
      mapRef.current?.flyTo({ center: [gps.lng, gps.lat], zoom: 14.5 });
      onNotify('Lokasi diperbarui dari GPS.');
    } catch {
      if (myLocation) {
        mapRef.current?.flyTo({
          center: [myLocation.point.lng, myLocation.point.lat],
          zoom: 13.8,
        });
      }
      onNotify('Memusatkan peta ke posisi terakhir.');
    } finally {
      setLocating(false);
    }
  };

  const handleFallbackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const coords = unprojectPercent(xPct, yPct);
    const guess =
      yPct < 40 ? 'Senopati, Jakarta Selatan' : xPct > 56 ? 'Kemang Raya' : 'Blok M';
    onRequestPinAt(coords, guess);
  };

  const cycleSheetSnap = () => {
    setSheetSnap((s) => (s === 'peek' ? 'half' : s === 'half' ? 'expanded' : 'peek'));
  };

  const handleSheetPointerDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
  };

  const handleSheetPointerUp = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    dragStartY.current = null;
    if (Math.abs(delta) < 16) {
      cycleSheetSnap();
      return;
    }
    if (delta < 0) {
      setSheetSnap((s) => (s === 'peek' ? 'half' : 'expanded'));
    } else {
      setSheetSnap((s) => (s === 'expanded' ? 'half' : 'peek'));
    }
  };

  const selectedEntry = selectedMapUserId
    ? visibleFriends.find((f) => f.userId === selectedMapUserId)
    : null;

  return (
    <section className="map-panel" aria-label="Peta Sosial">
      {/* Edge-to-edge full-bleed map canvas */}
      {useVectorMap ? (
        <div ref={mapHostRef} className="map-canvas-full" />
      ) : (
        <div
          id="fallback-social-map"
          className="map-fallback-canvas"
          onClick={handleFallbackClick}
        >
          <svg className="map-fallback-svg" viewBox="0 0 600 600" preserveAspectRatio="none">
            <rect
              x="310"
              y="80"
              width="120"
              height="90"
              rx="18"
              fill={theme === 'dark' ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.12)'}
            />
            <rect
              x="120"
              y="340"
              width="140"
              height="100"
              rx="22"
              fill={theme === 'dark' ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.1)'}
            />
            <path
              d="M 0 130 Q 220 155 600 95"
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.11)' : '#ffffff'}
              strokeWidth="9"
              fill="none"
            />
            <path
              d="M 140 0 Q 175 290 250 600"
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.12)' : '#ffffff'}
              strokeWidth="10"
              fill="none"
            />
            <path
              d="M 415 0 Q 385 280 465 600"
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#ffffff'}
              strokeWidth="8"
              fill="none"
            />
            <path
              d="M 0 365 Q 295 335 600 410"
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.09)' : '#ffffff'}
              strokeWidth="7"
              fill="none"
            />
            <path
              d="M 80 230 L 540 245"
              stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)'}
              strokeWidth="3"
              fill="none"
            />
          </svg>

          <span className="map-area-label" style={{ left: '54%', top: '18%' }}>
            SENOPATI · SCBD
          </span>
          <span className="map-area-label" style={{ left: '16%', top: '44%' }}>
            BLOK M
          </span>
          <span className="map-area-label" style={{ left: '58%', top: '68%' }}>
            KEMANG
          </span>

          {clusters.map((cluster) => {
            const pos = projectToPercent(cluster.point);
            if (cluster.isCluster) {
              return (
                <div
                  key={cluster.id}
                  className="map-marker-node"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMapUser(cluster.items[0].userId);
                    setSheetSnap('half');
                  }}
                >
                  <div className="map-cluster-badge">+{cluster.items.length}</div>
                </div>
              );
            }

            const entry = cluster.items[0];
            const isSelected = selectedMapUserId === entry.userId;
            return (
              <div
                key={entry.userId}
                className={`map-marker-node ${isSelected ? 'selected' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMapUser(isSelected ? null : entry.userId);
                  setSheetSnap(isSelected ? 'peek' : 'half');
                }}
              >
                {entry.loc.privacyMode === 'fuzzy' && <div className="map-fuzzy-halo" />}
                <div
                  className="map-marker-ring"
                  style={{ background: entry.profile.avatarColor }}
                >
                  {entry.profile.initials}
                </div>
                <span className="map-marker-tag">{entry.profile.displayName}</span>
              </div>
            );
          })}

          {hangoutPins.map((pin) => {
            const pos = projectToPercent(pin.point);
            return (
              <button
                key={pin.id}
                type="button"
                className={`hangout-pin-pill ${highlightedPinId === pin.id ? 'highlighted' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectChannel(pin.channelId);
                  onSelectHangoutChannel?.();
                }}
              >
                <MapPin size={13} strokeWidth={2} />
                <span>{pin.placeName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating Top Glass Controls (Search + Circle Filter + Ghost/Privacy Pill) */}
      <div className="map-float-top">
        <div className="map-search-cluster">
          <div className="map-glass-pill" style={{ width: '100%' }}>
            <Search size={15} strokeWidth={1.75} color="var(--text-muted)" />
            <input
              className="map-search-input"
              placeholder="Cari tempat untuk kumpul"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
            />
            {placeQuery && (
              <button
                type="button"
                onClick={() => setPlaceQuery('')}
                aria-label="Hapus pencarian"
              >
                <X size={14} strokeWidth={1.75} color="var(--text-muted)" />
              </button>
            )}
          </div>

          {placeResults.length > 0 && (
            <div className="map-search-dropdown">
              {placeResults.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="map-search-result"
                  onClick={() => {
                    setPlaceQuery('');
                    setPlaceResults([]);
                    mapRef.current?.flyTo({
                      center: [place.point.lng, place.point.lat],
                      zoom: 15,
                    });
                    onRequestPinAt(place.point, place.name);
                  }}
                >
                  <strong style={{ fontSize: 13 }}>{place.name}</strong>
                  <span className="meta-text">{place.subtitle}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              aria-label="Filter Circle"
              className="map-glass-pill"
              style={{ height: 30, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}
              value={circleFilter}
              onChange={(e) => setCircleFilter(e.target.value)}
            >
              <option value="all">Semua Circle</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="map-privacy-pill" role="group" aria-label="Privasi Lokasi">
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
                className={`map-privacy-opt ${myPrivacy === mode ? `active ${mode}` : ''}`}
                onClick={() => {
                  setMyPrivacyMode(mode);
                  onNotify(`Privasi lokasi: ${label}`);
                }}
                title={`Mode ${label}`}
              >
                <Icon size={13} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {onCloseDrawer && (
            <button
              type="button"
              className="map-fab-pill"
              style={{ width: 36, height: 36 }}
              onClick={onCloseDrawer}
              title="Tutup peta samping"
              aria-label="Tutup peta"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {/* Floating Bottom-Right Action Pills (Recenter GPS & Create Pin) */}
      <div className="map-float-right">
        <button
          type="button"
          className="map-fab-pill"
          onClick={handleRecenterGps}
          disabled={locating}
          title="Pusatkan ke lokasi saya"
          aria-label="Lokasi saya"
        >
          <Crosshair size={18} strokeWidth={1.75} />
        </button>
        <button
          id="btn-map-create-pin"
          type="button"
          className="map-fab-pill primary"
          onClick={() =>
            onRequestPinAt(
              myLocation?.point ?? { lat: -6.2442, lng: 106.8006 },
              'M Bloc Space'
            )
          }
          title="Buat Pin Ajak Kumpul"
          aria-label="Buat Pin Ajak Kumpul"
        >
          <Plus size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Draggable Bottom Sheet (Peek / Half / Expanded) */}
      <div className={`map-bottom-sheet ${sheetSnap}`}>
        <div
          className="sheet-grabber-hit"
          onPointerDown={handleSheetPointerDown}
          onPointerUp={handleSheetPointerUp}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') cycleSheetSnap();
          }}
          aria-label="Ubah tinggi panel peta"
        >
          <span className="sheet-grabber-bar" />
        </div>

        <div className="sheet-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 13.5 }}>
              {selectedEntry
                ? selectedEntry.profile.displayName
                : `${visibleFriends.length} teman aktif di peta`}
            </strong>
            <span className="meta-text">{hangoutPins.length} pin kumpul</span>
          </div>

          {/* Horizontal friend chips visible even in Peek */}
          <div className="sheet-friend-strip">
            {visibleFriends.map(({ userId, loc, profile }) => (
              <button
                key={userId}
                type="button"
                className={`sheet-friend-pill ${selectedMapUserId === userId ? 'selected' : ''}`}
                onClick={() => {
                  setSelectedMapUser(userId);
                  setSheetSnap('half');
                  mapRef.current?.flyTo({
                    center: [loc.point.lng, loc.point.lat],
                    zoom: 14.5,
                  });
                }}
              >
                <Avatar initials={profile.initials} color={profile.avatarColor} size="xs" />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2 }}>
                    {profile.displayName}
                  </div>
                  <div className="meta-text" style={{ fontSize: 11 }}>
                    {loc.areaLabel}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Selected Friend Detail Card (visible in Half & Expanded) */}
          {sheetSnap !== 'peek' && selectedEntry && selectedEntry.visiblePoint && myLocation && (
            <div className="sheet-detail-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {selectedEntry.profile.displayName} · {selectedEntry.loc.activityEmoji}{' '}
                  {selectedEntry.loc.activityText}
                </div>
                <div className="meta-text" style={{ marginTop: 2 }}>
                  {selectedEntry.loc.areaLabel} ·{' '}
                  {selectedEntry.loc.privacyMode === 'fuzzy'
                    ? 'Area perkiraan (~400m)'
                    : `${formatDistanceLabel(
                        distanceMeters(myLocation.point, selectedEntry.visiblePoint)
                      )} · ~${estimateEtaMinutes(
                        myLocation.point,
                        selectedEntry.visiblePoint
                      )} mnt`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  className="meta-text"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  <Battery size={13} strokeWidth={1.75} />
                  {selectedEntry.loc.batteryPct}%
                </span>
                <a
                  href={buildDirectionsUrl(
                    selectedEntry.visiblePoint,
                    selectedEntry.profile.displayName
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-link-btn"
                >
                  <ExternalLink size={12} strokeWidth={1.75} />
                  <span>Rute</span>
                </a>
              </div>
            </div>
          )}

          {/* Active Hangout Pins list (visible in Half & Expanded) */}
          {sheetSnap !== 'peek' &&
            hangoutPins.map((pin) => (
              <div key={pin.id} className="sheet-detail-row">
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <MapPin size={14} strokeWidth={1.75} color="var(--accent)" />
                    <span>{pin.placeName}</span>
                  </div>
                  <div className="meta-text" style={{ marginTop: 2 }}>
                    {pin.title} · {pin.startsAtLabel} · {pin.rsvps.length} respon
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-link-btn"
                  onClick={() => {
                    selectChannel(pin.channelId);
                    onSelectHangoutChannel?.();
                  }}
                >
                  Buka Kanal
                </button>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
