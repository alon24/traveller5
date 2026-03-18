// All routed through the Vite proxy to avoid CORS restrictions
const ENDPOINTS = [
  '/proxy/overpass/1/api/interpreter',
  '/proxy/overpass/2/api/interpreter',
  '/proxy/overpass/3/api/interpreter',
];

const REQUEST_TIMEOUT_MS = 12_000; // 12 s per mirror

/**
 * Race all mirrors in parallel with a per-request timeout.
 * Returns the first successful JSON response.
 * This avoids the 30+ second wait when one mirror is slow.
 */
export async function overpassQuery(query) {
  const body    = `data=${encodeURIComponent(query)}`;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  const attempt = (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    return fetch(url, { method: 'POST', headers, body, signal: ctrl.signal })
      .then(async (res) => {
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch((e) => {
        clearTimeout(timer);
        throw e;
      });
  };

  // Try all mirrors in parallel; settle the race by resolving on first success.
  return new Promise((resolve, reject) => {
    let pending = ENDPOINTS.length;
    let settled = false;

    ENDPOINTS.forEach((url, i) => {
      attempt(url).then((data) => {
        if (!settled) { settled = true; resolve(data); }
      }).catch(() => {
        pending--;
        if (!settled && pending === 0) reject(new Error('All Overpass mirrors failed or timed out'));
      });
    });
  });
}
