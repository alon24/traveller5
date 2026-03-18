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

// Cache: relId → numeric SIRI line_ref
const _siriLineRefCache = new Map();

// Cache: `${stopCode}:${lineNumber}` → array of line_refs (or null)
const _stopLineCache = new Map();

/**
 * Given a MOT stop code and a route short name (e.g. "16"), returns the
 * SIRI line_ref values for routes that actually serve that stop.
 * This prevents line 16 in Rehovot from matching line 16 in Tel Aviv.
 */
export async function getLineRefsForStopAndLine(stopCode, lineNumber, signal) {
  if (!stopCode || !lineNumber) return null;
  const key = `${stopCode}:${lineNumber}`;
  if (_stopLineCache.has(key)) return _stopLineCache.get(key);

  try {
    const today = new Date();
    const dayStart = new Date(today); dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd   = new Date(today); dayEnd.setUTCHours(23, 59, 59, 0);
    const from = dayStart.toISOString().replace('Z', '+00:00');
    const to   = dayEnd.toISOString().replace('Z', '+00:00');
    const res = await fetch(
      `${BASE}/gtfs_ride_stops/list?gtfs_stop__code=${encodeURIComponent(stopCode)}&gtfs_route__route_short_name=${encodeURIComponent(lineNumber)}&arrival_time_from=${encodeURIComponent(from)}&arrival_time_to=${encodeURIComponent(to)}&limit=20`,
      { signal },
    );
    if (!res.ok) { _stopLineCache.set(key, null); return null; }
    const items = await res.json();
    if (!items?.length) { _stopLineCache.set(key, null); return null; }

    const lineRefs = [...new Set(items.map(i => i.gtfs_route__line_ref).filter(x => x != null))];
    _stopLineCache.set(key, lineRefs.length ? lineRefs : null);
    return lineRefs.length ? lineRefs : null;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    _stopLineCache.set(key, null);
    return null;
  }
}

/**
 * Resolve a route relId to its numeric SIRI line_ref, which is the key
 * for querying siri_vehicle_locations without an API key.
 * Returns null if the line cannot be resolved.
 */
export async function getSiriLineRef(relId) {
  if (!relId) return null;
  if (_siriLineRefCache.has(relId)) return _siriLineRefCache.get(relId);

  // For gtfs: relIds the numeric part IS the SIRI line_ref — no extra HTTP request
  if (relId.startsWith('gtfs:')) {
    const lineRef = parseInt(relId.slice(5), 10);
    if (!isNaN(lineRef)) {
      _siriLineRefCache.set(relId, [lineRef]);
      return [lineRef];
    }
  }

  // For mot-line: look up ALL line_refs for this route_short_name (multiple operators possible)
  // relId may be "mot-line:16" or "mot-line:16:STOPCODE" — extract just the line number
  if (relId.startsWith('mot-line:')) {
    const lineNumber = relId.slice(9).split(':')[0];
    const today = new Date().toISOString().slice(0, 10);
    const routesRes = await fetch(
      `${BASE}/gtfs_routes/list?route_short_name=${encodeURIComponent(lineNumber)}&date_from=${today}&limit=30`,
    );
    if (!routesRes.ok) return null;
    const routes = await routesRes.json();
    if (!routes.length) return null;
    // Deduplicate line_refs, cap at 10 to avoid excessive parallel SIRI requests
    const lineRefs = [...new Set(routes.map(r => r.line_ref))].slice(0, 10);
    _siriLineRefCache.set(relId, lineRefs);
    return lineRefs;
  }

  return null;
}

/**
 * Fetch current vehicle positions for one or more SIRI line_refs.
 * Uses a 10-minute window to account for Stride ingestion delay (~2 min).
 * Deduplicates by vehicle_ref, keeping the most recent position per bus.
 */
export async function fetchSiriVehicleLocations(siriLineRefs) {
  const refs = Array.isArray(siriLineRefs) ? siriLineRefs : [siriLineRefs];
  if (!refs.length) return [];

  const now = new Date();
  const from = new Date(now - 10 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const to   = now.toISOString().replace(/\.\d+Z$/, 'Z');

  // Fetch all line_refs in parallel
  const results = await Promise.all(refs.map(ref =>
    fetch(`${BASE}/siri_vehicle_locations/list?siri_routes__line_ref=${ref}&recorded_at_time_from=${from}&recorded_at_time_to=${to}&limit=100`)
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  ));
  const items = results.flat().filter(Array.isArray(results) ? Boolean : Boolean);

  // Keep only the latest ping per vehicle
  const byVehicle = new Map();
  for (const item of items) {
    const id = item.siri_ride__vehicle_ref || item.id;
    const prev = byVehicle.get(id);
    if (!prev || new Date(item.recorded_at_time) > new Date(prev.recorded_at_time)) {
      byVehicle.set(id, item);
    }
  }

  return [...byVehicle.values()].map(item => ({
    vehicleId:  String(item.siri_ride__vehicle_ref || item.id),
    lat:        item.lat,
    lng:        item.lon,
    bearing:    item.bearing ?? 0,
    velocity:   item.velocity ?? 0,
    recordedAt: item.recorded_at_time ?? null,
  }));
}

export function getLineStopsFromStride(lineRef, gtfsRouteId = null) {
  const cacheKey = gtfsRouteId ? `route:${gtfsRouteId}` : `line:${lineRef}`;
  if (_cache.has(cacheKey)) return _cache.get(cacheKey);
  // Store the promise immediately so concurrent callers share one in-flight request
  const promise = _fetchLineStops(lineRef, gtfsRouteId, cacheKey);
  _cache.set(cacheKey, promise);
  return promise;
}

async function _fetchLineStops(lineRef, gtfsRouteId, cacheKey) {

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

  return stops.length >= 2 ? stops : null;
}
