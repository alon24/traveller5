// All routed through the Vite proxy to avoid CORS restrictions
const ENDPOINTS = [
  '/proxy/overpass/1/api/interpreter',
  '/proxy/overpass/2/api/interpreter',
  '/proxy/overpass/3/api/interpreter',
];

export async function overpassQuery(query) {
  const body = `data=${encodeURIComponent(query)}`;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  let lastError;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      if (!res.ok) {
        lastError = new Error(`Overpass ${url}: HTTP ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError ?? new Error('All Overpass endpoints failed');
}
