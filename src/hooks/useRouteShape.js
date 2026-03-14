import { useState, useEffect } from 'react';
import { getRouteByGtfsId, getFirstRouteByRef, findTerminalStops } from '../services/api/gtfsRoutes';

async function getTerminals(relId) {
  if (relId.startsWith('gtfs:')) {
    const route = await getRouteByGtfsId(relId.slice(5));
    if (!route) return null;
    return findTerminalStops(route.from, route.to);
  }
  if (relId.startsWith('mot-line:')) {
    const route = await getFirstRouteByRef(relId.slice(9));
    if (!route) return null;
    return findTerminalStops(route.from, route.to);
  }
  return null; // OSM relation — shape comes from routeStops directly
}

async function fetchShape(relId) {
  const terminals = await getTerminals(relId);
  if (!terminals || terminals.length < 2) return null;

  const [from, to] = [terminals[0], terminals[terminals.length - 1]];

  const maps = window.google?.maps;
  if (!maps?.DirectionsService || !maps?.geometry?.encoding) return null;

  const service = new maps.DirectionsService();
  let result;
  try {
    result = await service.route({
      origin:      { lat: from.lat, lng: from.lng },
      destination: { lat: to.lat,   lng: to.lng   },
      travelMode:  maps.TravelMode.TRANSIT,
      transitOptions: { modes: [maps.TransitMode.BUS] },
      region: 'il',
    });
  } catch {
    return null;
  }

  if (result.status !== 'OK' || !result.routes.length) return null;

  // Decode the overview polyline — a single simplified path for the whole journey
  const pts = maps.geometry.encoding.decodePath(
    result.routes[0].overview_polyline.points
  );
  return pts.map((p) => ({ lat: p.lat(), lng: p.lng() }));
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
