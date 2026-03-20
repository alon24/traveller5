import { getLineStopsFromStride } from '../services/api/stride';
import { useQuery } from '@tanstack/react-query';

async function getStopsForShape(relId, signal) {
  if (relId.startsWith('gtfs:')) {
    const gtfsRouteId = relId.slice(5);
    const route = await getRouteByGtfsId(gtfsRouteId, signal);
    if (route?.ref) {
      try {
        const stops = await getLineStopsFromStride(route.ref, gtfsRouteId, signal);
        if (stops) return stops;
      } catch {}
      return findTerminalStops(route.from, route.to, signal);
    }
    // gtfsRouteId is a SIRI line_ref (integer) — use Stride directly
    try {
      const stops = await getLineStopsFromStride(null, gtfsRouteId, signal);
      if (stops) return stops;
    } catch {}
    return null;
  }
  if (relId.startsWith('mot-line:')) {
    const lineRefAndStop = relId.slice(9); // "16" or "16:stopCode"
    const colonIdx = lineRefAndStop.indexOf(':');
    const lineRef  = colonIdx === -1 ? lineRefAndStop : lineRefAndStop.slice(0, colonIdx);
    const stopCode = colonIdx === -1 ? null           : lineRefAndStop.slice(colonIdx + 1);

    if (stopCode) {
      try {
        const { getLineRefsForStopAndLine } = await import('../services/api/stride');
        const lineRefs = await getLineRefsForStopAndLine(stopCode, lineRef, signal);
        if (lineRefs?.length) {
          const stops = await getLineStopsFromStride(null, lineRefs[0], signal);
          if (stops) return stops;
        }
      } catch {}
    }

    try {
      const stops = await getLineStopsFromStride(lineRef, null, signal);
      if (stops) return stops;
    } catch {}
    return findBestTerminalsByRef(lineRef, signal);
  }
  return null; // OSM relation — shape comes from routeStops directly
}

async function fetchShape(relId, signal) {
  const allStops = await getStopsForShape(relId, signal);
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

export function useRouteShape(relId) {
  const isCorrectType = relId && typeof relId === 'string' && (relId.startsWith('gtfs:') || relId.startsWith('mot-line:'));

  const { data, isLoading } = useQuery({
    queryKey: ['route-shape', relId],
    queryFn: ({ signal }) => fetchShape(relId, signal),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    enabled: !!isCorrectType,
  });

  return isLoading ? null : (data ?? []);
}
