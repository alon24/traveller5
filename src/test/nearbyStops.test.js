/**
 * Tests for the nearby-stops merge logic (proximity matching + route merging).
 * These run in the browser so localStorage is available natively.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── Helpers copied from useNearbyStops.js ──────────────────────────
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

function mergeStopsWithRouteMap(stops, routeMap) {
  return stops.map(stop => {
    let osmRoutes = routeMap.byCode?.[stop.ref];

    if (!osmRoutes?.length && routeMap.nodes?.length) {
      let minDist = 50, closest = null;
      for (const n of routeMap.nodes) {
        const d = haversine(stop.lat, stop.lng, n.lat, n.lng);
        if (d < minDist) { minDist = d; closest = n; }
      }
      osmRoutes = closest?.routes;
    }

    if (!osmRoutes?.length) return stop;

    const merged = new Map(stop.routes.map(r => [r.ref, r]));
    for (const r of osmRoutes) {
      merged.set(r.ref, { ...r, relId: `mot-line:${r.ref}:${stop.ref}` });
    }
    return {
      ...stop,
      routes: [...merged.values()].sort((a, b) =>
        a.ref.localeCompare(b.ref, undefined, { numeric: true })
      ),
    };
  });
}

// ── Tests ─────────────────────────────────────────────────────────

describe('haversine distance', () => {
  it('returns 0 for same point', () => {
    expect(haversine(32.0, 34.8, 32.0, 34.8)).toBe(0);
  });

  it('returns ~111 km between 1 degree latitude difference', () => {
    const dist = haversine(31.0, 34.8, 32.0, 34.8);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it('returns ~49 m for stops very close together', () => {
    // roughly 49m apart
    const dist = haversine(31.8939, 34.8126, 31.8943, 34.8126);
    expect(dist).toBeGreaterThan(40);
    expect(dist).toBeLessThan(60);
  });
});

describe('mergeStopsWithRouteMap', () => {
  const baseStop = {
    id: 'gtfs-38918', name: 'מקס נורדאו/בנימין',
    ref: '38918', lat: 31.8939, lng: 34.8126,
    distance: 307, routes: [],
  };

  it('direct code match: enriches routes when stop code exists in byCode', () => {
    const routeMap = {
      byCode: {
        '38918': [
          { ref: '16', to: 'תחנה מרכזית', colour: '#1565C0', relId: 'mot-line:16' },
          { ref: '8',  to: 'אשדוד',        colour: null,       relId: 'mot-line:8'  },
        ],
      },
      nodes: [],
    };
    const [result] = mergeStopsWithRouteMap([baseStop], routeMap);
    expect(result.routes).toHaveLength(2);
    expect(result.routes[0].ref).toBe('8');
    expect(result.routes[1].ref).toBe('16');
    // relId should encode the stop code
    expect(result.routes[0].relId).toBe('mot-line:8:38918');
    expect(result.routes[1].relId).toBe('mot-line:16:38918');
  });

  it('proximity fallback: uses nearest OSM node when code does not match', () => {
    // OSM has stop code 34696 at 25m from our GTFS stop
    const nearbyLat = 31.8941; // ~25m away
    const routeMap = {
      byCode: { '34696': [{ ref: '166', to: 'רחובות', colour: null, relId: 'mot-line:166' }] },
      nodes: [
        {
          code: '34696', lat: nearbyLat, lng: 34.8126,
          routes: [{ ref: '166', to: 'רחובות', colour: null, relId: 'mot-line:166' }],
        },
      ],
    };
    const [result] = mergeStopsWithRouteMap([baseStop], routeMap);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].ref).toBe('166');
    expect(result.routes[0].relId).toBe('mot-line:166:38918');
  });

  it('no match when nearest OSM node is >50m away', () => {
    const farLat = 31.8980; // > 50m
    const routeMap = {
      byCode: {},
      nodes: [
        { code: '99999', lat: farLat, lng: 34.8126, routes: [{ ref: '99', to: '', colour: null, relId: 'mot-line:99' }] },
      ],
    };
    const [result] = mergeStopsWithRouteMap([baseStop], routeMap);
    expect(result.routes).toHaveLength(0);
  });

  it('merges pre-existing stop routes with OSM routes, OSM takes precedence', () => {
    const stopWithRoutes = {
      ...baseStop,
      routes: [
        { ref: '16', to: 'old dest', colour: '#000', relId: 'mot-line:16' },
        { ref: '99', to: 'local',   colour: '#red', relId: 'mot-line:99' },
      ],
    };
    const routeMap = {
      byCode: {
        '38918': [{ ref: '16', to: 'new dest', colour: '#1565C0', relId: 'mot-line:16' }],
      },
      nodes: [],
    };
    const [result] = mergeStopsWithRouteMap([stopWithRoutes], routeMap);
    // Both 16 and 99 should be present
    expect(result.routes).toHaveLength(2);
    const r16 = result.routes.find(r => r.ref === '16');
    expect(r16.to).toBe('new dest'); // OSM overrode
    expect(r16.colour).toBe('#1565C0');
  });

  it('sorts routes numerically', () => {
    const routeMap = {
      byCode: {
        '38918': [
          { ref: '318', to: '', colour: null, relId: 'mot-line:318' },
          { ref: '8',   to: '', colour: null, relId: 'mot-line:8'   },
          { ref: '14',  to: '', colour: null, relId: 'mot-line:14'  },
          { ref: '166', to: '', colour: null, relId: 'mot-line:166' },
        ],
      },
      nodes: [],
    };
    const [result] = mergeStopsWithRouteMap([baseStop], routeMap);
    const refs = result.routes.map(r => r.ref);
    expect(refs).toEqual(['8', '14', '166', '318']);
  });
});

describe('localStorage cache round-trip (native browser API)', () => {
  beforeEach(() => localStorage.clear());

  it('reads back what it writes within TTL', () => {
    const key  = 'ns5:test:key';
    const data = { foo: 'bar', nums: [1, 2, 3] };
    const now  = Date.now();
    localStorage.setItem(key, JSON.stringify({ d: data, t: now }));

    const raw  = JSON.parse(localStorage.getItem(key));
    const ttl  = 5 * 60 * 1000;
    const fresh = Date.now() - raw.t < ttl ? raw.d : null;
    expect(fresh).toEqual(data);
  });

  it('returns null after TTL expires', () => {
    const key  = 'ns5:test:expired';
    const old  = Date.now() - 20 * 60 * 1000; // 20 minutes ago
    const data = { val: 42 };
    localStorage.setItem(key, JSON.stringify({ d: data, t: old }));

    const raw  = JSON.parse(localStorage.getItem(key));
    const ttl  = 5 * 60 * 1000;
    const result = Date.now() - raw.t < ttl ? raw.d : null;
    expect(result).toBeNull();
  });
});
