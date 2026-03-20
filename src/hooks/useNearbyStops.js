import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import { NEARBY_RADIUS_METERS } from '../config/constants';
import { overpassQuery } from '../services/api/overpass';
import { getGtfsStops, getGtfsRoutes, extractCity, normalizeName } from '../services/api/gtfsRoutes';
import { getLineRefsForStopAndLine } from '../services/api/stride';

// ── localStorage cache ────────────────────────────────────────────
const CACHE_VER  = 'ns13';
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
async function fetchBaseStops(lat, lng, radius, signal) {
  const allStops = await getGtfsStops(signal);

  const stops = allStops
    .filter(s => s.lat && s.lng && s.stopCode && haversine(lat, lng, s.lat, s.lng) <= radius)
    .map(s => ({
      id:       String(s.stopCode || s.stopId),
      name:     s.name,
      ref:      s.stopCode,
      lat:      s.lat,
      lng:      s.lng,
      city:     s.city,
      distance: Math.round(haversine(lat, lng, s.lat, s.lng)),
      routes:   [],          // filled in by Phase 2
    }))
    .sort((a, b) => a.distance - b.distance);

  return stops;
}

// ── Phase 2: Overpass nodes-only + GTFS enrichment (background, cached) ──
// Returns { byCode: { [stopCode]: [route] }, nodes: [{code,lat,lng,routes}] }
// Nodes-only Overpass query (no rel fetch) is 10-20× faster than with relations.
// Colour + destination come from the already-cached GTFS routes, with geographic
// disambiguation: for each node × line-ref, pick the GTFS variant whose `from`
// terminal is geographically closest to the node.
async function fetchRouteMap(lat, lng, radius, signal) {
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
    overpassQuery(query, signal),
    getGtfsRoutes(signal).catch(() => []),
    getGtfsStops(signal).catch(() => []),
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

  // ── Index GTFS stops by exact name ───────────────────────────────────────
  // Used to resolve a terminal name (e.g. "הר הצופים") to a lat/lng so we can
  // measure how far each GTFS variant's origin is from an OSM node.
  const stopsByName = new Map();
  for (const s of allGtfsStops) {
    if (!s.name || !s.lat || !s.lng) continue;
    const norm = normalizeName(s.name);
    if (!stopsByName.has(norm)) stopsByName.set(norm, []);
    stopsByName.get(norm).push({ lat: s.lat, lng: s.lng });
  }

  // Find the nearest GTFS stop whose exact name matches the terminal
  // Returns Infinity if no matching stop found.
  function nearestTermDist(termStr, nodeLat, nodeLng) {
    if (!termStr) return Infinity;
    
    // Normalize the terminal name (removes common abbreviations and punctuation)
    const stopName = normalizeName(termStr);

    const candidates = stopsByName.get(stopName) || [];
    let best = Infinity;
    for (const c of candidates) {
      const d = haversine(nodeLat, nodeLng, c.lat, c.lng);
      if (d < best) best = d;
    }
    
    // Fallback: fuzzy match for slight spelling differences (e.g. "תחנת רכבת" vs "ת. רכבת")
    // but ONLY if the terminal doesn't mention a completely different city.
    if (best === Infinity && stopName.length >= 4) {
      for (const [name, locs] of stopsByName.entries()) {
        // Tighten check: must have high overlap, not just "includes"
        if (name.includes(stopName) || stopName.includes(name)) {
          for (const c of locs) {
            const d = haversine(nodeLat, nodeLng, c.lat, c.lng);
            if (d < best) best = d;
          }
        }
      }
      if (best !== Infinity) best += 20000; // 20km penalty for loose naming match
    }
    
    return best;
  }

  // To prevent "Line 14 Jerusalem" winning in Rehovot, we determine the
  // dominant city of the current search area based on nearby GTFS stops.
  const cityCounts = {};
  for (const s of allGtfsStops) {
    if (haversine(lat, lng, s.lat, s.lng) <= radius * 1.5 && s.city) {
      cityCounts[s.city] = (cityCounts[s.city] || 0) + 1;
    }
  }
  const contextCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // For a given line ref and OSM node location, pick the GTFS variant whose
  // `from` terminal is geographically closest to the node. 
  // Penalizes variants that mention a different city than the local context.
  function pickBestVariant(ref, nodeLat, nodeLng, nodeCity) {
    const variants = gtfsVariants[ref];
    if (!variants?.length) return null;
    if (variants.length === 1) return variants[0];

    let best = null, bestScore = Infinity;
    const localCity = (nodeCity || contextCity || '').toLowerCase();

    for (const v of variants) {
      // 1. Base distance to terminal
      let d = v.from
        ? nearestTermDist(v.from, nodeLat, nodeLng)
        : nearestTermDist(v.to,   nodeLat, nodeLng);
      
      const vTo   = (v.to   || '').toLowerCase();
      const vFrom = (v.from || '').toLowerCase();
      
      // 2. City mismatch penalty
      if (localCity && d !== Infinity) {
        // If the variant belongs to a different city than our local context
        const isSelfCity = vTo.includes(localCity) || vFrom.includes(localCity);
        const mentionsOtherCity = variants.some(other => {
           if (other === v) return false;
           // If ANOTHER variant mentions our local city, this one is suspect
           return other.to.toLowerCase().includes(localCity) || other.from.toLowerCase().includes(localCity);
        });

        if (!isSelfCity && mentionsOtherCity) {
          d += 100000; // 100km mismatch penalty
        }
      }

      if (d < bestScore) { bestScore = d; best = v; }
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

    const nodeCity = extractCity(node.tags?.name || '');
    const routes = routeRefTag
      .split(';')
      .map(s => s.trim())
      .filter(Boolean)
      .map(ref => {
        const v = pickBestVariant(ref, node.lat, node.lon, nodeCity);
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
  return result;
}

// ── Hook ──────────────────────────────────────────────────────────
export function useNearbyStops(lat, lng, radius = NEARBY_RADIUS_METERS) {
  const enabled = !!lat && !!lng;

  const baseQuery = useQuery({
    queryKey: ['nearby-base', lat?.toFixed(3), lng?.toFixed(3), radius],
    queryFn:  ({ signal }) => fetchBaseStops(lat, lng, radius, signal),
    enabled,
    staleTime: STOPS_TTL,
  });

  const routeQuery = useQuery({
    queryKey: ['nearby-routes', lat?.toFixed(3), lng?.toFixed(3), radius],
    queryFn:  ({ signal }) => fetchRouteMap(lat, lng, radius, signal),
    enabled,
    staleTime: ROUTES_TTL,
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
