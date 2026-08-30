// Fetches road geometry between consecutive stops for each route service (OSRM), writes src/data/shapes.json
// Run: npm run shapes   (needs internet; result is committed so the app works offline)
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const stops = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(ROOT, "data/stops.json"), "utf8")).stops.map((s) => [s.id, s]));
const schedule = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/schedule.json"), "utf8"));
const OUT = path.join(ROOT, "src/data/shapes.json");
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const out = {};
for (const r of schedule.routes) for (const svc of r.services) {
  for (let i = 0; i < svc.stops.length - 1; i++) {
    const a = stops[svc.stops[i]], b = stops[svc.stops[i + 1]];
    if (a.id === b.id) continue;
    const key = `${a.id}>${b.id}`;
    if (out[key] || existing[key]) { out[key] = out[key] || existing[key]; continue; }
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const j = await (await fetch(url)).json();
    if (j.code !== "Ok") { console.warn("fail", key, j); continue; }
    const rt = j.routes[0];
    out[key] = { dist: Math.round(rt.distance), coords: rt.geometry.coordinates.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]) };
    console.log(key, out[key].dist, "m");
    await new Promise((res) => setTimeout(res, 250));
  }
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("wrote", Object.keys(out).length, "legs");
