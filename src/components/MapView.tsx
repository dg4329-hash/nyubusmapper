"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Itinerary, LatLng, Stop, Route } from "@/lib/types";
import type { BusPosition } from "@/lib/bus";
import { fmtCountdown } from "@/lib/time";

export type MapProps = {
  origin: LatLng | null; dest: LatLng | null; destLabel: string;
  itinerary: Itinerary | null; buses: BusPosition[]; routeStops: { stop: Stop; routes: Route[] }[];
  routeShapes: { route: Route; path: [number, number][] }[];
  onMapClick?: (p: LatLng) => void; pinMode: null | "origin" | "home"; dark: boolean; fitKey: string; bottomInset: number;
};

const CENTER: [number, number] = [40.7345, -73.985];

function Fit({ itinerary, origin, dest, fitKey, bottomInset }: Pick<MapProps, "itinerary" | "origin" | "dest" | "fitKey" | "bottomInset">) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [];
    if (itinerary) itinerary.legs.forEach((l) => pts.push(...l.path));
    else { if (origin) pts.push([origin.lat, origin.lng]); if (dest) pts.push([dest.lat, dest.lng]); }
    if (pts.length < 2) { if (pts.length === 1) map.flyTo(pts[0], 15, { duration: 0.6 }); return; }
    map.flyToBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 120], paddingBottomRight: [40, bottomInset + 30], duration: 0.7, maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}
function Clicks({ onMapClick }: { onMapClick?: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}
const icon = (html: string, size: number, cls = "") => L.divIcon({ html, className: `bm-icon ${cls}`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

export default function MapView(p: MapProps) {
  const originIcon = useMemo(() => icon(`<div class="bm-dot"></div>`, 22), []);
  const homeIcon = useMemo(() => icon(`<div class="bm-pin">🏠</div>`, 34), []);
  const campusIcon = useMemo(() => icon(`<div class="bm-pin">🎓</div>`, 34), []);
  const ride = p.itinerary?.legs.find((l) => l.kind === "ride");
  const tiles = p.dark
    ? "https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  return (
    <MapContainer center={CENTER} zoom={14} zoomControl={false} className={`h-full w-full ${p.pinMode ? "cursor-crosshair" : ""}`} attributionControl={false}>
      <TileLayer key={tiles} url={tiles} subdomains="abcd" maxZoom={19} />
      <Fit itinerary={p.itinerary} origin={p.origin} dest={p.dest} fitKey={p.fitKey} bottomInset={p.bottomInset} />
      <Clicks onMapClick={p.onMapClick} />

      {/* faint full route lines */}
      {p.routeShapes.map(({ route, path }, i) => (
        <Polyline key={`rs-${route.id}-${i}`} positions={path} pathOptions={{ color: route.color, weight: 3, opacity: p.itinerary && !p.itinerary.walkOnly ? 0.18 : 0.45, lineCap: "round" }} />
      ))}
      {/* stops */}
      {p.routeStops.map(({ stop, routes }) => (
        <CircleMarker key={stop.id} center={[stop.lat, stop.lng]} radius={4.5} pathOptions={{ color: routes[0].color, weight: 2, fillColor: p.dark ? "#111" : "#fff", fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}><span className="text-xs font-medium">{stop.name}</span><br /><span className="text-[10px] opacity-70">{routes.map((r) => r.name).join(" · ")}</span></Tooltip>
        </CircleMarker>
      ))}
      {/* selected itinerary */}
      {p.itinerary?.legs.map((l, i) =>
        l.kind === "walk" ? (
          <Polyline key={i} positions={l.path} pathOptions={{ color: p.dark ? "#e5e7eb" : "#374151", weight: 4, dashArray: "1 9", lineCap: "round", opacity: 0.9 }} />
        ) : (
          <Polyline key={i} positions={l.path} pathOptions={{ color: l.route.color, weight: 7, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
        ),
      )}
      {ride && ride.kind === "ride" && (
        <>
          <CircleMarker center={[ride.boardStop.lat, ride.boardStop.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: ride.route.color, fillOpacity: 1 }}><Tooltip permanent direction="right" offset={[10, 0]} className="bm-label">Board · {ride.boardStop.short}</Tooltip></CircleMarker>
          <CircleMarker center={[ride.alightStop.lat, ride.alightStop.lng]} radius={8} pathOptions={{ color: "#fff", weight: 3, fillColor: ride.route.color, fillOpacity: 1 }}><Tooltip permanent direction="right" offset={[10, 0]} className="bm-label">Get off · {ride.alightStop.short}</Tooltip></CircleMarker>
        </>
      )}
      {/* buses */}
      {p.buses.map((b) => (
        <Marker key={b.id} position={b.pos} icon={L.divIcon({ html: `<div class="bm-bus" style="background:${b.route.color}"><span>${b.route.id}</span></div>`, className: "bm-icon", iconSize: [26, 26], iconAnchor: [13, 13] })} zIndexOffset={500}>
          <Tooltip direction="top" offset={[0, -12]}><b>{b.route.name}</b> · scheduled<br />next: {b.nextStopName} in {fmtCountdown(b.etaMin)}</Tooltip>
        </Marker>
      ))}
      {p.origin && <Marker position={[p.origin.lat, p.origin.lng]} icon={originIcon} zIndexOffset={900} />}
      {p.dest && <Marker position={[p.dest.lat, p.dest.lng]} icon={p.destLabel === "Home" ? homeIcon : campusIcon} zIndexOffset={800}><Tooltip direction="top" offset={[0, -16]}>{p.destLabel}</Tooltip></Marker>}
    </MapContainer>
  );
}
