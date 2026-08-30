import { schedule, stops, pathBetween } from "./data";
import { estWalkMeters, WALK_MPS } from "./geo";
import { walkRoute } from "./osrm";
import type { Itinerary, LatLng, RideLeg, WalkLeg, Service, Route } from "./types";

const MAX_WALK_M = 2600;   // ignore stops farther than ~30 min walk
const MIN_LEAD_MIN = 0.5;  // must reach the stop at least 30s before departure
const WALK_PENALTY = 0.5;  // each minute walked counts as 1.5 min when ranking (people prefer riding)
const LATE_TOLERANCE_MIN = 30; // still show a bus option if it arrives up to this much later than walking
export const score = (it: Itinerary) => it.arriveMin + WALK_PENALTY * it.walkMinutes;

export function activeServices(date: Date): { route: Route; service: Service }[] {
  const d = date.getDay();
  return schedule.routes.flatMap((route) => route.services.filter((s) => s.days.includes(d)).map((service) => ({ route, service })));
}

function walkLeg(from: LatLng, to: LatLng, toName: string): WalkLeg {
  const meters = estWalkMeters(from, to);
  return { kind: "walk", from, to, toName, meters, minutes: meters / WALK_MPS / 60, path: [[from.lat, from.lng], [to.lat, to.lng]], exact: false };
}

/** Plan trips from origin to dest departing at `date`. Returns itineraries sorted by arrival. */
export function plan(origin: LatLng, dest: LatLng, date: Date, destName: string, maxResults = 4): Itinerary[] {
  const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const direct = walkLeg(origin, dest, destName);
  const walkOnly: Itinerary = { id: "walk", legs: [direct], leaveMin: now, arriveMin: now + direct.minutes, walkMinutes: direct.minutes, rideMinutes: 0, waitMinutes: 0, walkOnly: true };

  const out: Itinerary[] = [];
  for (const { route, service } of activeServices(date)) {
    const ids = service.stops;
    const wA = ids.map((id) => walkLeg(origin, stops[id], stops[id].name));
    const wB = ids.map((id) => walkLeg(stops[id], dest, destName));
    service.trips.forEach((trip, tripIndex) => {
      let best: Itinerary | null = null; let bestScore = Infinity;
      for (let i = 0; i < ids.length; i++) {
        const ti = trip[i]; if (ti == null || wA[i].meters > MAX_WALK_M) continue;
        if (ti < now + wA[i].minutes + MIN_LEAD_MIN) continue;
        for (let j = i + 1; j < ids.length; j++) {
          const tj = trip[j]; if (tj == null || ids[j] === ids[i] || wB[j].meters > MAX_WALK_M) continue;
          const arrive = tj + wB[j].minutes;
          if (arrive > walkOnly.arriveMin + LATE_TOLERANCE_MIN) continue; // far worse than walking
          const score = arrive + WALK_PENALTY * (wA[i].minutes + wB[j].minutes);
          if (best && score >= bestScore) continue;
          bestScore = score;
          const ride: RideLeg = {
            kind: "ride", route, service, tripIndex, boardStop: stops[ids[i]], boardIndex: i, departMin: ti,
            alightStop: stops[ids[j]], alightIndex: j, arriveMin: tj, path: pathBetween(ids, i, j), stopsBetween: ids.slice(i + 1, j).map((s) => stops[s]),
          };
          const legs: (WalkLeg | RideLeg)[] = [];
          if (wA[i].meters > 25) legs.push(wA[i]);
          legs.push(ride);
          if (wB[j].meters > 25) legs.push(wB[j]);
          best = {
            id: `${route.id}-${service.label}-${tripIndex}-${i}-${j}`, legs, route, walkOnly: false,
            leaveMin: ti - wA[i].minutes, arriveMin: arrive, walkMinutes: wA[i].minutes + wB[j].minutes, rideMinutes: tj - ti, waitMinutes: 0,
          };
        }
      }
      if (best) out.push(best);
    });
  }
  const all = [...out, walkOnly];
  all.sort((a, b) => score(a) - score(b) || a.arriveMin - b.arriveMin);
  // drop options dominated by one already kept (leaves later AND arrives no later)
  const kept: Itinerary[] = [];
  for (const it of all) { if (kept.some((k) => k.leaveMin >= it.leaveMin - 0.01 && k.arriveMin <= it.arriveMin + 0.01)) continue; kept.push(it); if (kept.length >= maxResults) break; }
  if (!kept.includes(walkOnly)) kept.push(walkOnly);
  return kept;
}

/** Replace estimated walking legs with real OSRM foot routes; returns a new itinerary (or the same if nothing changed). */
export async function refine(it: Itinerary, signal?: AbortSignal): Promise<Itinerary> {
  const legs = await Promise.all(it.legs.map(async (l) => {
    if (l.kind !== "walk" || l.exact) return l;
    const r = await walkRoute(l.from, l.to, signal); if (!r) return l;
    return { ...l, meters: r.meters, minutes: r.seconds / 60, path: r.path, exact: true } as WalkLeg;
  }));
  if (legs.every((l, i) => l === it.legs[i])) return it;
  const ride = legs.find((l) => l.kind === "ride") as RideLeg | undefined;
  const first = legs[0], last = legs[legs.length - 1];
  const walkMinutes = legs.filter((l) => l.kind === "walk").reduce((s, l) => s + (l as WalkLeg).minutes, 0);
  if (!ride) return { ...it, legs, walkMinutes, arriveMin: it.leaveMin + walkMinutes };
  const leaveMin = ride.departMin - (first.kind === "walk" ? first.minutes : 0);
  const arriveMin = ride.arriveMin + (last.kind === "walk" ? last.minutes : 0);
  return { ...it, legs, walkMinutes, leaveMin, arriveMin };
}

/** Next day (within 7) that has any service, and its first departure — for the "no more buses" state */
export function nextService(from: Date): { date: Date; firstMin: number; route: Route } | null {
  for (let k = 0; k < 8; k++) {
    const d = new Date(from); d.setDate(d.getDate() + k); d.setHours(0, 0, 0, 0);
    let best: { firstMin: number; route: Route } | null = null;
    for (const { route, service } of activeServices(d)) for (const t of service.trips) {
      const f = t.find((v) => v != null) as number | undefined;
      if (f == null) continue;
      if (k === 0 && f <= from.getHours() * 60 + from.getMinutes()) continue;
      if (!best || f < best.firstMin) best = { firstMin: f, route };
    }
    if (best) return { date: d, ...best };
  }
  return null;
}

export type Departure = { stop: Stop; walkMin: number; route: Route; departMin: number; headsign: string };
import type { Stop } from "./types";
/** Next departures from the stops closest to `origin` (for the "next bus near you" strip). */
export function nearbyDepartures(origin: LatLng, date: Date, limit = 4): Departure[] {
  const now = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const out: Departure[] = [];
  for (const { route, service } of activeServices(date)) {
    service.stops.forEach((id, i) => {
      if (i === service.stops.length - 1) return; // terminal arrival column
      const stop = stops[id]; const walkMin = estWalkMeters(origin, stop) / WALK_MPS / 60;
      if (walkMin > 15) return;
      const last = stops[service.stops[service.stops.length - 1]];
      for (const t of service.trips) {
        const ti = t[i]; if (ti == null || ti < now + walkMin) continue;
        out.push({ stop, walkMin, route, departMin: ti, headsign: `to ${last.short}` });
        break; // only the next one per stop/route
      }
    });
  }
  // dedupe by stop+route keep earliest; sort by soonest
  const seen = new Set<string>();
  return out.sort((a, b) => a.departMin - b.departMin).filter((d) => { const k = d.stop.id + d.route.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}
