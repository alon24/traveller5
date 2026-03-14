// Geocode Israeli rail stations lazily using Google Maps Geocoder.
// Results are cached in localStorage so each station is only geocoded once.

const CACHE_KEY = 'transitil_station_coords';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return {};
    return data;
  } catch { return {}; }
}

function saveCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

const memCache = loadCache(); // in-memory mirror
const pending = {};           // dedup in-flight requests

export async function getStationCoords(stationName) {
  if (memCache[stationName]) return memCache[stationName];

  if (pending[stationName]) return pending[stationName];

  pending[stationName] = new Promise((resolve) => {
    if (!window.google?.maps) { resolve(null); return; }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode(
      { address: `${stationName} railway station Israel` },
      (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          const coords = { lat: loc.lat(), lng: loc.lng() };
          memCache[stationName] = coords;
          saveCache(memCache);
          resolve(coords);
        } else {
          resolve(null);
        }
        delete pending[stationName];
      }
    );
  });

  return pending[stationName];
}

export async function getRouteStopCoords(stationCodes, stationsJson) {
  const codeToName = {};
  stationsJson.forEach((s) => { codeToName[String(s.code)] = s.name; });

  const results = await Promise.all(
    stationCodes.map(async (code) => {
      const name = codeToName[String(code)];
      if (!name) return null;
      const coords = await getStationCoords(name);
      return coords ? { code: String(code), name, ...coords } : null;
    })
  );

  return results.filter(Boolean);
}
