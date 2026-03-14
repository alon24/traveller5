# TransitIL — TODO

## Phase 1 — Foundation ✅
- [x] Install all dependencies
- [x] Configure vite.config.js proxy rules (MOT, Rail, Weather)
- [x] Set up React Router with all 6 routes
- [x] Create AppShell, Header, BottomNav, SidebarNav
- [x] Set up Zustand stores (location, trip, weather, alerts, map)
- [x] Set up React Query client
- [x] Create .env.example with all keys documented
- [x] Update index.html title and meta
- [x] Create PROJECT.md

## Phase 2 — Map & Location
- [ ] Wire useGeolocation to AppShell (start watch on mount)
- [ ] Verify TransitMap loads correctly with a valid API key
- [ ] UserMarker shows GPS position as blue dot
- [ ] Map centers on user location when GPS acquired

## Phase 3 — Trip Planning
- [ ] PlaceAutocomplete works with Google Places (Israel-restricted)
- [ ] PlanForm swaps origin/destination correctly
- [ ] useDirections calls Google Directions API and returns routes
- [ ] RouteOptionCard renders duration, transfer chips
- [ ] RouteTimeline shows step-by-step with correct icons
- [ ] RoutePolyline draws on map when route selected

## Phase 4 — GTFS Static
- [ ] Create gtfsWorker.js (Web Worker for ZIP decompress + CSV parse)
- [ ] Wire gtfsIndex build from worker output
- [ ] Store index in IndexedDB (idb-keyval or native)
- [ ] useNearbyStops returns stops sorted by distance
- [ ] NearbyPage shows StopCard list
- [ ] StopCard shows route chips (from GTFS index)
- [ ] StopMarker renders on map for nearby stops

## Phase 5 — GTFS Real-Time
- [ ] Verify gtfs-realtime.proto decodes vehicle positions correctly
- [ ] useVehiclePositions polls every 15s without errors
- [ ] BusMarker component renders on map with correct position
- [ ] BusMarker click shows route info
- [ ] useTripUpdates fetches delay data
- [ ] ArrivalRow shows ETA from scheduled time + delay

## Phase 6 — Trains
- [ ] StationPicker loads israel-rail-stations.json and filters
- [ ] israelRail.js returns departures from Israel Railways API
- [ ] DepartureBoard renders TrainRow list
- [ ] TrainRow shows delay in red when > 0

## Phase 7 — Weather
- [ ] useWeather fetches current + forecast for user coordinates
- [ ] WeatherBanner shows in Header on mobile
- [ ] HomePage weather card shows temp, conditions, humidity
- [ ] WeatherAlert modal fires when rain/extreme temp detected

## Phase 8 — Departure Alerts
- [ ] AlertForm created and wired to RouteOptionCard "Set Alert" button
- [ ] useAlertStore.addAlert saves to localStorage
- [ ] scheduleAllAlerts registers timeouts on app start
- [ ] System notification fires at correct time
- [ ] AlertsPage shows saved alerts with delete button

## Phase 9 — PWA & Polish
- [ ] Configure vite-plugin-pwa with manifest.json
- [ ] Add loading skeleton screens for async states
- [ ] Accessibility: aria-labels on icon-only buttons
- [ ] RTL: Hebrew stop names render correctly (dir="auto" on text)
- [ ] Test on mobile Chrome — layout, touch targets, scroll
- [ ] Run Lighthouse — target PWA score ≥ 90

## Phase 10 — Deployment
- [ ] Write Cloudflare Worker (CORS proxy for MOT + Rail)
- [ ] Set VITE_PROXY_BASE_URL for production build
- [ ] Deploy to Cloudflare Pages (or Vercel)
- [ ] Set environment variables in hosting dashboard
- [ ] Restrict Google Maps API key to production domain
- [ ] Smoke test all integrations in production
