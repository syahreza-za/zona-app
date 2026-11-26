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
import { Avatar, renderAvatarSvgMarkup, resolveAvatarVariant } from './Avatar';
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

export const HANGOUT_CATEGORY_META: Record<
  HangoutCategory,
  { color: string; label: string; icon: typeof Coffee }
> = {
  coffee: { color: '#D97706', label: 'Kopi', icon: Coffee },
  food: { color: '#EA580C', label: 'Makan', icon: Utensils },
  gaming: { color: '#3B82F6', label: 'Santai', icon: Gamepad2 },
  sport: { color: '#10B981', label: 'Olahraga', icon: Activity },
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

/**
 * Restyles OpenFreeMap Liberty vector layers into a rich deep-twilight navy/slate
 * night cartography (never flat monochrome black-gray) and ensures 3D buildings render.
 */
function applyCartographyStyleEnhancements(map: maplibregl.Map, theme: 'dark' | 'light') {
  const style = map.getStyle();
  if (!style?.layers) return;

  if (theme === 'dark') {
    for (const layer of style.layers) {
      const id = layer.id.toLowerCase();
      try {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#141B29');
        } else if (layer.type === 'fill') {
          if (id.includes('water') || id.includes('river') || id.includes('ocean')) {
            map.setPaintProperty(layer.id, 'fill-color', '#0D1626');
          } else if (
            id.includes('park') ||
            id.includes('grass') ||
            id.includes('wood') ||
            id.includes('forest') ||
            id.includes('green') ||
            id.includes('landcover')
          ) {
            map.setPaintProperty(layer.id, 'fill-color', '#172B24');
          } else if (id.includes('building')) {
            map.setPaintProperty(layer.id, 'fill-color', '#212D40');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.85);
          } else if (id.includes('landuse') || id.includes('residential') || id.includes('urban')) {
            map.setPaintProperty(layer.id, 'fill-color', '#1A2334');
          }
        } else if (layer.type === 'fill-extrusion') {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', '#253348');
          map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.82);
        } else if (layer.type === 'line') {
          if (id.includes('water') || id.includes('river')) {
            map.setPaintProperty(layer.id, 'line-color', '#0D1626');
          } else if (
            id.includes('motorway') ||
            id.includes('trunk') ||
            id.includes('primary')
          ) {
            map.setPaintProperty(layer.id, 'line-color', '#364966');
          } else if (id.includes('road') || id.includes('street') || id.includes('highway') || id.includes('secondary')) {
            map.setPaintProperty(layer.id, 'line-color', '#293548');
          } else if (id.includes('boundary') || id.includes('admin')) {
            map.setPaintProperty(layer.id, 'line-color', 'rgba(148, 163, 184, 0.22)');
          }
        } else if (layer.type === 'symbol') {
          map.setPaintProperty(layer.id, 'text-color', '#CBD5E1');
          map.setPaintProperty(layer.id, 'text-halo-color', '#0F172A');
          map.setPaintProperty(layer.id, 'text-halo-width', 1.4);
        }
      } catch {
        // Ignore paint properties unsupported on specific vector layers
      }
    }
  } else {
    // Boost 3D buildings warmly in Light Mode if present
    for (const layer of style.layers) {
      if (layer.type === 'fill-extrusion') {
        try {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', '#E8E3D9');
          map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.82);
        } catch {
          // Ignore
        }
      }
    }
  }
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

  // MapLibre GL 3D Perspective Cartography (Liberty Light + Rich Twilight Night)
  useEffect(() => {
    if (!useVectorMap || !mapHostRef.current) return;

    const styleUrl =
      import.meta.env.VITE_MAP_STYLE_URL ||
      'https://tiles.openfreemap.org/styles/liberty';

    const centerPoint = myLocation?.point ?? { lat: -6.249, lng: 106.807 };
    let map: maplibregl.Map;

    try {
      map = new maplibregl.Map({
        container: mapHostRef.current,
        style: styleUrl,
        center: [centerPoint.lng, centerPoint.lat],
        zoom: 13.4,
        pitch: 42,
        bearing: -12,
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

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [useVectorMap, theme]);

  // Sync illustrated character pins, Gathering Halo, and categorized Hangout Pins on MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !useVectorMap) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // 1. Gathering Halo rings under active hangout hotspots (outer wrapper preserves MapLibre transform)
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

    // 2. Friend Markers with illustrated character SVG + 3px white frame + downward pointer tail
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
          map.flyTo({ center: [cluster.point.lng, cluster.point.lat], zoom: 15.2, pitch: 48 });
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
        if (entry.profile.avatarUrl) {
          const img = document.createElement('img');
          img.src = entry.profile.avatarUrl;
          img.alt = entry.profile.displayName;
          pinHead.appendChild(img);
        } else {
          const v = resolveAvatarVariant(entry.profile.avatarVariant, entry.userId);
          pinHead.innerHTML = renderAvatarSvgMarkup(v);
        }
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

    // 3. Categorized Hangout Pins with crisp monochrome category icon
    const categoryIconSvg: Record<HangoutCategory, string> = {
      coffee:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',
      food:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
      gaming:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="12" y2="12"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="15" x2="15.01" y1="13" y2="13"/><line x1="18" x2="18.01" y1="11" y2="11"/><rect width="20" height="12" x="2" y="6" rx="2"/></svg>',
      sport:
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
    };

    hangoutPins.forEach((pin) => {
      const catKey = pin.category ?? 'coffee';
      const cat = HANGOUT_CATEGORY_META[catKey];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `hangout-pin-pill ${highlightedPinId === pin.id ? 'highlighted' : ''}`;
      el.style.position = 'static';
      el.style.transform = 'none';
      el.style.background = cat.color;
      el.style.boxShadow = `0 6px 18px ${cat.color}55`;
      el.innerHTML = `${categoryIconSvg[catKey]}<span>${pin.placeName.replace(/</g, '&lt;')}</span>`;
      el.onclick = (e) => {
        e.stopPropagation();
        selectChannel(pin.channelId);
        onSelectHangoutChannel?.();
      };
      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([pin.point.lng, pin.point.lat])
        .addTo(map);
      markersRef.current.push(marker);
    });
  }, [
    clusters,
    hangoutPins,
    gatheringPinIds,
    highlightedPinId,
    useVectorMap,
    selectChannel,
    setSelectedMapUser,
    onSelectHangoutChannel,
  ]);

  const handleRecenterGps = async () => {
    setLocating(true);
    try {
      const gps = await getBrowserGps();
      updateMyCoordinates(gps, 'Lokasi Saat Ini');
      mapRef.current?.flyTo({ center: [gps.lng, gps.lat], zoom: 14.6, pitch: 44 });
      onNotify('Lokasi diperbarui dari GPS.');
    } catch {
      if (myLocation) {
        mapRef.current?.flyTo({
          center: [myLocation.point.lng, myLocation.point.lat],
          zoom: 14,
          pitch: 42,
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
      {useVectorMap ? (
        <div ref={mapHostRef} className="map-canvas-full" />
      ) : (
        /* Rich Illustrated Zenly / Apple-Maps Offline Fallback */
        <div
          id="fallback-social-map"
          className="map-fallback-canvas"
          onClick={handleFallbackClick}
        >
          <svg className="map-fallback-svg" viewBox="0 0 600 600" preserveAspectRatio="none">
            <rect
              width="600"
              height="600"
              fill={theme === 'dark' ? '#141B29' : '#F3EFE6'}
            />
            {/* Organic green parks */}
            <path
              d="M 290 60 C 350 40 430 65 445 125 C 455 165 395 190 340 175 C 285 160 250 95 290 60 Z"
              fill={theme === 'dark' ? '#172B24' : '#CBE8C8'}
            />
            <path
              d="M 75 310 C 145 290 220 320 225 385 C 230 440 155 465 95 440 C 45 415 35 335 75 310 Z"
              fill={theme === 'dark' ? '#172B24' : '#D2EBCF'}
            />
            <path
              d="M 420 420 C 480 400 560 430 570 495 C 580 545 500 570 445 545 C 400 520 385 445 420 420 Z"
              fill={theme === 'dark' ? '#172B24' : '#CBE8C8'}
            />
            {/* Winding blue river */}
            <path
              d="M -20 495 C 120 455 210 380 315 295 C 405 225 495 155 620 120"
              stroke={theme === 'dark' ? '#0D1626' : '#A8D5F2'}
              strokeWidth="26"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M -20 495 C 120 455 210 380 315 295 C 405 225 495 155 620 120"
              stroke={theme === 'dark' ? '#152540' : '#CBE7F8'}
              strokeWidth="12"
              strokeLinecap="round"
              fill="none"
            />
            {/* Subtle urban building footprints */}
            <g fill={theme === 'dark' ? '#1F2A3D' : '#E7E1D4'}>
              <rect x="170" y="155" width="46" height="30" rx="6" />
              <rect x="230" y="195" width="38" height="44" rx="6" />
              <rect x="330" y="215" width="52" height="32" rx="6" />
              <rect x="260" y="340" width="56" height="36" rx="6" />
              <rect x="360" y="370" width="48" height="42" rx="6" />
              <rect x="465" y="250" width="54" height="34" rx="6" />
            </g>
            {/* Secondary local streets */}
            <g
              stroke={theme === 'dark' ? '#243248' : '#FFFFFF'}
              strokeWidth="4.5"
              fill="none"
              opacity="0.85"
            >
              <path d="M 30 220 Q 260 235 560 215" />
              <path d="M 60 390 Q 290 365 570 430" />
              <path d="M 245 20 Q 255 280 280 590" />
              <path d="M 495 20 Q 470 290 520 590" />
            </g>
            {/* Major arterial avenues */}
            <g
              stroke={theme === 'dark' ? '#364966' : '#FFFDF9'}
              strokeWidth="11"
              strokeLinecap="round"
              fill="none"
            >
              <path d="M -10 130 Q 230 155 610 92" />
              <path d="M 140 -10 Q 178 290 252 610" />
              <path d="M 412 -10 Q 382 280 462 610" />
            </g>
            <path
              d="M -10 130 Q 230 155 610 92"
              stroke={theme === 'dark' ? '#475D80' : '#FCD34D'}
              strokeWidth="2.2"
              fill="none"
              opacity="0.7"
            />
          </svg>

          <span className="map-area-label" style={{ left: '54%', top: '16%' }}>
            SENOPATI · SCBD
          </span>
          <span className="map-area-label" style={{ left: '16%', top: '44%' }}>
            BLOK M
          </span>
          <span className="map-area-label" style={{ left: '58%', top: '68%' }}>
            KEMANG RAYA
          </span>

          {hangoutPins.map((pin) => {
            if (!gatheringPinIds.has(pin.id)) return null;
            const pos = projectToPercent(pin.point);
            return (
              <div
                key={`halo-${pin.id}`}
                className="gathering-halo-pulse"
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              />
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
            const v = resolveAvatarVariant(entry.profile.avatarVariant, entry.userId);
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
                  {entry.profile.avatarUrl ? (
                    <img src={entry.profile.avatarUrl} alt={entry.profile.displayName} />
                  ) : (
                    <span
                      className="avatar-svg-host"
                      dangerouslySetInnerHTML={{ __html: renderAvatarSvgMarkup(v) }}
                    />
                  )}
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
                  onSelectHangoutChannel?.();
                }}
              >
                <CatIcon size={13} strokeWidth={2} />
                <span>{pin.placeName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Floating Top Glass Controls */}
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
                      pitch: 45,
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
                    pitch: 45,
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
                      onSelectHangoutChannel?.();
                    }}
                  >
                    Buka Kanal
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}
