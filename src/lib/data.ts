import stopsJson from "../../data/stops.json";
import scheduleJson from "../data/schedule.json";
import shapesJson from "../data/shapes.json";
import type { Schedule, Stop, ShapeLeg } from "./types";

export const schedule = scheduleJson as unknown as Schedule;
export const stops: Record<string, Stop> = Object.fromEntries((stopsJson.stops as Stop[]).map((s) => [s.id, s]));
export const shapes = shapesJson as unknown as Record<string, ShapeLeg>;
export const DEST_STOP = stops[schedule.destination];

export function legShape(a: string, b: string): [number, number][] {
  const s = shapes[`${a}>${b}`];
  if (s) return s.coords;
  return [[stops[a].lat, stops[a].lng], [stops[b].lat, stops[b].lng]];
}
export function pathBetween(stopIds: string[], i: number, j: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = i; k < j; k++) {
    const seg = legShape(stopIds[k], stopIds[k + 1]);
    out.push(...(out.length ? seg.slice(1) : seg));
  }
  return out;
}
