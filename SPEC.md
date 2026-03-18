# TransitIL — Technical Specification

> Status: as-built (March 2026)
> Platform: Israeli public transit PWA (bus + train + trip planning)

---

## 1. Overview

TransitIL is a mobile-first React PWA for Israeli public transit. It combines several public data sources — MOT GTFS static files, Stride (Hasadna Open Bus), SIRI vehicle locations, Israel Railways API, and Google Maps — into a unified interface with four main capabilities:

1. **Nearby** — See bus stops and lines within 500 m, select a line to view its route and live bus positions.
2. **Lines** — Search any line number (city-optional) from the GTFS catalogue.
3. **Trains** — Station-to-station departure board from Israel Railways.
4. **Trip planning** — Google Maps transit directions with multi-leg steps.

Secondary features: favorites (saved stop+line combos), departure alerts (desktop notifications), weather banners, and a settings screen with fallback location.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 18.3 + Vite | SPA, no SSR |
| Routing | React Router v6 | Lazy-loaded pages |
| Data fetching | TanStack React Query | Shared query client, no refetch-on-focus |
| State | Zustand | 6 stores (map, location, favorites, alerts, trip, weather) |
| Styling | Tailwind CSS | Dark theme throughout |
| Maps | Google Maps JS API v3 | AdvancedMarker, Polyline, DirectionsService |
| Build/test | Vitest (unit) + Playwright (E2E) | Real Chromium in E2E |

---

## 3. Proxy Configuration

All external APIs are proxied through Vite's dev server (also mirrored in `vitest.config.js`) to avoid CORS and expose API keys only server-side:

| Proxy path | Target | Auth |
|---|---|---|
| `/proxy/mot` | `https://gtfs.mot.gov.il` | `Ocp-Apim-Subscription-Key` header |
| `/proxy/stride` | `https://open-bus-stride-api.hasadna.org.il` | None (public API) |
| `/proxy/overpass/1` | `https://overpass-api.de` | None |
| `/proxy/curlbus/{code}` | CurlBus departure API | None |
| `/proxy/rail` | Israel Railways schedule API | None |
| `/gtfs/` | Local static files (station list, etc.) | — |

---

## 4. Data Sources

### 4.1 MOT GTFS Static (`/proxy/mot`)

The Israeli Ministry of Transport publishes a single large ZIP archive (`israel-public-transportation.zip`) containing GTFS CSV files (routes, stops, stop_times, trips, etc.).

**Loading strategy** (`src/services/api/gtfsRoutes.js`):
- Module exports two lazily-initialised promises: `getGtfsRoutes()` and `getGtfsStops()`.
- On first call the ZIP central directory is fetched via `Range` request (no full download).
- Individual files (`routes.txt`, `stops.txt`) are decompressed with the browser's native `DecompressionStream`.
- The parsed result is cached in a module-level variable — subsequent calls return immediately without network.
- ZIP64 format is supported for files whose uncompressed size exceeds 4 GB.

**Key fields returned:**

`getGtfsRoutes()` → `[{ routeId, ref, from, to, colour, operator, motLineId, direction }]`

`getGtfsStops()` → `[{ stopId, stopCode, name, lat, lng }]`

**Derived function:** `searchGtfsRoutes(lineRef, city)` — filters the full route list by `route_short_name = lineRef` and, if a city string is given, further filters by case-insensitive substring match against the `from` or `to` terminal name.

### 4.2 MOT GTFS-RT

Binary Protobuf feeds served at `/proxy/mot/gtfsrealtime/`:

| Feed | Path | Content |
|---|---|---|
| VehiclePosition | `/VehiclePosition` | Live bus lat/lng + trip_id |
| TripUpdate | `/TripUpdate` | Per-stop delay updates |
| ServiceAlert | `/ServiceAlert` | Line-level alerts |

Decoded by `src/services/gtfs/gtfsRtDecoder.js` using ProtoBufJS with the standard `gtfs-realtime.proto` schema loaded from `/proto/`.

**Usage:** `useVehiclePositions()` polls every 15 s when enabled. As of the latest work this feed is superseded by the SIRI feed (Stride) for the active-line bus-icon use case because the GTFS-RT feed requires MOT API authentication, while Stride is public.

### 4.3 Stride — Hasadna Open Bus (`/proxy/stride`)

The primary source for:
- Ordered stop sequences per route (`/gtfs_rides/list`, `/gtfs_ride_stops/list`)
- SIRI vehicle locations without API key (`/siri_vehicle_locations/list`)
- Route lookup by line number or GTFS route_id (`/gtfs_routes/list`)

**Key functions** (`src/services/api/stride.js`):

| Function | Endpoint(s) | Returns |
|---|---|---|
| `getLineStopsFromStride(lineRef, gtfsRouteId)` | `/gtfs_routes/list` → `/gtfs_rides/list` → `/gtfs_ride_stops/list` | Ordered `[{id, name, lat, lng}]` |
| `getSiriLineRef(relId)` | `/gtfs_routes/list?route_short_name=N` | `[siriLineRef, ...]` |
| `getLineRefsForStopAndLine(stopCode, lineNumber)` | `/gtfs_ride_stops/list?gtfs_stop__code=…` | `[lineRef, ...]` (city-scoped) |
| `fetchSiriVehicleLocations(siriLineRefs)` | `/siri_vehicle_locations/list` (parallel per ref) | `[{vehicleId, lat, lng, bearing, velocity, recordedAt}]` |

**SIRI timing:** Uses a 10-minute look-back window to account for Stride's ~2-minute ingestion delay from the SIRI source.

**Session-level caches:**
- `_cache`: route-stops per routeId/lineRef
- `_siriLineRefCache`: relId → `[siriLineRef]`
- `_stopLineCache`: `"stopCode:lineNumber"` → `[lineRef]`

### 4.4 Overpass (OpenStreetMap)

Used to enrich nearby stops with route information (line colour, operator, destination name) when MOT GTFS data is insufficient.

`overpassQuery(query)` (`src/services/api/overpass.js`) races three Overpass mirrors in parallel with 12 s per-mirror timeout. First successful response wins; others are aborted.

### 4.5 Israel Railways API (`/proxy/rail`)

`getTrainDepartures(fromStation, toStation, date)` returns structured departure objects with `{departureTime, arrivalTime, platform, trainNumber, status}`. Station codes are numeric.

### 4.6 Google Maps

| Service | Usage |
|---|---|
| `DirectionsService` | Trip planning (TRANSIT mode) and route shape polylines (DRIVING mode fallback) |
| `Geocoder` | Address → lat/lng and reverse |
| `PlacesAutocomplete` | Origin/destination search in PlanPage |
| `AdvancedMarkerElement` | Bus icons and stop pins on all maps |

The API key is embedded in `index.html` as a `<script src="...key=...">` tag.

### 4.7 Open-Meteo

`getCurrentWeather(lat, lng)` and `getHourlyForecast(lat, lng)` from `src/services/api/weather.js`. No API key. Used exclusively for the weather alert banner on the home screen.

---

## 5. State Management (Zustand Stores)

### `useLocationStore`
Wraps the browser Geolocation API. Exposes `coords {lat, lng}`, `accuracy`, and a boolean `watching`. Falls back to a user-configurable location (default: Rehovot) stored in localStorage when GPS is unavailable or denied.

### `useMapStore`
Viewport state (`center`, `zoom`) plus UI toggles (`showBusMarkers`, `showStopMarkers`). Also holds `selectedStopId` and `selectedVehicleId` for map-driven selection.

### `useFavoritesStore`
Persists to `localStorage["transitil_favorites"]`. Each favorite is `{id, stopId, stopName, routeRef, routeRelId, routeColour, routeTo}`. `isFavorite(stopId, routeRef, routeRelId)` is an O(n) scan — acceptable for typical favorites count.

### `useAlertStore`
Departure reminders. Each alert has a target departure time; `alertScheduler.js` registers `setTimeout` calls at app boot for alerts that haven't fired yet. Missed alerts (< 30 min in the past) fire immediately.

### `useTripStore`
Holds origin, destination, `departureTime`, and the `routes` array returned by Google DirectionsService. `selectedRouteIndex` drives which route is displayed on the map.

### `useWeatherStore`
Holds raw current + hourly weather from Open-Meteo. `detectAlert()` scans the next 6 hours of hourly data for thunderstorms (WMO codes 95–99) or extreme temperatures (> 37 °C or < 3 °C) and sets a `currentAlert` string.

---

## 6. Route Identity System (relId)

A central design challenge is that line "16" is not unique in Israel — it runs in multiple cities with different operators and routes. The app uses a **relId** string to identify a specific route variant:

| Format | Example | Source |
|---|---|---|
| `gtfs:{siriLineRef}` | `gtfs:11230` | Stride SIRI integer line_ref (from `getLineRefsForStopAndLine`) |
| `gtfs:{motRouteId}` | `gtfs:12345678` | Exact MOT GTFS route_id (from local GTFS catalogue match) |
| `mot-line:{lineNumber}` | `mot-line:16` | Line number only (ambiguous) |
| `mot-line:{lineNumber}:{stopCode}` | `mot-line:16:20012` | Line + MOT stop code (city-scoped) |

**Note:** The `gtfs:` prefix is overloaded. `useRouteStops` distinguishes the two `gtfs:` sub-cases: it first tries `getRouteByGtfsId(n)` against the local GTFS catalogue — if found, `n` is a MOT route_id; if not found, `n` is treated as a Stride SIRI line_ref and passed directly to Stride.

**Resolution pipeline** (`useRelIdResolver` hook + `stride.js`):

1. When a user taps a line in the Nearby tab, the stop's MOT code is embedded: `mot-line:16:20012`.
2. `getSiriLineRef` strips the stop code from the relId using `relId.slice(9).split(':')[0]` to get just the line number, then fetches all GTFS routes for that line number from Stride.
3. For precise stop-level disambiguation, `getLineRefsForStopAndLine(stopCode, lineNumber)` queries `/gtfs_ride_stops/list` filtered by that specific stop — returning only the Stride SIRI line_refs that actually serve that stop on today's schedule.
4. `useRelIdResolver` calls these with rate limiting (semaphore: max 2 concurrent Stride requests) and caches results per `stopCode:lineRef` for the session.

**relId normalisation in caching:** `useRouteStops` and `useRouteShape` both normalise `mot-line:16:stopCode` → `mot-line:16` as the React Query cache key, so that selecting the same line from two different nearby stops reuses the cached route shape.

---

## 7. Hooks Reference

### `useNearbyStops(lat, lng, radius = 500)`

Two-phase async merge:

**Phase 1 — GTFS stops** (localStorage cache, 5-min TTL, key: `ns8:stops:{lat2dp}:{lng2dp}:500`):
- Calls `getGtfsStops()` (module-level cache after first fetch).
- Haversine-filters to `radius` metres.

**Phase 2 — Overpass routes** (localStorage cache, 15-min TTL):
- Nodes-only Overpass query on the bounding box (no full relation walk).
- Returns route tags per OSM node.

**Merge logic:**
1. Exact match: GTFS stop code = OSM `ref` tag → attach colour, operator, line refs.
2. Proximity fallback: closest OSM node within 50 m → attach its route data.
3. Route list is deduplicated by `ref` (line number), sorted numerically.
4. Final list sorted by haversine distance ascending.

**Output:** `[{ id, name, ref, lat, lng, distance, routes: [{ref, to, colour, relId}] }]`

### `useSiriVehiclePositions(relId)`

- Disabled when `relId` is null/undefined (no line selected).
- On enable: calls `getSiriLineRef(relId)` → then `fetchSiriVehicleLocations(lineRefs)`.
- `refetchInterval: 30_000` (30 s), `staleTime: 25_000`.
- React Query cache key: `['siri-vehicles', relId]`.

### `useRouteStops(relId)`

Dispatches based on relId prefix:
- `gtfs:` → first looks up the route in the local GTFS ZIP via `getRouteByGtfsId(routeId)`. If found, calls `getLineStopsFromStride(route.ref, routeId)`. If not found (routeId is a raw SIRI line_ref), falls back to `getLineStopsFromStride(null, routeId)`.
- `mot-line:` → strips the stop code if present, calls `getLineStopsFromStride(lineNumber)`. If a stopCode is encoded (`mot-line:16:20012`), first calls `getLineRefsForStopAndLine(stopCode, lineRef)` for a city-precise match, then falls back to the unscoped Stride lookup, then to GTFS terminal stops.
- Numeric string → Overpass relation query, returning members with `role=stop*`.

Cache key is normalised: `mot-line:16:stopCode` → `mot-line:16`. `staleTime: 1 hour` (route stop sequences change at most once per day).

### `useRouteShape(relId)`

Fetches a smooth road-following polyline. Only fires for `gtfs:` and `mot-line:` prefixes — numeric OSM relIds return `null` (NearbyMap falls back to the `routeStops` sequence for those).

**Internal stop resolution:** calls its own `getStopsForShape(relId)` — a parallel implementation to `useRouteStops` that benefits from the same Stride module-level caches but is NOT wired to the React Query cache of `useRouteStops`.

**Directions API strategy (key distinction):**
- If the stop list has **intermediate stops** → builds up to 23 waypoints (subsampled evenly) → calls `DirectionsService` in **DRIVING mode directly** (no TRANSIT attempt). More intermediate stops = more accurate road following.
- If the stop list is **exactly 2 stops** (terminals only, no intermediates) → tries **TRANSIT+BUS mode first**, then falls back to DRIVING if no transit route is returned.

The rationale: when waypoints are available, DRIVING with waypoints is faster and more accurate than TRANSIT for short Israeli bus routes. TRANSIT is only worthwhile as a first attempt when we have no intermediate guidance.

**Polyline decoding:** iterates all legs → all steps → decodes each step's encoded polyline via `google.maps.geometry.encoding.decodePath`. Concatenated step-level points give much higher density than the simplified overview polyline.

**Module-level cache:** `_shapeCache` keyed by normalised relId (stop code stripped from `mot-line:`). A Promise is stored immediately on first call so concurrent calls share the same in-flight request.

Returns `null` (loading), `[]` (failed/no route), or `[{lat, lng}, ...]`.

### `useRelIdResolver()`

Returns a `resolveRelId(stopCode, lineRef, lineTo)` function. On call:
- Acquires semaphore slot (max 2 concurrent).
- Primary: calls `getLineRefsForStopAndLine(stopCode, lineRef)` → if a Stride SIRI line_ref is returned, builds `gtfs:{siriLineRef}`.
- Fallback: scans local GTFS routes by `lineRef` + destination string match → if found, builds `gtfs:{motRouteId}`.
- Last resort: returns `mot-line:{lineRef}` (ambiguous, no city context).
- Result cached in component-ref map keyed by `stopCode:lineRef`.
- Previous in-flight request for the same key is aborted via `AbortController`.
- **Note:** The resolved relId is intentionally not fed back into `selectedLine` state to avoid re-triggering `useRouteShape` and causing visible flicker. It's used only for arrivals and future reference.

### `useStopArrivals(stopCode)`

CurlBus proxy at `/proxy/curlbus/{stopCode}`. Returns `[{lineRef, etaMinutes}]` sorted ascending by ETA. Polls every 30 s, stale after 20 s. Used in the `LineArrivalsStrip` sub-component of each active line row.

### `useLineSearch(lineRef, city)`

Calls `searchGtfsRoutes(lineRef, city)` — pure in-memory filter of the GTFS route list. 10-min stale time. Disabled when `lineRef` is empty.

---

## 8. NearbyPage — Detailed Flow

The `NearbyPage` is the most complex component. It combines four tabs in one view with a persistent bottom map panel.

### Tab state isolation

Each tab has independent selection state:
- **Nearby tab:** `selectedId` (expanded stop), `selectedLine {ref, relId, colour, stopId}`
- **Lines tab:** `selectedSearchLine {ref, relId, colour, to}`
- **Favorites tab:** `selectedFav {routeRef, routeRelId, routeColour, routeTo}`
- **Trains tab:** `selectedTrainIdx`

Tab switching clears the _other_ tabs' selections (e.g. switching to Lines clears selectedLine).

### `activeRelId` and cross-tab SIRI polling

A single `useSiriVehiclePositions(activeRelId)` call is shared across all tabs:

```
activeRelId =
  tab === 'favorites' ? selectedFav?.routeRelId
  tab === 'lines'     ? selectedSearchLine?.relId
  default             ? selectedLine?.relId
```

This means the SIRI poll is active in exactly one tab at a time. When no line is selected (across all tabs), `activeRelId` is `undefined` and polling is disabled.

### Line click → relId encoding

When a line is clicked in the **Nearby** tab, the stop's MOT code is embedded in the relId:

```js
const relId = stopCode ? `mot-line:${route.ref}:${stopCode}` : route.relId;
```

This makes the initial `useRouteStops` and `useSiriVehiclePositions` calls geographic — Stride can narrow the route to those serving that specific stop.

### Map layout

The page uses a CSS `flex` split between list (top) and map (bottom), animated via a cubic-bezier transition. Three `mode` values drive the split ratios:

| Mode | List flex | Map flex | Trigger |
|---|---|---|---|
| `default` | 55 | 45 | Initial / line cleared |
| `map` | 28 | 72 | Line selected |
| `list` | 80 | 20 | Header double-tap |

Non-Nearby tabs use a simpler 45/55 or 55/45 split.

### NearbyMap polyline lifecycle

`NearbyMap` manages a single `google.maps.Polyline` instance via a `useRef`. When `routeShape` changes:
- If null/empty: `polyline.setMap(null)` to hide.
- Otherwise: `polyline.setPath(routeShape); polyline.setMap(map)` — no new Polyline created.

This avoids the Google Maps memory issue of accumulating invisible Polyline objects.

---

## 9. Bus Icon Rendering

When `busPositions` (from `useSiriVehiclePositions`) is non-empty:

1. `NearbyMap` receives `busPositions: [{vehicleId, lat, lng, bearing, velocity, recordedAt}]`.
2. For each vehicle, an `AdvancedMarker` is rendered at `{lat, lng}`.
3. The marker content is an inline SVG bus icon with a drop-shadow ellipse (CSS `fill="rgba(0,0,0,0.25)"`).
4. The SVG is rotated by `bearing` degrees.
5. On hover, a tooltip shows `vehicleId`, speed, and `recordedAt` time.

The SIRI data window is 10 minutes, so stale buses (no recent ping) naturally fall off without explicit removal logic.

---

## 10. Caching Layers

The app has three distinct caching layers, each with different scope and TTL:

| Layer | Scope | Key examples | TTL |
|---|---|---|---|
| Module-level `Map`/`Promise` | Session (page lifetime) | GTFS routes, GTFS stops, Stride route stops, SIRI line refs | Infinite |
| `localStorage` | Cross-session | GTFS stops per area (`ns8:stops:…`), Overpass routes per area (`ns8:routes:…`), rail station coords | 5–30 min / 30 days |
| React Query | Component lifetime | `['siri-vehicles', relId]`, `['route-stops', relId]`, `['line-search', ref, city]` | Query-specific stale times |

**Cache version:** The localStorage key prefix is `ns8`. Bumping this invalidates all cached nearby data across all user sessions — useful after schema changes.

---

## 11. Testing

### Unit tests (Vitest)

Run via `vitest.config.js` which also configures the same proxy routes so tests can make real network calls.

| Test file | What it covers |
|---|---|
| `src/test/relIdResolver.test.js` | Cache hit, concurrency (semaphore), AbortSignal propagation |
| `src/test/gtfsRoutes.test.js` | ZIP range parsing, CSV with BOM and quoted fields, `parseFromTo` |
| `src/test/nearbyStops.test.js` | Haversine distance, stop-code exact match, proximity 50 m fallback, merge + sort order |

### E2E tests (Playwright)

All specs run against `http://localhost:5173` (dev server must be running).

| Spec | Assertion |
|---|---|
| `app-loads.spec.ts` | Home screen renders without crash |
| `bus-icon.spec.ts` | No SIRI requests before line selected; SIRI polled within 20 s after selection; screenshot captured |
| `bus-realtime.spec.ts` | 3 SIRI poll batches in ≤ 90 s; first batch within 8 s of line click |
| `line16.spec.ts` | Lines tab: all stops appear, polyline has 100+ path points, no console errors |
| `maps-loads.spec.ts` | MapPage renders |
| `google.spec.ts` | Google Maps API loads |
| `nearby-*.spec.ts`, `debug-*.spec.ts` | Development/debug helpers |

**Geolocation mocking:** `page.context().setGeolocation({latitude, longitude})` combined with `grantPermissions(['geolocation'])` provides deterministic coordinates. Jerusalem (`31.7767, 35.2345`) is used as a reliable location where line 16 exists.

---

## 12. Known Design Decisions and Trade-offs

### A. relId not updated after resolver fires
`useRelIdResolver` resolves a more precise `gtfs:` relId asynchronously after the user clicks a line. This resolved value is intentionally **not** written back to `selectedLine` to prevent `useRouteShape` from re-running with a new cache key, which would reset the polyline to `null` and cause visible flicker. The first render of `useRouteShape` does use the embedded stopCode (`mot-line:16:20012`) for city-precise stop resolution, but its module-level cache normalises the key to `mot-line:16` — so the *second* user to select line 16 from a different stop in the same session gets the cached shape from the first selection, not a newly-resolved city-specific one.

### B. No route stops from GTFS static
`useRouteStops` uses Stride (online) rather than the local GTFS stop_times file. This keeps the ZIP download small (only `routes.txt` and `stops.txt` are fetched), but means route stop data requires a network call per line.

### C. GTFS-RT vehicle positions superseded by SIRI
The `useVehiclePositions()` hook (GTFS-RT from MOT) is still in the codebase but is no longer the primary vehicle source. `useSiriVehiclePositions()` via Stride is preferred because it requires no API key and the SIRI feed is more reliable for bus positions in Israel.

### D. Overpass nodes-only (no relations)
`useNearbyStops` queries Overpass for nodes only, not full route relations. This is much faster (seconds vs. 30+ seconds for relation walks) but means line colour/destination data comes from OSM node tags, which may be less complete than the MOT GTFS data. The GTFS merge step compensates by overwriting colour with the MOT GTFS value when a code match is found.

### E. Polyline uses DRIVING fallback
Google Maps TRANSIT directions often fail for short-distance or non-rail routes in Israel. When intermediate stops are available, `useRouteShape` goes directly to DRIVING mode (skipping TRANSIT) with up to 23 subsampled waypoints, ensuring every selected line gets a road-following polyline. The cost is that DRIVING routing may diverge from the actual bus path where the bus takes bus-only lanes or shortcuts.

### F. `isFavorite` is O(n)
The favorites store scans the full array on each render for each line row. For typical usage (< 50 favorites) this is fine, but would degrade with a large favorites list.

---

## 13. File Structure

```
/app/traveller5/
├── index.html                        # Google Maps script tag + app mount
├── vite.config.js                    # Proxy + Tailwind
├── vitest.config.js                  # Test proxy + browser provider
├── package.json
├── src/
│   ├── App.jsx                       # Router + lazy page imports
│   ├── main.jsx                      # QueryClientProvider + alert scheduler init
│   ├── config/
│   │   ├── constants.js              # ISRAEL_CENTER, poll intervals, URLs
│   │   └── queryClient.js            # Default retry + stale-time config
│   ├── stores/
│   │   ├── useLocationStore.js
│   │   ├── useMapStore.js
│   │   ├── useFavoritesStore.js
│   │   ├── useAlertStore.js
│   │   ├── useTripStore.js
│   │   └── useWeatherStore.js
│   ├── services/
│   │   ├── api/
│   │   │   ├── axiosInstance.js      # Axios clients for MOT + rail
│   │   │   ├── gtfsRoutes.js         # ZIP range fetch + CSV parse
│   │   │   ├── stride.js             # Stride API + SIRI vehicle locations
│   │   │   ├── overpass.js           # OSM mirror racing
│   │   │   ├── googleMaps.js         # Directions + geocoding
│   │   │   ├── israelRail.js         # Train departures
│   │   │   ├── railStationCoords.js  # Station geocoding cache
│   │   │   └── weather.js            # Open-Meteo
│   │   ├── gtfs/
│   │   │   ├── gtfsRtDecoder.js      # Protobuf decoding
│   │   │   ├── gtfsParser.js         # CSV parser
│   │   │   └── gtfsIndex.js          # Spatial grid index
│   │   └── notifications/
│   │       └── alertScheduler.js     # setTimeout-based departure alerts
│   ├── hooks/
│   │   ├── useNearbyStops.js
│   │   ├── useGtfsRealtime.js        # useVehiclePositions + useSiriVehiclePositions
│   │   ├── useRouteStops.js
│   │   ├── useRouteShape.js
│   │   ├── useStopArrivals.js
│   │   ├── useRelIdResolver.js
│   │   ├── useLineSearch.js
│   │   ├── useTrainSchedule.js
│   │   ├── useDirections.js
│   │   ├── useGeolocation.js
│   │   ├── useWeather.js
│   │   └── useMediaQuery.js
│   ├── pages/
│   │   ├── NearbyPage.jsx            # Main multi-tab page
│   │   ├── HomePage.jsx
│   │   ├── MapPage.jsx
│   │   ├── PlanPage.jsx
│   │   ├── TrainsPage.jsx
│   │   ├── AlertsPage.jsx
│   │   ├── FavoritesPage.jsx
│   │   └── SettingsPage.jsx
│   ├── components/
│   │   ├── map/                      # TransitMap, AdvancedMarker, RoutePolyline, UserMarker
│   │   ├── nearby/                   # NearbyMap
│   │   ├── trains/                   # TrainMap, StationPicker, TrainRow
│   │   ├── trip/                     # PlaceAutocomplete, LocationPickerModal, RouteOptionCard
│   │   ├── layout/                   # AppShell, Header, SidebarNav, BottomNav
│   │   ├── common/                   # LoadingSpinner, ErrorMessage, Badge, EmptyState
│   │   └── alerts/                   # AlertCard
│   └── test/
│       ├── relIdResolver.test.js
│       ├── gtfsRoutes.test.js
│       └── nearbyStops.test.js
├── bus-icon.spec.ts
├── bus-realtime.spec.ts
├── line16.spec.ts
├── app-loads.spec.ts
├── maps-loads.spec.ts
├── google.spec.ts
├── nearby-*.spec.ts
└── debug-*.spec.ts
```

---

## 14. Data Flow Diagrams

### Nearby Stop → Live Bus Positions

```
User GPS coords
      │
      ▼
useNearbyStops(lat, lng)
  ├─ Phase 1: getGtfsStops()          [module cache → ZIP range fetch]
  │      haversine filter → nearby GTFS stops
  └─ Phase 2: overpassQuery(bbox)      [localStorage 15-min cache]
         merge by code / proximity 50m
              │
              ▼
        stops[] displayed in list
              │
        User clicks line badge
              │
              ▼
    handleLineClick(route, stop)
      sets selectedLine = {
        ref: "16",
        relId: "mot-line:16:20012",   ← stop code embedded
        colour: "#...",
        stopId: "..."
      }
              │
      ┌───────────┬────────────────────┐
      │           │                    │
      ▼           ▼                    ▼
useRouteStops  useRouteShape      useSiriVehiclePositions
("mot-line:16:20012")             ("mot-line:16:20012")
      │        (independent stop        │
      │         resolution via          │
      │         getStopsForShape)    getSiriLineRef(relId)
      │           │                   strips stopCode → "16"
      │           │                   /gtfs_routes?route_short_name=16
      │           │                   returns [lineRef1, lineRef2, ...]
      │           │                         │
      ▼           │                   fetchSiriVehicleLocations([lr1, lr2])
  routeStops[]   │                   /siri_vehicle_locations/list
   (for markers) │                   10-min window, dedup by vehicle_ref
                 │                         │
                 ▼                   busPositions[]
           polyline [{lat,lng}]            │
           (waypoints >0 → DRIVING         │
            directly; terminals            │
            only → TRANSIT first,          │
            then DRIVING fallback)         │
                 │                         │
                 └───────────┬─────────────┘
                             ▼
                       NearbyMap renders:
                         • Polyline (single instance, path updated)
                         • Stop markers for routeStops[]
                         • AdvancedMarkers for busPositions[]
                           (SVG bus icon, rotated by bearing)
```

### Trip Planning Flow

```
User types origin / destination
      │
      ▼
PlaceAutocomplete → Google Places API
      │
      ▼
useTripStore {origin, destination, departureTime}
      │
      ▼
useDirections() → DirectionsService (TRANSIT mode)
      │
      ▼
routes[] → RouteOptionCard per route
      │
User taps route → selectedRouteIndex
      │
      ▼
RoutePolyline on TransitMap
      │
User taps "Alert" → useAlertStore.add()
      │
      ▼
alertScheduler.js: setTimeout → Notification API
```
