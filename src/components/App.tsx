"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEST_STOP, schedule, stops, pathBetween } from "@/lib/data";
import { plan, refine, nextService, nearbyDepartures, activeServices, score } from "@/lib/planner";
import { busPositions } from "@/lib/bus";
import { fmtClock, fmtCountdown, fmtDur, DAY_NAMES } from "@/lib/time";
import type { Itinerary, LatLng, Route, Stop, RideLeg, WalkLeg } from "@/lib/types";
import Sheet from "./Sheet";
import SearchBox from "./SearchBox";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-full w-full bg-zinc-200 dark:bg-zinc-900" /> });

type Mode = "campus" | "home";
type Home = { lat: number; lng: number; label: string };
const LS = { home: "bm.home", mode: "bm.mode", origin: "bm.originPin" };

export default function App() {
  // ---- state
  const [mode, setMode] = useState<Mode>("campus");
  const [home, setHome] = useState<Home | null>(null);
  const [gps, setGps] = useState<LatLng | null>(null); const [gpsErr, setGpsErr] = useState<string | null>(null);
  const [originPin, setOriginPin] = useState<LatLng | null>(null);
  const [pinMode, setPinMode] = useState<null | "origin" | "home">(null);
  const [search, setSearch] = useState(false);
  const [whenStr, setWhenStr] = useState<string>("");       // "" = now, else datetime-local
  const [tick, setTick] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [refined, setRefined] = useState<Record<string, Itinerary>>({});
  const [snap, setSnap] = useState(1); const [sheetH, setSheetH] = useState(300);
  const [dark, setDark] = useState(false);
  const [install, setInstall] = useState<Event | null>(null);

  // ---- boot: storage, theme, gps, install prompt
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const h = localStorage.getItem(LS.home); if (h) setHome(JSON.parse(h)); const m = localStorage.getItem(LS.mode); if (m === "home" || m === "campus") setMode(m); const o = localStorage.getItem(LS.origin); if (o) setOriginPin(JSON.parse(o)); } catch {}
    const mq = window.matchMedia("(prefers-color-scheme: dark)"); setDark(mq.matches); const f = (e: MediaQueryListEvent) => setDark(e.matches); mq.addEventListener("change", f);
    const onInstall = (e: Event) => { e.preventDefault(); setInstall(e); }; window.addEventListener("beforeinstallprompt", onInstall);
    if (!navigator.geolocation) setGpsErr("No location support");
    const id = navigator.geolocation?.watchPosition((p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsErr(null); }, (e) => setGpsErr(e.message), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => { mq.removeEventListener("change", f); window.removeEventListener("beforeinstallprompt", onInstall); if (id != null) navigator.geolocation?.clearWatch(id); clearInterval(t); };
  }, []);
  useEffect(() => { try { localStorage.setItem(LS.mode, mode); } catch {} }, [mode]);
  const requestLocation = () => {
    if (!navigator.geolocation) { setGpsErr("No location support in this browser"); return; }
    setGpsErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsErr(null); },
      (e) => setGpsErr(e.code === 1 ? "permission denied — allow Location in the browser's site settings" : e.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  const saveHome = (h: Home | null) => { setHome(h); try { if (h) localStorage.setItem(LS.home, JSON.stringify(h)); else localStorage.removeItem(LS.home); } catch {} };
  const saveOriginPin = (p: LatLng | null) => { setOriginPin(p); try { if (p) localStorage.setItem(LS.origin, JSON.stringify(p)); else localStorage.removeItem(LS.origin); } catch {} };

  // ---- derived
  const origin = originPin ?? gps;
  const when = useMemo(() => (whenStr ? new Date(whenStr) : tick), [whenStr, tick]);
  const planKey = Math.floor(when.getTime() / 60000); // changes once a minute → replan
  const planDate = useMemo(() => new Date(planKey * 60000), [planKey]);
  const oLat = origin?.lat, oLng = origin?.lng;
  const dest: LatLng | null = mode === "campus" ? DEST_STOP : home;
  const destLabel = mode === "campus" ? "715 Broadway" : "Home";

  const dLat = dest?.lat, dLng = dest?.lng;
  const itineraries = useMemo(() => (oLat != null && oLng != null && dLat != null && dLng != null ? plan({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng }, planDate, destLabel) : []), [oLat, oLng, dLat, dLng, planDate, destLabel]);
  const shown = useMemo(() => itineraries.map((it) => refined[it.id] ?? it).sort((a, b) => score(a) - score(b)), [itineraries, refined]);
  const best = shown[0]; const selectedIt = shown.find((i) => i.id === selected) ?? best ?? null;

  // refine walking legs with real street routing, top 3 + walk-only
  useEffect(() => {
    const ctrl = new AbortController();
    itineraries.forEach(async (it) => { const r = await refine(it, ctrl.signal); if (r !== it && !ctrl.signal.aborted) setRefined((m) => ({ ...m, [it.id]: r })); });
    return () => ctrl.abort();
  }, [itineraries]);

  const buses = useMemo(() => (whenStr ? [] : busPositions(tick)), [tick, whenStr]);
  const nearby = useMemo(() => (oLat != null && oLng != null ? nearbyDepartures({ lat: oLat, lng: oLng }, planDate) : []), [oLat, oLng, planDate]);
  const active = useMemo(() => activeServices(planDate), [planDate]);
  const routeShapes = useMemo(() => active.map(({ route, service }) => ({ route, path: pathBetween(service.stops, 0, service.stops.length - 1) })), [active]);
  const routeStops = useMemo(() => {
    const m = new Map<string, { stop: Stop; routes: Route[] }>();
    active.forEach(({ route, service }) => service.stops.forEach((id) => { const e = m.get(id) ?? { stop: stops[id], routes: [] }; if (!e.routes.includes(route)) e.routes.push(route); m.set(id, e); }));
    return [...m.values()];
  }, [active]);
  const noService = active.length === 0 || (!shown.some((s) => !s.walkOnly));
  const next = useMemo(() => (noService ? nextService(planDate) : null), [noService, planDate]);
  const nowMin = when.getHours() * 60 + when.getMinutes() + when.getSeconds() / 60;
  const fitKey = `${selectedIt?.id ?? "none"}|${mode}|${!!origin}|${!!dest}`;

  const onMapClick = useCallback((p: LatLng) => {
    if (pinMode === "home") { saveHome({ ...p, label: "Pinned location" }); setMode("home"); }
    if (pinMode === "origin") saveOriginPin(p);
    setPinMode(null);
  }, [pinMode]);

  // ---- UI bits
  const seg = (m: Mode, label: string, emoji: string) => (
    <button onClick={() => { setMode(m); setSelected(null); if (m === "home" && !home) setSearch(true); }}
      className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === m ? "bg-violet-600 text-white shadow" : "text-zinc-700 dark:text-zinc-200"}`}>{emoji} {label}</button>
  );

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <MapView origin={origin} dest={dest} destLabel={destLabel} itinerary={selectedIt} buses={buses} routeStops={routeStops} routeShapes={routeShapes}
        onMapClick={onMapClick} pinMode={pinMode} dark={dark} fitKey={fitKey} bottomInset={sheetH} />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-md rounded-2xl bg-white/90 p-1.5 shadow-lg backdrop-blur-xl dark:bg-zinc-900/90">
          <div className="flex gap-1">{seg("campus", "To campus", "🎓")}{seg("home", "Home", "🏠")}</div>
        </div>
        <div className="pointer-events-auto mx-auto mt-2 flex max-w-md flex-wrap gap-2 text-xs">
          <Chip onClick={() => setSearch(true)}>🏠 {home ? home.label.slice(0, 28) : "Set home"}</Chip>
          <Chip onClick={() => setPinMode(pinMode === "origin" ? null : "origin")} active={pinMode === "origin"}>{originPin ? "📍 Start: pinned" : gps ? "📍 Start: my location" : "📍 Set start"}</Chip>
          {originPin && <Chip onClick={() => saveOriginPin(null)}>✕ use GPS</Chip>}
          <label className="relative">
            <Chip active={!!whenStr}>{whenStr ? `🕒 ${DAY_NAMES[when.getDay()]} ${fmtClock(when.getHours() * 60 + when.getMinutes())}` : "🕒 Now"}</Chip>
            <input type="datetime-local" value={whenStr} onChange={(e) => setWhenStr(e.target.value)} className="absolute inset-0 opacity-0" />
          </label>
          {whenStr && <Chip onClick={() => setWhenStr("")}>✕ now</Chip>}
        </div>
        {pinMode && <div className="pointer-events-auto mx-auto mt-2 max-w-md rounded-xl bg-violet-600 px-3 py-2 text-center text-sm font-medium text-white shadow">Tap the map to set {pinMode === "home" ? "Home" : "your start point"} <button className="ml-2 underline" onClick={() => setPinMode(null)}>cancel</button></div>}
        {gpsErr && !originPin && <div className="pointer-events-auto mx-auto mt-2 max-w-md rounded-xl bg-amber-100 px-3 py-2 text-center text-xs text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">Location unavailable ({gpsErr}). Tap “Set start” and pick a point on the map.</div>}
      </div>

      {/* bottom sheet */}
      <Sheet onHeight={setSheetH} snap={snap} setSnap={setSnap}>
        {!origin ? <Empty title="Where are you?" sub={gpsErr ? `Location error: ${gpsErr}` : "Allow location access, or pick your start point on the map."}
            action={<div className="flex justify-center gap-2"><button onClick={requestLocation} className="rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white">📍 Use my location</button><button onClick={() => { setPinMode("origin"); setSnap(0); }} className="rounded-xl bg-zinc-200 px-4 py-2 font-semibold dark:bg-zinc-700">Pick on map</button></div>} />
        : !dest ? <Empty title="Where's home?" sub="Search an address or drop a pin." action={<button onClick={() => setSearch(true)} className="rounded-xl bg-violet-600 px-4 py-2 font-semibold text-white">Set home</button>} />
        : noService ? <Empty title={active.length ? "No more buses today" : `No shuttle service on ${DAY_NAMES[planDate.getDay()]}`} sub={next ? `Next: ${next.route.name} ${DAY_NAMES[next.date.getDay()]} at ${fmtClock(next.firstMin)}` : "No upcoming service found"}>
            {shown[0] && <Card it={shown[0]} nowMin={nowMin} selected onClick={() => {}} />}
          </Empty>
        : (
          <>
            <Hero it={best} nowMin={nowMin} destLabel={destLabel} />
            {nearby.length > 0 && (
              <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {nearby.map((d, i) => (
                  <div key={i} className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800">
                    <div className="flex items-center gap-1.5"><Badge route={d.route} /><b>{fmtCountdown(d.departMin - nowMin)}</b></div>
                    <div className="mt-0.5 opacity-70">{d.stop.short} · {Math.round(d.walkMin)} min walk</div>
                  </div>
                ))}
              </div>
            )}
            <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide opacity-60">All options</h3>
            <div className="space-y-2">
              {shown.map((it) => <Card key={it.id} it={it} nowMin={nowMin} selected={selectedIt?.id === it.id} onClick={() => { setSelected(it.id); if (snap === 0) setSnap(1); }} />)}
            </div>
            <p className="mt-4 text-[11px] opacity-50">Scheduled times, not live GPS. {schedule.routes.map((r) => r.services[0]?.effective).filter(Boolean)[0]}</p>
          </>
        )}
      </Sheet>

      {/* locate + install fabs */}
      <div className="absolute right-3 z-[1000] flex flex-col gap-2 transition-all" style={{ bottom: sheetH + 12 }}>
        {install && <button onClick={async () => { (install as unknown as { prompt: () => Promise<void> }).prompt(); setInstall(null); }} className="rounded-full bg-violet-600 px-3 py-2 text-xs font-semibold text-white shadow-lg">Install app</button>}
        <button onClick={() => { saveOriginPin(null); setSelected(null); requestLocation(); }} className="grid h-11 w-11 place-items-center rounded-full bg-white text-lg shadow-lg dark:bg-zinc-800" aria-label="My location">🧭</button>
      </div>

      {search && <SearchBox initial={home?.label} onClose={() => setSearch(false)} onDropPin={() => { setSearch(false); setPinMode("home"); }} onPick={(p, label) => { saveHome({ ...p, label }); setMode("home"); setSearch(false); setSelected(null); }} />}
    </div>
  );
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return <button onClick={onClick} className={`rounded-full px-3 py-1.5 font-medium shadow backdrop-blur-xl ${active ? "bg-violet-600 text-white" : "bg-white/90 text-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100"}`}>{children}</button>;
}
function Badge({ route }: { route: Route }) { return <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: route.color }}>{route.id}</span>; }
function Empty({ title, sub, action, children }: { title: string; sub: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="py-4 text-center"><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm opacity-70">{sub}</p>{action && <div className="mt-3">{action}</div>}{children && <div className="mt-4 text-left">{children}</div>}</div>;
}

function Hero({ it, nowMin, destLabel }: { it: Itinerary; nowMin: number; destLabel: string }) {
  const ride = it.legs.find((l) => l.kind === "ride") as RideLeg | undefined;
  const leaveIn = it.leaveMin - nowMin; const busIn = ride ? ride.departMin - nowMin : 0;
  const urgent = leaveIn < 2;
  return (
    <div className="rounded-2xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${ride?.route.color ?? "#52525b"}, ${ride ? "#3b0764" : "#27272a"})` }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-80">{ride ? `Best way ${destLabel === "Home" ? "home" : "to campus"}` : "Walking is fastest"}</div>
          <div className="mt-1 text-3xl font-black leading-none">{ride ? (urgent ? "Leave now" : `Leave in ${fmtCountdown(leaveIn)}`) : `Walk ${fmtDur(it.walkMinutes)}`}</div>
          {ride && <div className="mt-2 text-sm opacity-95"><b>{ride.route.name}</b> departs <b>{ride.boardStop.short}</b> in <b>{fmtCountdown(busIn)}</b> · {fmtClock(ride.departMin)}</div>}
        </div>
        <div className="text-right"><div className="text-xs opacity-80">Arrive</div><div className="text-xl font-bold">{fmtClock(it.arriveMin)}</div><div className="text-xs opacity-80">{fmtDur(it.arriveMin - nowMin)} total</div></div>
      </div>
      {ride && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-white/20 px-2 py-1">🚶 {fmtDur((it.legs[0] as WalkLeg).kind === "walk" ? (it.legs[0] as WalkLeg).minutes : 0)} to stop</span>
          <span className="rounded-full bg-white/20 px-2 py-1">🚌 {fmtDur(ride.arriveMin - ride.departMin)} ride</span>
          <span className="rounded-full bg-white/20 px-2 py-1">🚶 {fmtDur(it.legs[it.legs.length - 1].kind === "walk" ? (it.legs[it.legs.length - 1] as WalkLeg).minutes : 0)} to {destLabel === "Home" ? "home" : "715"}</span>
        </div>
      )}
    </div>
  );
}

function Card({ it, nowMin, selected, onClick }: { it: Itinerary; nowMin: number; selected: boolean; onClick: () => void }) {
  const ride = it.legs.find((l) => l.kind === "ride") as RideLeg | undefined;
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!selected) setOpen(false); }, [selected]); // eslint-disable-line react-hooks/set-state-in-effect
  const leaveIn = it.leaveMin - nowMin;
  return (
    <div onClick={() => { onClick(); if (selected) setOpen((o) => !o); }} className={`cursor-pointer rounded-2xl border p-3 transition ${selected ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40" : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {ride ? <><span>🚶{Math.round((it.legs[0].kind === "walk" ? (it.legs[0] as WalkLeg).minutes : 0))}</span><span className="opacity-40">›</span><Badge route={ride.route} /><span className="font-semibold">{fmtClock(ride.departMin)}</span><span className="opacity-40">›</span><span>🚶{Math.round(it.legs[it.legs.length - 1].kind === "walk" ? (it.legs[it.legs.length - 1] as WalkLeg).minutes : 0)}</span></>
                : <span>🚶 Walk the whole way · {fmtDur(it.walkMinutes)}</span>}
        </div>
        <div className="text-right text-sm"><div className="font-bold">{fmtClock(it.arriveMin)}</div><div className="text-xs opacity-60">{ride ? (leaveIn < 1 ? "leave now" : `leave in ${fmtCountdown(leaveIn)}`) : fmtDur(it.arriveMin - nowMin)}</div></div>
      </div>
      {ride && <div className="mt-1 text-xs opacity-70">Board at {ride.boardStop.short} → off at {ride.alightStop.short} · {ride.stopsBetween.length + 1} stops · {fmtDur(ride.arriveMin - ride.departMin)}</div>}
      {open && (
        <ol className="mt-3 space-y-2 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-700">
          {it.legs.map((l, i) => l.kind === "walk"
            ? <li key={i} className="flex gap-2"><span>🚶</span><span>Walk {fmtDur(l.minutes)} ({Math.round(l.meters)} m) to <b>{l.toName}</b>{!l.exact && <span className="opacity-50"> · est.</span>}</span></li>
            : <li key={i} className="flex gap-2"><span>🚌</span><span><b>{l.route.name}</b> · board <b>{fmtClock(l.departMin)}</b> at {l.boardStop.name}<br />ride {fmtDur(l.arriveMin - l.departMin)}, {l.stopsBetween.length ? `via ${l.stopsBetween.map((s) => s.short).join(", ")}, ` : ""}get off <b>{fmtClock(l.arriveMin)}</b> at {l.alightStop.name}</span></li>)}
        </ol>
      )}
    </div>
  );
}
