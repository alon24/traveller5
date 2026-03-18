import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import { NEARBY_RADIUS_METERS } from '../config/constants';
import { overpassQuery } from '../services/api/overpass';
import { getGtfsStops, getGtfsRoutes } from '../services/api/gtfsRoutes';
import { getLineRefsForStopAndLine } from '../services/api/stride';

// ── localStorage cache ────────────────────────────────────────────
const CACHE_VER  = 'ns8';
const STOPS_TTL  = 5  * 60 * 1000;
const ROUTES_TTL = 15 * 60 * 1000;

function lsKey(prefix, lat, lng, radius) {
  return `${CACHE_VER}:${prefix}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;
}
function lsRead(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { d, t } = JSON.parse(raw);
    return Date.now() - t < ttl ? d : null;
  } catch { return null; }
}
function lsWrite(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ d: data, t: Date.now() })); } catch {}
}

// ── Haversine ─────────────────────────────────────────────────────
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

// ── Phase 1: GTFS stops (local, no network after first load) ──────
// getGtfsStops() is a module-level promise — subsequent calls are instant.
async function fetchBaseStops(lat, lng, radius) {
  const key = lsKey('stops', lat, lng, radius);
  const cached = lsRead(key, STOPS_TTL);
  if (cached) return cached;

  const allStops = await getGtfsStops();

  const stops = allStops
    .filter(s => s.lat && s.lng && s.stopCode && haversine(lat, lng, s.lat, s.lng) <= radius)
    .map(s => ({
      id:       `gtfs-${s.stopId || s.stopCode}`,
      name:     s.name,
      ref:      s.stopCode,
      lat:      s.lat,
      lng:      s.lng,
      distance: Math.round(haversine(lat, lng, s.lat, s.lng)),
      routes:   [],          // filled in by Phase 2
    }))
    .sort((a, b) => a.distance - b.distance);

  lsWrite(key, stops);
  return stops;
}

// ── Phase 2: Overpass nodes-only + GTFS enrichment (background, cached) ──
// Returns { byCode: { [stopCode]: [route] }, nodes: [{code,lat,lng,routes}] }
// Nodes-only Overpass query (no rel fetch) is 10-20× faster than with relations.
// Colour + destination come from the already-cached GTFS routes, with geographic
// disambiguation: for each node × line-ref, pick the GTFS variant whose `from`
// terminal is geographically closest to the node.
async function fetchRouteMap(lat, lng, radius) {
  const key = lsKey('routes', lat, lng, radius);
  const cached = lsRead(key, ROUTES_TTL);
  if (cached) return cached;

  // Nodes-only — no rel(bn.stops) — avoids the slow relation traversal
  const query = `
    [out:json][timeout:10];
    (
      node["highway"="bus_stop"](around:${radius},${lat},${lng});
      node["public_transport"="platform"]["bus"="yes"](around:${radius},${lat},${lng});
      node["railway"="station"](around:${radius},${lat},${lng});
      node["railway"="tram_stop"](around:${radius},${lat},${lng});
      node["railway"="halt"](around:${radius},${lat},${lng});
    );
    out body;
  `;

  // Both caches are module-level promises — no extra network call after first load
  const [data, gtfsRoutes, allGtfsStops] = await Promise.all([
    overpassQuery(query),
    getGtfsRoutes().catch(() => []),
    getGtfsStops().catch(() => []),
  ]);

  // ── Build per-ref variant lists ──────────────────────────────────────────
  // Israel GTFS route_long_name format: "terminalA<->terminalB-directionSuffix"
  // Two routes with the same ref but different from/to are different city-variants
  // (e.g. line 14 Jerusalem vs line 14 Haifa). Deduplicate by from+to.
  const gtfsVariants = {}; // ref → [{colour, to, from}]
  for (const r of gtfsRoutes) {
    if (!gtfsVariants[r.ref]) gtfsVariants[r.ref] = [];
    const list = gtfsVariants[r.ref];
    if (!list.some(v => v.from === r.from && v.to === r.to)) {
      list.push({ colour: r.colour || null, to: r.to || '', from: r.from || '' });
    }
  }

  // ── Index GTFS stops by 3-char Hebrew name prefix ────────────────────────
  // Used to resolve a terminal name (e.g. "הר הצופים") to a lat/lng so we can
  // measure how far each GTFS variant's origin is from an OSM node.
  const stopsByPrefix = {}; // 3-char prefix → [{lat, lng}]
  for (const s of allGtfsStops) {
    if (!s.name || !s.lat || !s.lng) continue;
    const prefix = s.name.trim().slice(0, 3);
    if (!stopsByPrefix[prefix]) stopsByPrefix[prefix] = [];
    stopsByPrefix[prefix].push({ lat: s.lat, lng: s.lng });
  }

  // Find the nearest GTFS stop whose name starts with `termName` to (nodeLat, nodeLng).
  // Returns Infinity if no matching stop found.
  function nearestTermDist(termName, nodeLat, nodeLng) {
    if (!termName) return Infinity;
    const prefix = termName.trim().slice(0, 3);
    const candidates = stopsByPrefix[prefix] || [];
    let best = Infinity;
    for (const s of candidates) {
      const d = haversine(nodeLat, nodeLng, s.lat, s.lng);
      if (d < best) best = d;
    }
    return best;
  }

  // For a given line ref and OSM node location, pick the GTFS variant whose
  // `from` terminal is geographically closest to the node. Falls back to
  // `to`-based matching if `from` is empty (rare), then to first variant.
  function pickBestVariant(ref, nodeLat, nodeLng) {
    const variants = gtfsVariants[ref];
    if (!variants?.length) return null;
    if (variants.length === 1) return variants[0];

    let best = null, bestDist = Infinity;
    for (const v of variants) {
      // Prefer from-terminal distance; fall back to to-terminal
      const d = v.from
        ? nearestTermDist(v.from, nodeLat, nodeLng)
        : nearestTermDist(v.to,   nodeLat, nodeLng);
      if (d < bestDist) { bestDist = d; best = v; }
    }
    return best ?? variants[0];
  }

  const stopNodes = data.elements.filter(e => e.type === 'node');

  // Build per-stop route lists from OSM route_ref tag, enriched with GTFS data
  const byCode = {};
  const nodes  = [];

  for (const node of stopNodes) {
    const code = node.tags?.ref || node.tags?.['gtfs:stop_code:IL-MOT'] ||
                 node.tags?.local_ref || node.tags?.['ref:IL:BS'] || '';
    if (!code || !node.lat || !node.lon) continue;

    const routeRefTag = node.tags?.route_ref || '';
    if (!routeRefTag) continue;

    const routes = routeRefTag
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(ref => {
        const v = pickBestVariant(ref, node.lat, node.lon);
        return {
          ref,
          to:     v?.to     ?? '',
          colour: v?.colour ?? null,
          relId:  `mot-line:${ref}`,
        };
      })
      .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));

    if (routes.length === 0) continue;

    byCode[code] = routes;
    nodes.push({ code, lat: node.lat, lng: node.lon, routes });
  }

  const result = { byCode, nodes };
  lsWrite(key, result);
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────
export function useNearbyStops(lat, lng, radius = NEARBY_RADIUS_METERS) {
  const enabled = !!lat && !!lng;

  // Pre-warm GTFS data (module-level promise caches — instant on repeated calls)
  useEffect(() => {
    if (enabled) { getGtfsStops(); getGtfsRoutes(); }
  }, [enabled]);

  const baseQuery = useQuery({
    queryKey: ['nearby-base', lat?.toFixed(3), lng?.toFixed(3), radius],
    queryFn:  () => fetchBaseStops(lat, lng, radius),
    enabled,
    staleTime: STOPS_TTL,
    gcTime:    STOPS_TTL * 2,
  });

  const routeQuery = useQuery({
    queryKey: ['nearby-routes', lat?.toFixed(3), lng?.toFixed(3), radius],
    queryFn:  () => fetchRouteMap(lat, lng, radius),
    enabled,
    staleTime: ROUTES_TTL,
    gcTime:    ROUTES_TTL * 2,
  });

  const data = useMemo(() => {
    const stops = baseQuery.data;
    if (!stops) return [];
    const routeMap = routeQuery.data;
    if (!routeMap) return stops;

    return stops.map(stop => {
      // 1. Exact stop-code match
      let osmRoutes = routeMap.byCode?.[stop.ref];

      // 2. Proximity fallback: closest OSM node within 50 m
      if (!osmRoutes?.length && routeMap.nodes?.length) {
        let minDist = 50, closest = null;
        for (const n of routeMap.nodes) {
          const d = haversine(stop.lat, stop.lng, n.lat, n.lng);
          if (d < minDist) { minDist = d; closest = n; }
        }
        osmRoutes = closest?.routes;
      }

      if (!osmRoutes?.length) return stop;

      // Merge: OSM data takes precedence (has colour + destination)
      const merged = new Map(stop.routes.map(r => [r.ref, r]));
      for (const r of osmRoutes) {
        // Encode stop code into relId so city-specific lookup works on click
        merged.set(r.ref, { ...r, relId: `mot-line:${r.ref}:${stop.ref}` });
      }
      return {
        ...stop,
        routes: [...merged.values()].sort((a, b) =>
          a.ref.localeCompare(b.ref, undefined, { numeric: true })
        ),
      };
    });
  }, [baseQuery.data, routeQuery.data]);

  return {
    data,
    isLoading: baseQuery.isLoading,
    error:     baseQuery.error,
    refetch:   () => { baseQuery.refetch(); routeQuery.refetch(); },
  };
}
