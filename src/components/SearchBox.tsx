"use client";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/types";

type Hit = { display_name: string; lat: string; lon: string };
export default function SearchBox({ onPick, onDropPin, onClose, initial }: { onPick: (p: LatLng, label: string) => void; onDropPin: () => void; onClose: () => void; initial?: string }) {
  const [q, setQ] = useState(initial ?? ""); const [hits, setHits] = useState<Hit[]>([]); const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q.trim().length < 3) { setHits([]); return; }
    const ctrl = new AbortController(); setBusy(true);
    const t = setTimeout(async () => {
      try {
        const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&viewbox=-74.06,40.60,-73.85,40.88&bounded=1&q=${encodeURIComponent(q)}`;
        const r = await fetch(u, { signal: ctrl.signal, headers: { Accept: "application/json" } });
        setHits(await r.json());
      } catch { /* aborted */ } finally { setBusy(false); }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);
  const short = (h: Hit) => { const parts = h.display_name.split(", "); return { title: parts.slice(0, 2).join(", "), sub: parts.slice(2, 5).join(", ") }; };
  return (
    <div className="absolute inset-0 z-[1100] flex flex-col bg-white dark:bg-zinc-950">
      <div className="flex items-center gap-2 p-3 pt-[max(.75rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="rounded-full p-2 text-xl leading-none hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Back">←</button>
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search address for Home…" className="flex-1 rounded-2xl bg-zinc-100 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-violet-500 dark:bg-zinc-800" />
      </div>
      <button onClick={onDropPin} className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-dashed border-violet-400 px-4 py-3 text-left text-violet-700 dark:text-violet-300">
        <span className="text-xl">📍</span><span><b>Drop a pin on the map</b><br /><span className="text-xs opacity-70">Tap anywhere to set Home</span></span>
      </button>
      <div className="flex-1 overflow-y-auto px-3">
        {busy && <p className="px-2 py-3 text-sm opacity-60">Searching…</p>}
        {hits.map((h, i) => { const s = short(h); return (
          <button key={i} onClick={() => onPick({ lat: +h.lat, lng: +h.lon }, s.title)} className="flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <span className="mt-0.5 text-lg">📌</span><span><span className="block font-medium">{s.title}</span><span className="block text-xs opacity-60">{s.sub}</span></span>
          </button>); })}
        {!busy && q.length >= 3 && !hits.length && <p className="px-2 py-3 text-sm opacity-60">No results in NYC — try a street address, or drop a pin.</p>}
      </div>
    </div>
  );
}
