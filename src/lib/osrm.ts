import type { LatLng } from "./types";
const BASE = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";
const cache = new Map<string, Promise<WalkRoute | null>>();
export type WalkRoute = { meters: number; seconds: number; path: [number, number][] };
const key = (a: LatLng, b: LatLng) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
export function walkRoute(a: LatLng, b: LatLng, signal?: AbortSignal): Promise<WalkRoute | null> {
  const k = key(a, b);
  if (!cache.has(k)) {
    const p = (async () => {
      try {
        const url = `${BASE}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(url, { signal: signal ?? ctrl.signal }); clearTimeout(t);
        const j = await r.json(); if (j.code !== "Ok") return null;
        const rt = j.routes[0];
        return { meters: rt.distance, seconds: rt.duration, path: rt.geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng]) };
      } catch { cache.delete(k); return null; }
    })();
    cache.set(k, p);
  }
  return cache.get(k)!;
}
