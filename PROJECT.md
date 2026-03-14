# TransitIL — Israel Public Transit Planner

A real-time public transit trip planner for Israel, built as a Progressive Web App.

## Features

- **Trip Planning** — Point A → Point B routing via Google Directions (transit mode, buses + trains)
- **Live Bus Tracking** — Real-time bus locations from Israel MOT GTFS-RT feeds, shown as clickable icons on the map
- **Train Schedule** — Departure board for any Israel Railways station pair
- **Nearby Stops** — Find bus stops near you (both directions) with live lines at each stop
- **Weather** — Current conditions + hourly forecast with rain/extreme weather alerts
- **Departure Alerts** — Push notification when it's time to leave for your trip
- **Responsive** — Mobile-first design with bottom tab nav; desktop sidebar layout
- **PWA** — Installable, offline-capable

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router 6 |
| State | Zustand 4 (5 stores) |
| Server State | TanStack React Query 5 |
| Maps | @react-google-maps/api + Google Maps JS API |
| GTFS-RT | protobufjs (decode binary protobufs) |
| GTFS Static | fflate (in-browser ZIP decompress) + Web Worker |
| Icons | lucide-react |
| Notifications | Web Notifications API + react-hot-toast |
| PWA | vite-plugin-pwa + Workbox |

## APIs Used

| API | Purpose |
|---|---|
| Google Maps JavaScript API | Map display |
| Google Directions API | A→B transit routing |
| Google Places API | Address autocomplete (Israel-restricted) |
| Google Geocoding API | Reverse geocode user location |
| Israel MOT GTFS static | Stop names, locations, route numbers |
| Israel MOT GTFS-RT | Real-time vehicle positions + delays |
| Israel Railways API | Train departure board |
| OpenWeatherMap | Current weather + hourly forecast |
| Browser Geolocation API | User GPS position |
| Web Notifications API | Departure alerts |

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure API keys

```bash
cp .env.example .env.local
# Edit .env.local and fill in your API keys
```

Required keys:
- `VITE_GOOGLE_MAPS_API_KEY` — [Google Cloud Console](https://console.cloud.google.com/)
  - Enable: Maps JavaScript API, Directions API, Places API, Geocoding API
  - Restrict to your domain + `localhost`
- `VITE_OPENWEATHER_API_KEY` — [OpenWeatherMap](https://openweathermap.org/api) (free tier)

### 3. Run

```bash
npm run dev
```

Open at `http://localhost:5173`

## Architecture

```
src/
├── config/        Constants, React Query client
├── stores/        Zustand stores (location, trip, weather, alerts, map)
├── services/      API wrappers (Google Maps, weather, GTFS, trains)
├── hooks/         React Query hooks + geolocation
├── pages/         Route-level components (6 pages)
└── components/    UI components (layout, map, trip, nearby, weather, trains, alerts, common)
```

### CORS Strategy

Israeli government APIs (MOT GTFS, Israel Railways) don't send CORS headers. In development, Vite's dev server proxies requests. In production, a Cloudflare Worker (or similar edge function) acts as a CORS proxy.

### GTFS Data Flow

```
App start → fetch ZIP from proxy → Web Worker decompresses + parses CSV
         → build spatial stop index → store in IndexedDB
         → useNearbyStops queries index with GPS coords
```

### Real-Time Polling

React Query polls GTFS-RT feeds every 15 seconds. All components sharing the same query key get the same cached data — only one network request is made per interval.

## Known Limitations

- **Departure alerts** require the app to be opened at least once; `setTimeout` is not reliable when the tab/app is fully backgrounded for long periods on mobile browsers
- **GTFS static data** refreshes once per session (MOT updates it ~weekly)
- **Israel Railways integration** uses an unofficial API that may change without notice; fallback is the Railways data embedded in the MOT GTFS ZIP
- **Google Maps API key** must be unrestricted or whitelisted for `localhost` during development
