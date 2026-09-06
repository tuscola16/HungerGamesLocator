import type { MapBoundary } from '../types';

/**
 * Client copy of the server's play-area boundary test (G1 / ROADMAP #64). Mirrors
 * `pointInBoundary`/`pointInPolygon` in `functions/src/geofence.ts` exactly so a
 * checkpoint the client accepts can always actually fire server-side. Shared by the
 * web GM dashboard (`@shared/common/geo`) and the mobile app (`@/common/geo`).
 */

/** Ray-casting point-in-polygon test (mirrors the geofence's #39 half). */
function pointInPolygon(
  lat: number,
  lng: number,
  poly: { latitude: number; longitude: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i].latitude;
    const xi = poly[i].longitude;
    const yj = poly[j].latitude;
    const xj = poly[j].longitude;
    const intersects =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Is a coordinate inside the play area? Polygon (≥3 verts) wins; else the bbox (#7). */
export function pointInBoundary(lat: number, lng: number, b: MapBoundary): boolean {
  if (Array.isArray(b.polygon) && b.polygon.length >= 3) {
    return pointInPolygon(lat, lng, b.polygon);
  }
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/**
 * Haversine distance in meters. Mirrors `distanceMeters` in `functions/src/geofence.ts`
 * so client-side distance judgements agree with the server's. Shared by the web GM
 * dashboard (`@shared/common/geo`) and the mobile app (`@/common/geo`).
 */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Minimum gap (m) between two checkpoint circles before they are called too close.
 *
 * Zero would mean "only flag actual overlap", which is too late: a fix good enough to be
 * judged against a 20 m radius still carries ~20–40 m of error, so two circles that merely
 * come close are indistinguishable to the receiver even when they don't intersect. This
 * margin is a whole radius of clearance between the rims.
 */
export const CHECKPOINT_MIN_GAP_M = 20;

/** One too-close checkpoint pair, with the numbers needed to explain it to the GM. */
export interface CheckpointProximity {
  a: { id: string; name: string };
  b: { id: string; name: string };
  /** Centre-to-centre distance in metres, rounded. */
  metres: number;
  /** True when the circles actually intersect (distance < the two radii combined). */
  overlapping: boolean;
}

/**
 * Find checkpoint pairs sited too close to tell apart (2026-09-06).
 *
 * Stonedam Day 2 placed **Bathrooms and The Docks 32 m apart, both with a 20 m radius** —
 * circles that literally intersect. A player who stopped between them was read as crossing
 * both, repeatedly: Emma generated **15 arrival docs in 13 minutes** alternating between
 * the two. `South Beach Start - Third Arrival` and `Stone Bench Beach` were the same 32 m
 * apart. Nothing in the editor said a word.
 *
 * Advisory, never a hard block — two objectives at one landmark can be a deliberate design
 * (a hidden checkpoint tucked inside a visible one), and a GM who means it should be able
 * to say so. It just must not be an accident any more.
 *
 * Returns pairs sorted closest-first. O(n²), which is nothing at the tens-of-checkpoints
 * scale these games run at.
 */
export function findCloseCheckpoints(
  checkpoints: { id: string; name?: string; latitude: number; longitude: number; radius?: number }[],
  minGapM: number = CHECKPOINT_MIN_GAP_M
): CheckpointProximity[] {
  const out: CheckpointProximity[] = [];
  for (let i = 0; i < checkpoints.length; i++) {
    for (let j = i + 1; j < checkpoints.length; j++) {
      const a = checkpoints[i];
      const b = checkpoints[j];
      if (
        typeof a.latitude !== 'number' || typeof a.longitude !== 'number' ||
        typeof b.latitude !== 'number' || typeof b.longitude !== 'number'
      ) continue;
      const d = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
      const rims = (a.radius ?? 0) + (b.radius ?? 0);
      if (d >= rims + minGapM) continue;
      out.push({
        a: { id: a.id, name: a.name || 'Unnamed checkpoint' },
        b: { id: b.id, name: b.name || 'Unnamed checkpoint' },
        metres: Math.round(d),
        overlapping: d < rims,
      });
    }
  }
  return out.sort((x, y) => x.metres - y.metres);
}
