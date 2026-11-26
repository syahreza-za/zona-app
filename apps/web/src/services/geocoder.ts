import type { Coordinates, PlaceSuggestion } from '@zona/shared';

const FALLBACK_PLACES: PlaceSuggestion[] = [
  {
    id: 'fp-1',
    name: 'M Bloc Space',
    subtitle: 'Jl. Panglima Polim, Blok M, Jakarta Selatan',
    point: { lat: -6.2419, lng: 106.7985 },
  },
  {
    id: 'fp-2',
    name: 'Kopi Tuku Kemang',
    subtitle: 'Jl. Kemang Raya, Jakarta Selatan',
    point: { lat: -6.2608, lng: 106.8139 },
  },
  {
    id: 'fp-3',
    name: 'ASHTA District 8',
    subtitle: 'SCBD, Senopati, Jakarta Selatan',
    point: { lat: -6.2282, lng: 106.8067 },
  },
  {
    id: 'fp-4',
    name: 'Taman Literasi Martha Christina Tiahahu',
    subtitle: 'Blok M, Kebayoran Baru, Jakarta Selatan',
    point: { lat: -6.2442, lng: 106.8006 },
  },
  {
    id: 'fp-5',
    name: 'Senayan Park (SPARK)',
    subtitle: 'Gelora, Tanah Abang, Jakarta Pusat',
    point: { lat: -6.2124, lng: 106.8021 },
  },
];

/**
 * Searches real-world places using OpenStreetMap Photon API ($0, no API key),
 * falling back cleanly to curated local Jakarta spots when offline.
 */
export async function searchRealPlaces(
  query: string,
  biasPoint?: Coordinates
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return FALLBACK_PLACES;

  const fallbackMatches = FALLBACK_PLACES.filter(
    (p) =>
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.subtitle.toLowerCase().includes(q.toLowerCase())
  );

  try {
    const params = new URLSearchParams({ q, limit: '5' });
    if (biasPoint) {
      params.set('lat', String(biasPoint.lat));
      params.set('lon', String(biasPoint.lng));
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
      signal: controller.signal,
    });
    window.clearTimeout(timeout);

    if (!res.ok) return fallbackMatches.length ? fallbackMatches : FALLBACK_PLACES;
    const data = (await res.json()) as {
      features?: Array<{
        geometry: { coordinates: [number, number] };
        properties: { name?: string; street?: string; city?: string; country?: string };
      }>;
    };

    const parsed: PlaceSuggestion[] = (data.features ?? [])
      .filter((f) => f.properties?.name)
      .map((f, idx) => ({
        id: `osm-${idx}-${f.geometry.coordinates[0]}`,
        name: f.properties.name || q,
        subtitle: [f.properties.street, f.properties.city, f.properties.country]
          .filter(Boolean)
          .join(', ') || 'OpenStreetMap',
        point: {
          lat: Number(f.geometry.coordinates[1].toFixed(5)),
          lng: Number(f.geometry.coordinates[0].toFixed(5)),
        },
      }));

    return parsed.length > 0 ? parsed : fallbackMatches;
  } catch {
    return fallbackMatches.length > 0 ? fallbackMatches : FALLBACK_PLACES;
  }
}

export function getBrowserGps(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS tidak didukung di browser ini.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        }),
      (err) => reject(new Error(err.message || 'Izin lokasi ditolak.')),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

export function buildDirectionsUrl(point: Coordinates, label?: string): string {
  const q = encodeURIComponent(label ? `${point.lat},${point.lng} (${label})` : `${point.lat},${point.lng}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
