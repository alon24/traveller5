import { useQuery } from '@tanstack/react-query';
import { NEARBY_RADIUS_METERS } from '../config/constants';
import { overpassQuery } from '../services/api/overpass';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchCurlbusRoutes(stopCode) {
  const res = await fetch(`/proxy/curlbus/${stopCode}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  if (data.errors?.length) return [];
  const visits = data.visits?.[String(stopCode)] || [];
  const seen = new Set();
  return visits
    .filter(v => v.line_name && !seen.has(v.line_name) && seen.add(v.line_name))
    .map(v => ({
      ref:    v.line_name,
      to:     v.static_info?.route?.destination?.name?.HE || v.static_info?.route?.destination?.name?.EN || '',
      colour: null,
      relId:  `mot-line:${v.line_name}`,
    }));
}

async function fetchNearbyStops(lat, lng, radius) {
  const query = `
    [out:json][timeout:25];
    (
      node["highway"="bus_stop"](around:${radius},${lat},${lng});
      node["railway"="station"](around:${radius},${lat},${lng});
      node["railway"="tram_stop"](around:${radius},${lat},${lng});
      node["railway"="halt"](around:${radius},${lat},${lng});
    )->.stops;
    .stops out body;
    rel(bn.stops)["type"="route"]["route"~"bus|tram|train|rail|subway|light_rail|monorail"];
    out body;
  `;

  const data = await overpassQuery(query);

  const stopNodes = data.elements.filter((e) => e.type === 'node');
  const routeRels = data.elements.filter((e) => e.type === 'relation');

  // Build nodeId → routes map from relation members
  const nodeRoutes = {};
  for (const rel of routeRels) {
    const ref = rel.tags?.ref || '';
    if (!ref) continue;
    const to = rel.tags?.to || rel.tags?.name || '';
    const colour = rel.tags?.colour || rel.tags?.color || null;

    for (const member of rel.members || []) {
      if (member.type !== 'node') continue;
      if (!nodeRoutes[member.ref]) nodeRoutes[member.ref] = new Map();
      // key by ref so we deduplicate lines with multiple stops nearby
      if (!nodeRoutes[member.ref].has(ref)) {
        nodeRoutes[member.ref].set(ref, { ref, to, colour, relId: rel.id });
      }
    }
  }

  const baseStops = stopNodes
    .map((el) => ({
      id: String(el.id),
      name:
        el.tags?.name ||
        el.tags?.['name:he'] ||
        el.tags?.['name:en'] ||
        el.tags?.ref ||
        'Stop',
      ref: el.tags?.ref || el.tags?.local_ref || el.tags?.['ref:IL:BS'] || '',
      lat: el.lat,
      lng: el.lon,
      distance: Math.round(haversine(lat, lng, el.lat, el.lon)),
      routes: [...(nodeRoutes[el.id]?.values() || [])].sort((a, b) =>
        a.ref.localeCompare(b.ref, undefined, { numeric: true })
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  // Enrich each stop with curlbus live data to add MOT routes not in OSM
  const enriched = await Promise.all(
    baseStops.map(async (stop) => {
      if (!stop.ref) return stop;
      try {
        const curlbusRoutes = await fetchCurlbusRoutes(stop.ref);
        if (!curlbusRoutes.length) return stop;
        const existingRefs = new Set(stop.routes.map((r) => r.ref));
        const newRoutes = curlbusRoutes.filter((r) => !existingRefs.has(r.ref));
        if (!newRoutes.length) return stop;
        const merged = [...stop.routes, ...newRoutes].sort((a, b) =>
          a.ref.localeCompare(b.ref, undefined, { numeric: true })
        );
        return { ...stop, routes: merged };
      } catch {
        return stop;
      }
    })
  );

  return enriched;
}

export function useNearbyStops(lat, lng, radius = NEARBY_RADIUS_METERS) {
  return useQuery({
    queryKey: ['nearby-stops', lat?.toFixed(3), lng?.toFixed(3), radius],
    queryFn: () => fetchNearbyStops(lat, lng, radius),
    enabled: !!lat && !!lng,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
