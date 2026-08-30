import { stops, legShape } from "./data";
import { pointAlong } from "./geo";
import { activeServices } from "./planner";
import type { Route } from "./types";

export type BusPosition = { id: string; route: Route; pos: [number, number]; nextStopName: string; etaMin: number; heading: number };

/** Where every scheduled bus should be right now, interpolated along road geometry between timed stops. */
export function busPositions(date: Date): BusPosition[] {
  const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const out: BusPosition[] = [];
  for (const { route, service } of activeServices(date)) {
    service.trips.forEach((trip, ti) => {
      // find timed segment containing now
      let prev = -1;
      for (let k = 0; k < trip.length; k++) {
        if (trip[k] == null) continue;
        if (prev >= 0 && trip[prev]! <= now && now < trip[k]!) {
          const ids = service.stops.slice(prev, k + 1);
          let path: [number, number][] = [];
          for (let s = 0; s < ids.length - 1; s++) { const seg = legShape(ids[s], ids[s + 1]); path.push(...(path.length ? seg.slice(1) : seg)); }
          if (path.length < 2) path = [[stops[ids[0]].lat, stops[ids[0]].lng], [stops[ids[ids.length - 1]].lat, stops[ids[ids.length - 1]].lng]];
          const f = (now - trip[prev]!) / (trip[k]! - trip[prev]!);
          const pos = pointAlong(path, f), ahead = pointAlong(path, Math.min(1, f + 0.02));
          const heading = (Math.atan2(ahead[1] - pos[1], ahead[0] - pos[0]) * 180) / Math.PI;
          out.push({ id: `${route.id}-${service.label}-${ti}`, route, pos, nextStopName: stops[service.stops[k]].short, etaMin: trip[k]! - now, heading });
          break;
        }
        prev = k;
      }
    });
  }
  return out;
}
