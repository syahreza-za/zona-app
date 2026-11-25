import type { Coordinates, PrivacyMode } from '../types';

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Deterministic 32-bit hash used to derive hourly stable fuzzy offsets so a friend
 * in fuzzy mode cannot be triangulated by averaging jittered samples.
 */
function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Computes Great-Circle distance in meters between two geographic points.
 */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Applies ZONA's privacy rules to a raw coordinate:
 * - 'ghost': returns null (hidden from map completely)
 * - 'fuzzy': offsets coordinate by 300–550m in an hourly deterministic direction
 * - 'exact': returns the exact coordinate
 */
export function resolveVisibleCoordinates(
  raw: Coordinates,
  privacyMode: PrivacyMode,
  userId: string,
  hourBucket: number = Math.floor(Date.now() / 3_600_000)
): Coordinates | null {
  if (privacyMode === 'ghost') {
    return null;
  }
  if (privacyMode === 'exact') {
    return { ...raw };
  }

  const seed = hashString(`${userId}:${hourBucket}`);
  const angleRad = ((seed % 3600) / 3600) * Math.PI * 2;
  const radiusM = 300 + (seed % 251); // 300m - 550m neighborhood fuzz

  const dLat = (radiusM * Math.cos(angleRad)) / 111_320;
  const cosLat = Math.max(0.01, Math.cos(toRad(raw.lat)));
  const dLng = (radiusM * Math.sin(angleRad)) / (111_320 * cosLat);

  return {
    lat: Number((raw.lat + dLat).toFixed(6)),
    lng: Number((raw.lng + dLng).toFixed(6)),
  };
}

/**
 * Estimates urban travel time in minutes (default 22 km/h Jakarta scooter/car average).
 */
export function estimateEtaMinutes(
  from: Coordinates,
  to: Coordinates,
  avgSpeedKmh = 22
): number {
  const meters = distanceMeters(from, to);
  if (meters < 120) return 1;
  const km = meters / 1000;
  return Math.max(2, Math.round((km / avgSpeedKmh) * 60));
}

export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
