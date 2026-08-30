"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Draggable bottom sheet with 3 snap points. Reports its current height so the map can pad itself. */
export default function Sheet({ children, onHeight, snap, setSnap }: { children: ReactNode; onHeight: (h: number) => void; snap: number; setSnap: (s: number) => void }) {
  const SNAPS = [0.16, 0.48, 0.88]; // fraction of viewport
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startY: number; startH: number; h: number } | null>(null);
  const vh = () => (typeof window === "undefined" ? 800 : window.innerHeight);
  const height = drag ? drag.h : SNAPS[snap] * vh();
  useEffect(() => { onHeight(height); }, [height, onHeight]);

  const onPointerDown = (e: React.PointerEvent) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDrag({ startY: e.clientY, startH: height, h: height }); };
  const onPointerMove = (e: React.PointerEvent) => { if (!drag) return; setDrag({ ...drag, h: Math.max(SNAPS[0] * vh(), Math.min(SNAPS[2] * vh(), drag.startH + (drag.startY - e.clientY))) }); };
  const onPointerUp = () => {
    if (!drag) return; const f = drag.h / vh(); let best = 0;
    SNAPS.forEach((s, i) => { if (Math.abs(s - f) < Math.abs(SNAPS[best] - f)) best = i; });
    setSnap(best); setDrag(null);
  };
  return (
    <div ref={ref} style={{ height, transition: drag ? "none" : "height .35s cubic-bezier(.2,.8,.2,1)" }}
      className="absolute inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-3xl bg-white/90 shadow-[0_-8px_40px_rgba(0,0,0,.18)] backdrop-blur-xl dark:bg-zinc-900/90">
      <div className="shrink-0 touch-none select-none py-3" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onClick={() => setSnap(snap === 0 ? 1 : snap === 1 ? 2 : 1)}>
        <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}
