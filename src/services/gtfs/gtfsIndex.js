/**
 * In-memory spatial index for GTFS stops.
 * Uses a 0.01-degree grid for fast nearby lookups.
 */

const GRID_SIZE = 0.01; // ~1km

class GtfsIndex {
  constructor() {
    this.stops = new Map();       // stopId → Stop
    this.routes = new Map();      // routeId → Route
    this.stopRoutes = new Map();  // stopId → Set<routeId>
    this.grid = new Map();        // "lat:lng" → stopId[]
    this.ready = false;
  }

  build(stops, routes, stopTimes) {
    // Index routes
    for (const route of routes) {
      this.routes.set(route.route_id, {
        id: route.route_id,
        shortName: route.route_short_name,
        longName: route.route_long_name,
        color: route.route_color ? `#${route.route_color}` : '#6B7280',
        textColor: route.route_text_color ? `#${route.route_text_color}` : '#FFFFFF',
        agencyId: route.agency_id,
      });
    }

    // Index stops
    for (const stop of stops) {
      const lat = parseFloat(stop.stop_lat);
      const lng = parseFloat(stop.stop_lon);
      if (isNaN(lat) || isNaN(lng)) continue;

      this.stops.set(stop.stop_id, {
        id: stop.stop_id,
        name: stop.stop_name,
        lat,
        lng,
        code: stop.stop_code,
      });

      // Add to grid
      const key = gridKey(lat, lng);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key).push(stop.stop_id);
    }

    // Index stop→routes from stop_times (trips link)
    for (const st of stopTimes) {
      if (!this.stopRoutes.has(st.stop_id)) this.stopRoutes.set(st.stop_id, new Set());
      if (st.route_id) this.stopRoutes.get(st.stop_id).add(st.route_id);
    }

    this.ready = true;
  }

  findNearbyStops(lat, lng, radiusMeters = 500) {
    const radiusDeg = radiusMeters / 111000;
    const results = [];

    // Search surrounding grid cells
    for (let dlat = -radiusDeg; dlat <= radiusDeg; dlat += GRID_SIZE) {
      for (let dlng = -radiusDeg; dlng <= radiusDeg; dlng += GRID_SIZE) {
        const key = gridKey(lat + dlat, lng + dlng);
        const ids = this.grid.get(key) || [];
        for (const id of ids) {
          const stop = this.stops.get(id);
          if (!stop) continue;
          const dist = haversine(lat, lng, stop.lat, stop.lng);
          if (dist <= radiusMeters) {
            results.push({ ...stop, distance: Math.round(dist) });
          }
        }
      }
    }

    // Deduplicate and sort by distance
    const seen = new Set();
    return results
      .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
      .sort((a, b) => a.distance - b.distance);
  }

  getRoutesAtStop(stopId) {
    const routeIds = this.stopRoutes.get(stopId) || new Set();
    return [...routeIds].map((id) => this.routes.get(id)).filter(Boolean);
  }

  serialize() {
    return JSON.stringify({
      stops: [...this.stops.entries()],
      routes: [...this.routes.entries()],
      stopRoutes: [...this.stopRoutes.entries()].map(([k, v]) => [k, [...v]]),
      grid: [...this.grid.entries()],
    });
  }

  deserialize(json) {
    const data = JSON.parse(json);
    this.stops = new Map(data.stops);
    this.routes = new Map(data.routes);
    this.stopRoutes = new Map(data.stopRoutes.map(([k, v]) => [k, new Set(v)]));
    this.grid = new Map(data.grid);
    this.ready = true;
  }
}

function gridKey(lat, lng) {
  return `${(lat / GRID_SIZE | 0)}:${(lng / GRID_SIZE | 0)}`;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const gtfsIndex = new GtfsIndex();
