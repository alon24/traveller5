import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { overpassQuery } from '../services/api/overpass';
import { findTerminalStops, getRouteByGtfsId, getFirstRouteByRef } from '../services/api/gtfsRoutes';

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
  if (!route) return [];
  return findTerminalStops(route.from, route.to);
}

async function fetchMotLineTerminals(lineRef) {
  const route = await getFirstRouteByRef(lineRef);
  if (!route) return [];
  return findTerminalStops(route.from, route.to);
}

function fetchRouteStops(relId) {
  if (relId.startsWith('gtfs:'))     return fetchGtfsTerminals(relId.slice(5));
  if (relId.startsWith('mot-line:')) return fetchMotLineTerminals(relId.slice(9));
  return fetchOverpassStops(relId);
}

export function useRouteStops(relId) {
  return useQuery({
    queryKey: ['route-stops', relId],
    queryFn: () => fetchRouteStops(relId),
    enabled: !!relId,
    staleTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    retry: 2,
  });
}
