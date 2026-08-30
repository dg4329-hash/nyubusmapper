// Converts every data/schedules/*.xlsx into src/data/schedule.json
// Run: npm run import
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const SRC_DIR = path.join(ROOT, "data", "schedules");
const OUT = path.join(ROOT, "src", "data", "schedule.json");
const stopsFile = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "stops.json"), "utf8"));

const ROUTE_META = {
  E: { name: "Route E", color: "#7c3aed", desc: "715 Broadway ↔ Langone loop" },
  W: { name: "Route W", color: "#f59e0b", desc: "Weekend loop (Downtown + Langone)" },
  C: { name: "Route C", color: "#0ea5e9", desc: "Stuy Town → 715 Broadway (mornings)" },
};

export function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, " at ")
    .replace(/\band\b/g, " at ")
    .replace(/[().,]/g, " ")
    .replace(/\b(\d+)(st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasMap = new Map();
for (const s of stopsFile.stops) {
  for (const a of [s.name, ...(s.aliases || [])]) aliasMap.set(normalize(a), s.id);
}
function resolveStop(header) {
  const n = normalize(header);
  if (aliasMap.has(n)) return { id: aliasMap.get(n), role: /arrival/.test(n) ? "arrival" : /departure/.test(n) ? "departure" : null };
  const stripped = n.replace(/\b(departure|arrival)\b/g, "").trim();
  if (aliasMap.has(stripped)) return { id: aliasMap.get(stripped), role: /arrival/.test(n) ? "arrival" : /departure/.test(n) ? "departure" : null };
  return null;
}

function toMinutes(cell) {
  if (cell == null || cell === "" || cell === "-") return null;
  if (cell instanceof Date) return cell.getHours() * 60 + cell.getMinutes();
  if (typeof cell === "number") return Math.round(((cell % 1) * 24 * 60));
  const m = String(cell).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i);
  if (!m) return undefined; // not a time
  let h = +m[1]; const mm = +m[2];
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h * 60 + mm;
}
const isTime = (c) => { const v = toMinutes(c); return v === null || typeof v === "number"; };

function daysFrom(text) {
  const t = text.toLowerCase();
  if (/mon(day)?\s*[-–]\s*thu/.test(t)) return [1, 2, 3, 4];
  if (/mon(day)?\s*[-–]\s*fri/.test(t)) return [1, 2, 3, 4, 5];
  if (/weekend|sat/.test(t)) return [6, 0];
  if (/\bfri/.test(t)) return [5];
  return null;
}

const routes = {};
for (const file of fs.readdirSync(SRC_DIR).filter((f) => /\.xlsx?$/i.test(f) && !f.startsWith("~$"))) {
  const routeId = (file.match(/Route\s+([A-Z])\b/i) || [])[1]?.toUpperCase();
  if (!routeId) { console.warn(`skip ${file}: cannot find route letter`); continue; }
  const wb = XLSX.readFile(path.join(SRC_DIR, file), { cellDates: false });
  const fileDays = daysFrom(file) || (routeId === "W" ? [6, 0] : null);

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
    const effectRow = rows.find((r) => r.some((c) => typeof c === "string" && /schedule in effect/i.test(c)));
    const effect = effectRow ? String(effectRow.find((c) => c)) : "";
    const yr = (effect.match(/20\d\d/) || [])[0];
    if (yr && +yr < 2024) { console.log(`skip ${file} / ${sheetName}: stale (${effect})`); continue; }
    const days = daysFrom(sheetName) || fileDays;
    if (!days) { console.warn(`skip ${file} / ${sheetName}: no day info`); continue; }

    const hi = rows.findIndex((r) => r.filter((c) => typeof c === "string" && c && !isTime(c)).length >= 3 && r.some((c) => resolveStop(c)));
    if (hi < 0) { console.warn(`skip ${file} / ${sheetName}: no header`); continue; }
    const header = rows[hi];
    const cols = [];
    header.forEach((h, i) => {
      if (h == null || /internal use/i.test(String(h))) return;
      const r = resolveStop(h);
      if (!r) { console.warn(`  unknown stop header "${h}" in ${file}/${sheetName} — add an alias in data/stops.json`); return; }
      cols.push({ i, ...r });
    });
    const trips = [];
    for (const r of rows.slice(hi + 1)) {
      const t = cols.map((c) => { const v = toMinutes(r[c.i]); return typeof v === "number" ? v : null; });
      if (t.some((v) => v !== null)) trips.push(t);
    }
    // sort by first defined time, treating trips starting mid-route by their first stop time offset
    trips.sort((a, b) => firstTime(a) - firstTime(b));
    const route = (routes[routeId] ||= { id: routeId, ...ROUTE_META[routeId], services: [] });
    route.services.push({
      label: sheetName.trim(),
      days,
      effective: effect.replace(/schedule in effect:\s*/i, "").trim(),
      source: file,
      stops: cols.map((c) => c.id),
      trips,
    });
    console.log(`✓ ${routeId} ${sheetName}: ${cols.length} stops, ${trips.length} trips, days ${days.join(",")}`);
  }
}
function firstTime(t) { const i = t.findIndex((v) => v !== null); return t[i]; }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), destination: "broadway-715", routes: Object.values(routes) }, null, 1));
console.log("wrote", path.relative(ROOT, OUT));
