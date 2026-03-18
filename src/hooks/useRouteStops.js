import { useQuery } from '@tanstack/react-query';
import { overpassQuery } from '../services/api/overpass';
import { findTerminalStops, getRouteByGtfsId, findBestTerminalsByRef } from '../services/api/gtfsRoutes';
import { getLineStopsFromStride } from '../services/api/stride';

// ── Overpass stops (OSM relation ID, numeric string) ──────────────
async function fetchOverpassStops(relId) {
  const query = `
    [out:json][timeout:30];
    rel(${relId})->.route;
    .route out body;
    node(r.route);
    out body qt;
  `;
  const data = await overpassQuery(query);

  const rel = data.elements.find((e) => e.type === 'relation');
  if (!rel) return [];

  const nodeMap = {};
  for (const el of data.elements) {
    if (el.type === 'node') nodeMap[el.id] = el;
  }

  let stopMembers = (rel.members || []).filter(
    (m) => m.type === 'node' && /^stop/.test(m.role)
  );
  if (stopMembers.length === 0) {
    stopMembers = (rel.members || []).filter((m) => m.type === 'node');
  }

  return stopMembers
    .map((m) => {
      const node = nodeMap[m.ref];
      if (!node) return null;
      return {
        id: String(node.id),
        lat: node.lat,
        lng: node.lon,
        name: node.tags?.name || node.tags?.['name:he'] || '',
      };
    })
    .filter(Boolean);
}

async function fetchGtfsTerminals(routeId) {
  const route = await getRouteByGtfsId(routeId);
  if (route?.ref) {
    try {
      const stops = await getLineStopsFromStride(route.ref, routeId);
      if (stops) return stops;
    } catch {}
    return findTerminalStops(route.from, route.to);
  }
  // routeId is a SIRI line_ref (integer) — getRouteByGtfsId won't find it in
  // the local GTFS ZIP. Fall back to Stride which accepts line_refs directly.
  try {
    const stops = await getLineStopsFromStride(null, routeId);
    if (stops) return stops;
  } catch {}
  return [];
}

async function fetchMotLineTerminals(lineRefAndStop) {
  // relId format: "16" or "16:stopCode" (stop code appended for city precision)
  const colonIdx = lineRefAndStop.indexOf(':');
  const lineRef  = colonIdx === -1 ? lineRefAndStop : lineRefAndStop.slice(0, colonIdx);
  const stopCode = colonIdx === -1 ? null           : lineRefAndStop.slice(colonIdx + 1);

  // Stop-correlated lookup: resolves the exact SIRI line_ref serving this stop,
  // avoiding city collisions (e.g. line 16 in Jerusalem vs Haifa).
  if (stopCode) {
    try {
      const { getLineRefsForStopAndLine } = await import('../services/api/stride');
      const lineRefs = await getLineRefsForStopAndLine(stopCode, lineRef);
      if (lineRefs?.length) {
        const stops = await getLineStopsFromStride(null, lineRefs[0]);
        if (stops) return stops;
      }
    } catch {}
  }

  try {
    const stops = await getLineStopsFromStride(lineRef);
    if (stops) return stops;
  } catch {}
  return findBestTerminalsByRef(lineRef);
}

function fetchRouteStops(relId) {
  if (relId.startsWith('gtfs:'))     return fetchGtfsTerminals(relId.slice(5));
  if (relId.startsWith('mot-line:')) return fetchMotLineTerminals(relId.slice(9));
  return fetchOverpassStops(relId);
}

// Normalize the cache key for mot-line: relIds so that the same line number
// at different stops on the same route shares one React Query cache entry.
// "mot-line:16:12345" → "mot-line:16"   (stop code stripped from key only)
// The full relId (with stop code) is still passed to the fetch fn for city-precise lookup.
function normalizeRelIdKey(relId) {
  if (!relId?.startsWith('mot-line:')) return relId;
  const inner  = relId.slice(9);
  const colon  = inner.indexOf(':');
  return colon === -1 ? relId : `mot-line:${inner.slice(0, colon)}`;
}

export function useRouteStops(relId) {
  const cacheKey = normalizeRelIdKey(relId);
  return useQuery({
    queryKey: ['route-stops', cacheKey],
    queryFn: () => fetchRouteStops(relId),
    enabled: !!relId,
    staleTime: 60 * 60 * 1000, // route stops change ≤ once a day
    gcTime:    90 * 60 * 1000,
    retry: 2,
  });
}
