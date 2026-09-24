# Ride 715

A mobile web app that finds the fastest NYU shuttle trip to 715 Broadway, or back home.

## What it does

- Plans door-to-door trips (walk → shuttle → walk) from your location or a dropped pin, and compares them against just walking. Rides are ranked by arrival time, with a small penalty on walking minutes.
- Two modes: **To campus** (715 Broadway) and **Home** (any address you search for or pin; saved in your browser only).
- Shows where each scheduled bus should be right now, interpolated along real road geometry between timed stops.
- Walking directions come from the public OSRM foot-routing server; address search uses OpenStreetMap Nominatim.
- Installable PWA with a service worker, light and dark map themes.

Times come from NYU's published shuttle schedule spreadsheets (Routes C, E and W). They are scheduled times, not live GPS, and this is an unofficial student project.

## Tech stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Leaflet / react-leaflet, SheetJS (`xlsx`) for schedule import. Deploys to Vercel with no configuration and no environment variables.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Updating the schedule data:

```bash
npm run import     # data/schedules/*.xlsx -> src/data/schedule.json
npm run shapes     # road geometry between stops (OSRM) -> src/data/shapes.json
npm run data       # both
```

Drop new route spreadsheets into `data/schedules/`. Stop coordinates and the header aliases used to match spreadsheet columns live in `data/stops.json`.

## Structure

```
data/            source schedule spreadsheets + hand-placed stop coordinates
scripts/         schedule import and road-shape fetch scripts
src/app/         Next.js entry, layout, global styles
src/components/  App shell, map, search box, bottom sheet, service-worker registration
src/lib/         trip planner, simulated bus positions, geo helpers, OSRM client
public/          PWA manifest, icons, service worker
```

## Status

Working, built around the 2025-26 schedules. Schedules need re-importing when NYU publishes new ones.
