import { distanceMeters } from './fuzzyLocation';
import type { MapCluster, MapMarkerItem } from '../types';

/**
 * Greedy spatial clustering for live map friend markers.
 * Friends within `radiusMeters` of a cluster centroid are merged cleanly
 * so avatars never overlap unreadably on crowded map views.
 */
export function clusterMapMarkers<T extends MapMarkerItem>(
  items: T[],
  radiusMeters = 280
): MapCluster<T>[] {
  const clusters: Array<{ items: T[]; latSum: number; lngSum: number }> = [];

  for (const item of items) {
    let matched: { items: T[]; latSum: number; lngSum: number } | null = null;
    for (const cluster of clusters) {
      const centroid = {
        lat: cluster.latSum / cluster.items.length,
        lng: cluster.lngSum / cluster.items.length,
      };
      if (distanceMeters(centroid, item.point) <= radiusMeters) {
        matched = cluster;
        break;
      }
    }

    if (matched) {
      matched.items.push(item);
      matched.latSum += item.point.lat;
      matched.lngSum += item.point.lng;
    } else {
      clusters.push({
        items: [item],
        latSum: item.point.lat,
        lngSum: item.point.lng,
      });
    }
  }

  return clusters.map((cluster) => {
    const count = cluster.items.length;
    return {
      id: cluster.items.map((i) => i.userId).sort().join('+'),
      point: {
        lat: Number((cluster.latSum / count).toFixed(6)),
        lng: Number((cluster.lngSum / count).toFixed(6)),
      },
      items: cluster.items,
      isCluster: count > 1,
    };
  });
}
