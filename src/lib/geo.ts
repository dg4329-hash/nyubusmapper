import type { LatLng } from "./types";
const R = 6371000;
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
export const WALK_MPS = 1.25;          // ~2.8 mph effective — matches Google Maps walking times in Manhattan (includes crossings)
const GRID_FACTOR = 1.3;               // straight line → Manhattan street distance
export function estWalkMeters(a: LatLng, b: LatLng) { return haversine(a, b) * GRID_FACTOR; }
export function estWalkMinutes(a: LatLng, b: LatLng) { return estWalkMeters(a, b) / WALK_MPS / 60; }
export function pathLength(path: [number, number][]) {
  let d = 0; for (let i = 1; i < path.length; i++) d += haversine({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] }); return d;
}
/** Point at fraction f (0..1) of the way along path by distance */
export function pointAlong(path: [number, number][], f: number): [number, number] {
  if (path.length === 1) return path[0];
  const total = pathLength(path); const target = Math.max(0, Math.min(1, f)) * total; let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = haversine({ lat: path[i - 1][0], lng: path[i - 1][1] }, { lat: path[i][0], lng: path[i][1] });
    if (acc + seg >= target) { const t = seg ? (target - acc) / seg : 0; return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]; }
    acc += seg;
  }
  return path[path.length - 1];
}
