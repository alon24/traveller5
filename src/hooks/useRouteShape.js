import { useState, useEffect } from 'react';
import { getRouteByGtfsId, findBestTerminalsByRef, findTerminalStops } from '../services/api/gtfsRoutes';
import { getLineStopsFromStride } from '../services/api/stride';

async function getStopsForShape(relId) {
  if (relId.startsWith('gtfs:')) {
    const gtfsRouteId = relId.slice(5);
    const route = await getRouteByGtfsId(gtfsRouteId);
    if (!route) return null;
    // Use exact GTFS route_id so Stride returns the correct variant's stops
    if (route.ref) {
      try {
        const stops = await getLineStopsFromStride(route.ref, gtfsRouteId);
        if (stops) return stops;
      } catch {}
    }
    return findTerminalStops(route.from, route.to);
  }
  if (relId.startsWith('mot-line:')) {
    // Prefer full stop list from Stride; fall back to GTFS terminal matching
    try {
      const stops = await getLineStopsFromStride(relId.slice(9));
      if (stops) return stops;
    } catch {}
    return findBestTerminalsByRef(relId.slice(9));
  }
  return null; // OSM relation — shape comes from routeStops directly
}

async function fetchShape(relId) {
  const allStops = await getStopsForShape(relId);
  if (!allStops || allStops.length < 2) return null;

  const from = allStops[0];
  const to   = allStops[allStops.length - 1];

  // Google Maps loads asynchronously; stop data (from GTFS/Stride) may arrive
  // before the Maps API is ready — poll briefly rather than failing silently.
  let maps = window.google?.maps;
  if (!maps?.DirectionsService || !maps?.geometry?.encoding) {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
      maps = window.google?.maps;
      if (maps?.DirectionsService && maps?.geometry?.encoding) break;
    }
  }
  if (!maps?.DirectionsService || !maps?.geometry?.encoding) return null;

  // Build waypoints from intermediate stops — Directions API supports max 25.
  // For routes with many stops, subsample evenly to stay within the limit.
  const intermediates = allStops.slice(1, -1);
  const maxWaypoints  = 23;
  const waypoints     = [];
  if (intermediates.length > 0) {
    const step = Math.max(1, Math.ceil(intermediates.length / maxWaypoints));
    for (let i = 0; i < intermediates.length; i += step) {
      waypoints.push({
        location: { lat: intermediates[i].lat, lng: intermediates[i].lng },
        stopover: false,
      });
    }
  }

  const service = new maps.DirectionsService();
  let result;

  // When we have real waypoints use DRIVING directly (fastest, always works).
  // For the 2-terminal fallback case, try TRANSIT+BUS first.
  if (waypoints.length === 0) {
    try {
      result = await service.route({
        origin:         { lat: from.lat, lng: from.lng },
        destination:    { lat: to.lat,   lng: to.lng   },
        travelMode:     maps.TravelMode.TRANSIT,
        transitOptions: { modes: [maps.TransitMode.BUS] },
        region: 'il',
      });
    } catch {
      result = null;
    }
  }

  if (!result || result.status !== 'OK' || !result.routes.length) {
    try {
      result = await service.route({
        origin:      { lat: from.lat, lng: from.lng },
        destination: { lat: to.lat,   lng: to.lng   },
        waypoints,
        travelMode:  maps.TravelMode.DRIVING,
        region:      'il',
      });
    } catch {
      return null;
    }
  }

  if (!result || result.status !== 'OK' || !result.routes.length) return null;

  // Decode per-step polylines for full road-following resolution.
  // Concatenating steps gives much more detail than the simplified overview polyline.
  const shape = [];
  for (const leg of result.routes[0].legs) {
    for (const step of leg.steps) {
      const stepPts = maps.geometry.encoding.decodePath(step.polyline.points);
      for (const p of stepPts) shape.push({ lat: p.lat(), lng: p.lng() });
    }
  }
  return shape.length >= 2 ? shape : null;
}

// Returns null while loading, [] if no shape found, or [{lat, lng}] on success.
// Only fires for gtfs: / mot-line: prefixes; OSM relation IDs return null so
// NearbyMap falls back to the routeStops sequence.
export function useRouteShape(relId) {
  const [shape, setShape] = useState(null);

  useEffect(() => {
    if (!relId || typeof relId !== 'string' || (!relId.startsWith('gtfs:') && !relId.startsWith('mot-line:'))) {
      setShape(null);
      return;
    }
    let cancelled = false;
    setShape(null); // clear previous while loading
    fetchShape(relId)
      .then((s) => { if (!cancelled) setShape(s ?? []); })
      .catch(() => { if (!cancelled) setShape([]); });
    return () => { cancelled = true; };
  }, [relId]);

  return shape;
}
