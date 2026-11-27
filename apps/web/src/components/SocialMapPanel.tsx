import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Activity,
  Battery,
  Coffee,
  Crosshair,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  MapPin,
  Maximize2,
  Plus,
  Search,
  Shield,
  Utensils,
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
  type HangoutCategory,
  type PlaceSuggestion,
  type PrivacyMode,
} from '@zona/shared';
import { Avatar, resolveAvatarImageUrl } from './Avatar';
import { zonaCloudSync } from '../services/cloudSync';
import { buildDirectionsUrl, getBrowserGps, searchRealPlaces } from '../services/geocoder';

interface SocialMapPanelProps {
  theme: 'dark' | 'light';
  variant?: 'full' | 'hero';
  circleFilterOverride?: string;
  onRequestPinAt: (coords: Coordinates, placeGuess: string) => void;
  highlightedPinId?: string | null;
  onExpandHeroMap?: () => void;
  onCloseDrawer?: () => void;
  onSelectHangoutChannel?: (channelId?: string) => void;
  onNotify: (msg: string) => void;
}

type SheetSnap = 'peek' | 'half' | 'expanded';

const BOUNDS = {
  minLat: -6.272,
  maxLat: -6.222,
  minLng: 106.786,
  maxLng: 106.826,
};

export const HANGOUT_CATEGORY_META: Record<
  HangoutCategory,
  { color: string; label: string; icon: typeof Coffee }
> = {
  coffee: { color: '#C2410C', label: 'Kopi', icon: Coffee },
  food: { color: '#E05A3F', label: 'Makan', icon: Utensils },
  gaming: { color: '#0F766E', label: 'Santai', icon: Gamepad2 },
  sport: { color: '#0D9488', label: 'Olahraga', icon: Activity },
};

function projectToPercent(point: Coordinates): { x: number; y: number } {
  const x = ((point.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - point.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return {
    x: Math.max(14, Math.min(82, x)),
    y: Math.max(22, Math.min(68, y)),
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

/**
 * Restyles OpenFreeMap Liberty vector layers into a crisp, high-contrast deep twilight
 * night cartography in Dark Mode, and warm subtle 3D buildings in Light Mode.
 */
function applyCartographyStyleEnhancements(map: maplibregl.Map, theme: 'dark' | 'light') {
  const style = map.getStyle();
  if (!style?.layers) return;

  if (theme === 'dark') {
    for (const layer of style.layers) {
      const id = layer.id.toLowerCase();
      try {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#121826');
        } else if (layer.type === 'fill') {
          if (id.includes('water') || id.includes('river') || id.includes('ocean')) {
            map.setPaintProperty(layer.id, 'fill-color', '#0B1322');
          } else if (
            id.includes('park') ||
            id.includes('grass') ||
            id.includes('wood') ||
            id.includes('forest') ||
            id.includes('green') ||
            id.includes('landcover')
          ) {
            map.setPaintProperty(layer.id, 'fill-color', '#152A23');
          } else if (id.includes('building')) {
            map.setPaintProperty(layer.id, 'fill-color', '#1E293B');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.88);
          } else if (id.includes('landuse') || id.includes('residential') || id.includes('urban')) {
            map.setPaintProperty(layer.id, 'fill-color', '#161F30');
          }
        } else if (layer.type === 'fill-extrusion') {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', '#243247');
          map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.85);
        } else if (layer.type === 'line') {
          if (id.includes('water') || id.includes('river')) {
            map.setPaintProperty(layer.id, 'line-color', '#0B1322');
          } else if (
            id.includes('motorway') ||
            id.includes('trunk') ||
            id.includes('primary')
          ) {
            map.setPaintProperty(layer.id, 'line-color', '#3B5172');
          } else if (
            id.includes('road') ||
            id.includes('street') ||
            id.includes('highway') ||
            id.includes('secondary')
          ) {
            map.setPaintProperty(layer.id, 'line-color', '#2A384F');
          } else if (id.includes('boundary') || id.includes('admin')) {
            map.setPaintProperty(layer.id, 'line-color', 'rgba(148, 163, 184, 0.24)');
          }
        } else if (layer.type === 'symbol') {
          map.setPaintProperty(layer.id, 'text-color', '#DCE5F2');
          map.setPaintProperty(layer.id, 'text-halo-color', '#0E1420');
          map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
        }
      } catch {
        // Ignore paint properties unsupported on specific vector layers
      }
    }
  } else {
    for (const layer of style.layers) {
      if (layer.type === 'fill-extrusion') {
        try {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', '#E7E1D7');
          map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.84);
        } catch {
          // Ignore
        }
      }
    }
  }
}

export function SocialMapPanel({
  theme,
  variant = 'full',
  circleFilterOverride,
  onRequestPinAt,
  highlightedPinId,
  onExpandHeroMap,
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

  const effectiveCircleFilter = circleFilterOverride ?? circleFilter;
  const isHero = variant === 'hero';

  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const dragStartY = useRef<number | null>(null);

  const myLocation = locations[currentUserId];
  const myPrivacy: PrivacyMode = myLocation?.privacyMode ?? 'exact';

  const visibleFriends = useMemo(() => {
    const circle =
      effectiveCircleFilter === 'all'
        ? null
        : circles.find((c) => c.id === effectiveCircleFilter);
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
  }, [locations, blockedUserIds, circles, effectiveCircleFilter, profiles]);

  const clusters = useMemo(
    () => clusterMapMarkers(visibleFriends, 220),
    [visibleFriends]
  );

  // Detect Hangout Pins with 2+ friends nearby (within 900m) for warm Gathering Halo
  const gatheringPinIds = useMemo(() => {
    const set = new Set<string>();
    for (const pin of hangoutPins) {
      let nearbyCount = 0;
      for (const friend of visibleFriends) {
        if (friend.visiblePoint && distanceMeters(pin.point, friend.visiblePoint) <= 900) {
          nearbyCount += 1;
        }
      }
      if (nearbyCount >= 2) set.add(pin.id);
    }
    return set;
  }, [hangoutPins, visibleFriends]);

  // Photon OpenStreetMap place search
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

  // MapLibre GL initialization: gentle pitch: 24, bearing: 0, zoom: 13.8 + ResizeObserver
  useEffect(() => {
    if (!useVectorMap || !mapHostRef.current) return;

    const host = mapHostRef.current;
    const styleUrl =
      import.meta.env.VITE_MAP_STYLE_URL ||
      'https://tiles.openfreemap.org/styles/liberty';

    const centerPoint = myLocation?.point ?? { lat: -6.247, lng: 106.807 };
    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: host,
        style: styleUrl,
        center: [centerPoint.lng, centerPoint.lat],
        zoom: 13.8,
        pitch: 24,
        bearing: 0,
        attributionControl: false,
      });
    } catch {
      setUseVectorMap(false);
      return;
    }

    let tileErrorCount = 0;
    map.on('error', () => {
      tileErrorCount += 1;
      if (tileErrorCount >= 3) {
        setUseVectorMap(false);
      }
    });

    map.on('style.load', () => {
      applyCartographyStyleEnhancements(map, theme);
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

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(host);

    mapRef.current = map;
    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [useVectorMap, theme]);

  // Sync markers & fitBounds safely away from search bar, right FABs, and bottom sheet
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !useVectorMap) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // 1. Centered Gathering Halo rings under active hangout hotspots
    hangoutPins.forEach((pin) => {
      if (!gatheringPinIds.has(pin.id)) return;
      const haloWrap = document.createElement('div');
      haloWrap.style.pointerEvents = 'none';
      const haloEl = document.createElement('div');
      haloEl.className = 'gathering-halo-pulse';
      haloWrap.appendChild(haloEl);
      const haloMarker = new maplibregl.Marker({ element: haloWrap, anchor: 'center' })
        .setLngLat([pin.point.lng, pin.point.lat])
        .addTo(map);
      markersRef.current.push(haloMarker);
    });

    // 2. Friend Markers with crisp local editorial portraits + 3px white frame + downward pointer tail
    clusters.forEach((cluster) => {
      const el = document.createElement('div');
      el.className = 'social-pin-root';

      if (cluster.isCluster) {
        const badge = document.createElement('div');
        badge.className = 'map-cluster-badge';
        badge.textContent = `+${cluster.items.length}`;
        el.appendChild(badge);
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [cluster.point.lng, cluster.point.lat], zoom: 15, pitch: 24 });
        };
      } else {
        const entry = cluster.items[0];
        if (entry.loc.privacyMode === 'fuzzy') {
          const halo = document.createElement('div');
          halo.className = 'map-fuzzy-halo';
          el.appendChild(halo);
        }

        const pinHead = document.createElement('div');
        pinHead.className = 'social-pin-head';
        const img = document.createElement('img');
        img.src = resolveAvatarImageUrl(
          entry.profile.avatarUrl,
          entry.profile.avatarVariant,
          entry.userId
        );
        img.alt = entry.profile.displayName;
        pinHead.appendChild(img);
        el.appendChild(pinHead);

        const tail = document.createElement('div');
        tail.className = 'social-pin-tail';
        el.appendChild(tail);

        const tag = document.createElement('span');
        tag.className = 'map-marker-tag';
        tag.textContent = entry.loc.activityEmoji
          ? `${entry.loc.activityEmoji} ${entry.profile.displayName}`
          : entry.profile.displayName;
        el.appendChild(tag);

        el.onclick = (e) => {
          e.stopPropagation();
          setSelectedMapUser(entry.userId);
          setSheetSnap('half');
        };
      }

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([cluster.point.lng, cluster.point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    // 3. Minimalist Monochrome Hangout Pins with Indicator Lamp Dot

    hangoutPins.forEach((pin) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hangout-pin-pill ${highlightedPinId === pin.id ? 'highlighted' : ''}`;
      el.style.position = 'static';
      el.style.transform = 'none';
      el.innerHTML = `<span class="pin-lamp-dot"></span><span>${pin.placeName.replace(/</g, '&lt;')}</span>`;
      el.onclick = (e) => {
        e.stopPropagation();
        selectChannel(pin.channelId);
        onSelectHangoutChannel?.(pin.channelId);
      };
      const marker = new maplibregl.Marker({ element: el, anchor: 'top' })
        .setLngLat([pin.point.lng, pin.point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });

    // Fit camera cleanly so no marker collides with controls
    const fitAllMarkers = () => {
      const allCoords: Coordinates[] = [
        ...clusters.map((c) => c.point),
        ...hangoutPins.map((p) => p.point),
      ];
      if (allCoords.length < 2) return;
      const bounds = new maplibregl.LngLatBounds();
      allCoords.forEach((pt) => bounds.extend([pt.lng, pt.lat]));
      const width = mapHostRef.current?.clientWidth ?? 420;
      const isNarrow = width < 560;
      map.fitBounds(bounds, {
        padding: isHero
          ? { top: 82, bottom: 48, left: 56, right: 56 }
          : isNarrow
            ? { top: 145, bottom: 230, left: 60, right: 70 }
            : { top: 110, bottom: 180, left: 90, right: 100 },
        maxZoom: isHero ? 13.1 : isNarrow ? 13.2 : 13.8,
        pitch: 20,
        bearing: 0,
        duration: 0,
      });
    };

    fitAllMarkers();
    const ro = new ResizeObserver(() => {
      map.resize();
      fitAllMarkers();
    });
    if (mapHostRef.current) {
      ro.observe(mapHostRef.current);
    }

    return () => {
      ro.disconnect();
    };
  }, [
    clusters,
    hangoutPins,
    gatheringPinIds,
    highlightedPinId,
    useVectorMap,
    isHero,
    selectChannel,
    setSelectedMapUser,
    onSelectHangoutChannel,
  ]);

  const handleRecenterGps = async () => {
    setLocating(true);
    try {
      const gps = await getBrowserGps();
      updateMyCoordinates(gps, 'Lokasi Saat Ini');
      void zonaCloudSync.syncLocation({ point: gps, areaLabel: 'Lokasi Saat Ini' });
      mapRef.current?.flyTo({ center: [gps.lng, gps.lat], zoom: 14.4, pitch: 24, bearing: 0 });
      onNotify('Lokasi diperbarui dari GPS.');
    } catch {
      if (myLocation) {
        mapRef.current?.flyTo({
          center: [myLocation.point.lng, myLocation.point.lat],
          zoom: 13.8,
          pitch: 24,
          bearing: 0,
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
    <section className={`map-panel ${isHero ? 'hero-mode' : ''}`} aria-label="Peta Sosial">
      {useVectorMap ? (
        <div ref={mapHostRef} className="map-canvas-full" />
      ) : (
        <div
          id="fallback-social-map"
          className="map-fallback-canvas"
          onClick={handleFallbackClick}
        >
          <img
            src={
              theme === 'dark'
                ? './media/minimap-kemang-dark.webp'
                : './media/minimap-kemang-light.webp'
            }
            alt="Peta area Kemang dan Blok M"
            className="map-fallback-img"
          />

          {hangoutPins.map((pin) => {
            if (!gatheringPinIds.has(pin.id)) return null;
            const pos = projectToPercent(pin.point);
            return (
              <div
                key={`halo-${pin.id}`}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              >
                <div className="gathering-halo-pulse" />
              </div>
            );
          })}

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
                <div className="social-pin-head">
                  <img
                    src={resolveAvatarImageUrl(
                      entry.profile.avatarUrl,
                      entry.profile.avatarVariant,
                      entry.userId
                    )}
                    alt={entry.profile.displayName}
                  />
                </div>
                <div className="social-pin-tail" />
                <span className="map-marker-tag">
                  {entry.loc.activityEmoji ? `${entry.loc.activityEmoji} ` : ''}
                  {entry.profile.displayName}
                </span>
              </div>
            );
          })}

          {hangoutPins.map((pin) => {
            const pos = projectToPercent(pin.point);
            const cat = HANGOUT_CATEGORY_META[pin.category ?? 'coffee'];
            const CatIcon = cat.icon;
            return (
              <button
                key={pin.id}
                type="button"
                className={`hangout-pin-pill ${highlightedPinId === pin.id ? 'highlighted' : ''}`}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  background: cat.color,
                  boxShadow: `0 6px 18px ${cat.color}55`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectChannel(pin.channelId);
                  onSelectHangoutChannel?.(pin.channelId);
                }}
              >
                <CatIcon size={13} strokeWidth={2} />
                <span>{pin.placeName}</span>
              </button>
            );
          })}
        </div>
      )}

      {isHero ? (
        <div className="hero-map-top">
          <div className="map-privacy-pill slim" role="group" aria-label="Privasi Lokasi">
            {(
              [
                { mode: 'exact', label: 'Tepat' },
                { mode: 'fuzzy', label: 'Area' },
                { mode: 'ghost', label: 'Mati' },
              ] as { mode: PrivacyMode; label: string }[]
            ).map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                className={`map-privacy-opt ${myPrivacy === mode ? `active ${mode}` : ''}`}
                onClick={() => {
                  setMyPrivacyMode(mode);
                  void zonaCloudSync.syncLocation({ privacyMode: mode });
                  onNotify(`Lokasi: ${label}`);
                }}
              >
                {myPrivacy === mode && mode !== 'ghost' && (
                  <span className="lamp-dot xs" aria-hidden="true" />
                )}
                <span>{label}</span>
              </button>
            ))}
          </div>

          {onExpandHeroMap && (
            <button
              id="btn-hero-expand-map"
              type="button"
              className="hero-expand-icon-btn"
              onClick={onExpandHeroMap}
              title="Buka peta penuh"
              aria-label="Buka peta penuh"
            >
              <Maximize2 size={15} strokeWidth={1.85} />
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Full Map Floating Top Glass Controls */}
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
                          pitch: 24,
                          bearing: 0,
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

              {!circleFilterOverride && (
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
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div className="map-privacy-pill" role="group" aria-label="Privasi Lokasi">
                {(
                  [
                    { mode: 'exact', label: 'Tepat', icon: Eye },
                    { mode: 'fuzzy', label: 'Area', icon: Shield },
                    { mode: 'ghost', label: 'Mati', icon: EyeOff },
                  ] as { mode: PrivacyMode; label: string; icon: typeof Eye }[]
                ).map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    id={`privacy-btn-${mode}`}
                    type="button"
                    className={`map-privacy-opt ${myPrivacy === mode ? `active ${mode}` : ''}`}
                    onClick={() => {
                      setMyPrivacyMode(mode);
                      void zonaCloudSync.syncLocation({ privacyMode: mode });
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
                  title="Tutup peta"
                  aria-label="Tutup peta"
                >
                  <X size={16} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>

          {/* Floating Bottom-Right Action Pills */}
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

          {/* Floating Bottom Friend & Pin Dock / Sheet */}
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
                        zoom: 14.8,
                        pitch: 24,
                        bearing: 0,
                      });
                    }}
                  >
                    <Avatar
                      initials={profile.initials}
                      color={profile.avatarColor}
                      variant={profile.avatarVariant}
                      seed={userId}
                      avatarUrl={profile.avatarUrl}
                      size="xs"
                    />
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

              {sheetSnap !== 'peek' &&
                hangoutPins.map((pin) => {
                  const cat = HANGOUT_CATEGORY_META[pin.category ?? 'coffee'];
                  return (
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
                          <MapPin size={14} strokeWidth={1.75} color={cat.color} />
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
                          onSelectHangoutChannel?.(pin.channelId);
                        }}
                      >
                        Buka Obrolan
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
