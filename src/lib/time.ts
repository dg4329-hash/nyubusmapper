export function nowMinutes(d = new Date()) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
export function fmtClock(min: number) {
  const m = Math.round(min) % (24 * 60); let h = Math.floor(m / 60); const mm = m % 60; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${mm.toString().padStart(2, "0")} ${ap}`;
}
export function fmtDur(min: number) {
  const m = Math.max(0, Math.round(min)); if (m < 60) return `${m} min`; return `${Math.floor(m / 60)} hr ${m % 60 ? (m % 60) + " min" : ""}`.trim();
}
export function fmtCountdown(min: number) {
  if (min < 1) return "now"; if (min < 60) return `${Math.floor(min)} min`; const h = Math.floor(min / 60), m = Math.floor(min % 60); return m ? `${h}h ${m}m` : `${h}h`;
}
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
