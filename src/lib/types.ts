export type LatLng = { lat: number; lng: number };
export type Stop = { id: string; name: string; short: string; lat: number; lng: number };
export type Service = { label: string; days: number[]; effective: string; source: string; stops: string[]; trips: (number | null)[][] };
export type Route = { id: string; name: string; color: string; desc: string; services: Service[] };
export type Schedule = { generatedAt: string; destination: string; routes: Route[] };
export type ShapeLeg = { dist: number; coords: [number, number][] };

export type WalkLeg = { kind: "walk"; from: LatLng; to: LatLng; toName: string; minutes: number; meters: number; path: [number, number][]; exact: boolean };
export type RideLeg = {
  kind: "ride"; route: Route; service: Service; tripIndex: number;
  boardStop: Stop; boardIndex: number; departMin: number;
  alightStop: Stop; alightIndex: number; arriveMin: number;
  path: [number, number][]; stopsBetween: Stop[];
};
export type Itinerary = {
  id: string; legs: (WalkLeg | RideLeg)[];
  leaveMin: number;     // minutes-since-midnight you must leave origin
  arriveMin: number;    // arrival at destination
  walkMinutes: number; rideMinutes: number; waitMinutes: number;
  route?: Route; walkOnly: boolean;
};
