# Ride 715 · NYU Shuttle PWA

Fastest NYU shuttle route to 715 Broadway or home — Google-Maps-style, from the official schedule spreadsheets.

- `npm run dev` — local dev at http://localhost:3000
- `npm run import` — rebuild `src/data/schedule.json` from `data/schedules/*.xlsx` (drop new route files there)
- `npm run shapes` — fetch road geometry between stops (OSRM) into `src/data/shapes.json`
- Stop coordinates live in `data/stops.json`

Deploys to Vercel with zero config.
