/**
 * Fetches ordered stop sequences for Israeli bus lines from the
 * Hasadna Open Bus Stride API (https://open-bus-stride-api.hasadna.org.il).
 *
 * Strategy:
 *   1. /gtfs_routes/list?line_refs=<gtfsRouteId>  → exact route match (preferred)
 *      OR /gtfs_routes/list?route_short_name=N    → fallback when no route_id known
 *   2. /gtfs_rides/list?gtfs_route_id=X           → get a representative ride id
 *   3. /gtfs_ride_stops/list?gtfs_ride_ids=Y      → ordered stops with lat/lon
 */

const BASE = '/proxy/stride';

// Session-level cache keyed by gtfsRouteId when available, else lineRef
const _cache = new Map();

export async function getLineStopsFromStride(lineRef, gtfsRouteId = null) {
  const cacheKey = gtfsRouteId ? `route:${gtfsRouteId}` : `line:${lineRef}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);

  const today = new Date().toISOString().slice(0, 10);

  // Step 1: find the exact GTFS route in Stride.
  // When we have a specific GTFS route_id (line_ref in Stride), use it directly
  // so we get the correct variant instead of always picking the first result.
  let routesRes;
  if (gtfsRouteId) {
    routesRes = await fetch(`${BASE}/gtfs_routes/list?line_refs=${encodeURIComponent(gtfsRouteId)}&limit=1`);
  } else {
    routesRes = await fetch(
      `${BASE}/gtfs_routes/list?route_short_name=${encodeURIComponent(lineRef)}&date_from=${today}&limit=5`,
    );
  }
  if (!routesRes.ok) throw new Error(`Stride routes ${routesRes.status}`);
  const routes = await routesRes.json();
  if (!routes.length) return null;

  // Step 2: find a representative ride (trip) for this route
  const routeId = routes[0].id;
  const ridesRes = await fetch(`${BASE}/gtfs_rides/list?gtfs_route_id=${routeId}&limit=2`);
  if (!ridesRes.ok) throw new Error(`Stride rides ${ridesRes.status}`);
  const rides = await ridesRes.json();
  if (!rides.length) return null;

  // Step 3: fetch all stops for this ride, ordered by stop_sequence
  const rideId = rides[0].id;
  const stopsRes = await fetch(
    `${BASE}/gtfs_ride_stops/list?gtfs_ride_ids=${rideId}&limit=200`,
  );
  if (!stopsRes.ok) throw new Error(`Stride ride stops ${stopsRes.status}`);
  const items = await stopsRes.json();

  const stops = items
    .filter(item => item.gtfs_stop__lat && item.gtfs_stop__lon)
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map(item => ({
      id:   String(item.gtfs_stop__code || item.gtfs_stop_id),
      name: item.gtfs_stop__name || '',
      lat:  item.gtfs_stop__lat,
      lng:  item.gtfs_stop__lon,
    }));

  if (stops.length >= 2) _cache.set(cacheKey, stops);
  return stops.length >= 2 ? stops : null;
}
