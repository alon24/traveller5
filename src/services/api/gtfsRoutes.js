// Fetches and caches routes.txt, agency.txt, stops.txt from MOT GTFS zip.
// File byte offsets are discovered dynamically from the ZIP central directory
// so the code stays correct even after the zip is regenerated.

const ZIP = '/proxy/mot/gtfsfiles/israel-public-transportation.zip';

// Module-level promise caches — valid for the browser session
let _offsetsCache = null; // ZIP central directory: filename → { localOff, compressed }
let _routesCache  = null;
let _stopsCache   = null;

// ── ZIP central directory ────────────────────────────────────────────────────

async function getZipOffsets() {
  if (_offsetsCache) return _offsetsCache;

  // 1. Get total file size via 1-byte range request.
  //    HEAD is unreliable through API-gateway proxies; Content-Range on a GET
  //    always carries the total in the form "bytes 0-0/TOTAL".
  const probe = await fetch(ZIP, { headers: { Range: 'bytes=0-0' } });
  if (probe.status !== 206) throw new Error(`GTFS ZIP not accessible (${probe.status})`);
  const cr = probe.headers.get('content-range') || '';
  const sizeMatch = cr.match(/\/(\d+)$/);
  if (!sizeMatch) throw new Error('No Content-Range on GTFS ZIP probe');
  const size = parseInt(sizeMatch[1]);

  // 2. Fetch tail (≤64 KB) to locate the End-of-Central-Directory record
  const tailLen = Math.min(65558, size);
  const tailRes = await fetch(ZIP, {
    headers: { Range: `bytes=${size - tailLen}-${size - 1}` },
  });
  const tail = await tailRes.arrayBuffer();
  const dv = new DataView(tail);

  // 3. Scan backwards for EOCD signature 0x06054b50
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('EOCD not found in GTFS ZIP');

  // 4. Read CD offset & size from EOCD
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff  = dv.getUint32(eocd + 16, true);

  // 5. Fetch Central Directory
  const cdRes = await fetch(ZIP, { headers: { Range: `bytes=${cdOff}-${cdOff + cdSize - 1}` } });
  const cd    = await cdRes.arrayBuffer();
  const cdv   = new DataView(cd);

  // 6. Parse CD entries → filename → { localOff, compressed }
  const map = {};
  let p = 0;
  while (p + 46 <= cd.byteLength) {
    if (cdv.getUint32(p, true) !== 0x02014b50) break; // PK\x01\x02
    const compressed = cdv.getUint32(p + 20, true);
    const fnLen  = cdv.getUint16(p + 28, true);
    const extLen = cdv.getUint16(p + 30, true);
    const cmtLen = cdv.getUint16(p + 32, true);
    const localOff = cdv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(new Uint8Array(cd, p + 46, fnLen));
    map[fname] = { localOff, compressed };
    p += 46 + fnLen + extLen + cmtLen;
  }

  _offsetsCache = map;
  return map;
}

// ── Decompressor ─────────────────────────────────────────────────────────────

async function rangeDecompress(filename) {
  const offsets = await getZipOffsets();
  const entry = offsets[filename];
  if (!entry) throw new Error(`${filename} not found in GTFS ZIP`);

  const { localOff, compressed } = entry;

  // Single range request: local file header + compressed data.
  // 512 bytes is a safe upper bound for header overhead (30 fixed + filename + extra fields).
  const res = await fetch(ZIP, {
    headers: { Range: `bytes=${localOff}-${localOff + 512 + compressed - 1}` },
  });
  if (res.status !== 206)
    throw new Error(`GTFS range fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const view = new DataView(buf);

  const fnLen  = view.getUint16(26, true);
  const exLen  = view.getUint16(28, true);
  const method = view.getUint16(8, true);
  const dataStart = 30 + fnLen + exLen;

  // Slice exactly `compressed` bytes — no data-descriptor bytes that follow the stream
  const available = buf.byteLength - dataStart;
  const slice = new Uint8Array(buf, dataStart, Math.min(compressed, available));

  if (method === 0) return new TextDecoder().decode(slice); // stored

  // Deflate-raw (method 8)
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(slice);
  writer.close();

  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch (e) {
    // "Junk found after end of compressed data" — the deflate END block was reached
    // before all bytes were consumed (common with data-descriptor entries).
    // The chunks collected so far are the complete decompressed output.
    if (!String(e).includes('unk')) throw e;
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder('utf-8').decode(out);
}

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trimEnd().split('\n');
  if (!lines.length) return [];
  const headers = lines[0].replace(/^\uFEFF/, '').split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (fields[i] ?? '').trim(); });
    return obj;
  });
}

// ── Agency default colors ────────────────────────────────────────────────────

const AGENCY_COLORS = {
  '2':  '#1565C0', // רכבת ישראל
  '3':  '#068748', // אגד
  '4':  '#1B5E20', // אלקטרה אפיקים
  '5':  '#B71C1C', // דן
  '14': '#6A1B9A', // נתיב אקספרס
  '15': '#1565C0', // מטרופולין
  '16': '#E65100', // סופרבוס
  '18': '#4A148C', // קווים
  '25': '#1B5E20', // אלקטרה אפיקים
  '31': '#C62828', // דן בדרום
  '32': '#C62828', // דן באר שבע
};

// ── Route name parsing ───────────────────────────────────────────────────────

function parseFromTo(longName) {
  const sep = longName.indexOf('<->');
  if (sep === -1) return { from: '', to: longName };
  const from = longName.slice(0, sep).trim();
  const to = longName.slice(sep + 3).replace(/-\d+[#\d]?$/, '').trim();
  return { from, to };
}

// ── Main loaders ─────────────────────────────────────────────────────────────

async function loadGtfsRoutes() {
  const [agencyText, routesText] = await Promise.all([
    rangeDecompress('agency.txt'),
    rangeDecompress('routes.txt'),
  ]);

  const agencies = {};
  for (const row of parseCsv(agencyText)) {
    agencies[row.agency_id] = row.agency_name;
  }

  const routes = parseCsv(routesText).map(r => {
    const { from, to } = parseFromTo(r.route_long_name || '');
    const [motLineId, direction = '0'] = (r.route_desc || '').split('-');
    return {
      routeId:   r.route_id,
      agencyId:  r.agency_id,
      ref:       r.route_short_name,
      from,
      to,
      longName:  r.route_long_name,
      colour:    r.route_color ? `#${r.route_color}` : (AGENCY_COLORS[r.agency_id] || null),
      operator:  agencies[r.agency_id] || '',
      motLineId,
      direction,
    };
  });

  return routes;
}

export function getGtfsRoutes() {
  if (!_routesCache) _routesCache = loadGtfsRoutes();
  return _routesCache;
}

// ── Stops loader ─────────────────────────────────────────────────────────────

async function loadGtfsStops() {
  const stopsText = await rangeDecompress('stops.txt');
  return parseCsv(stopsText).map(s => ({
    stopId:   s.stop_id,
    stopCode: s.stop_code,
    name:     s.stop_name,
    lat:      parseFloat(s.stop_lat),
    lng:      parseFloat(s.stop_lon),
  }));
}

export function getGtfsStops() {
  if (!_stopsCache) _stopsCache = loadGtfsStops();
  return _stopsCache;
}

// ── Fuzzy stop matching ───────────────────────────────────────────────────────

function normalizeName(name) {
  return name
    .replace(/['']/g, '"')
    .replace(/\s*-[^-/]+$/, '')
    .trim()
    .toLowerCase();
}

function bestMatch(stops, searchName) {
  const needle = normalizeName(searchName);
  if (!needle) return null;
  let best = stops.find(s => normalizeName(s.name).includes(needle));
  if (!best) {
    const firstWord = needle.split(/[\s/]+/)[0];
    if (firstWord.length >= 3) best = stops.find(s => normalizeName(s.name).includes(firstWord));
  }
  return best || null;
}

export async function findTerminalStops(fromName, toName) {
  const stops = await getGtfsStops();
  const fromStop = bestMatch(stops, fromName);
  const toStop   = bestMatch(stops, toName);
  const result = [];
  if (fromStop) result.push({ id: fromStop.stopCode, lat: fromStop.lat, lng: fromStop.lng, name: fromStop.name });
  if (toStop)   result.push({ id: toStop.stopCode,   lat: toStop.lat,   lng: toStop.lng,   name: toStop.name });
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getRouteByGtfsId(routeId) {
  const routes = await getGtfsRoutes();
  return routes.find(r => r.routeId === routeId) || null;
}

export async function getFirstRouteByRef(lineRef) {
  const routes = await getGtfsRoutes();
  return routes.find(r => r.ref === lineRef) || null;
}

export async function searchGtfsRoutes(lineRef, city) {
  const routes = await getGtfsRoutes();
  const ref = lineRef.trim();
  const cityLower = city?.trim().toLowerCase() || '';

  const seen = new Set();
  return routes
    .filter(r => {
      if (r.ref !== ref) return false;
      if (cityLower) {
        const hay = (r.longName || '').toLowerCase();
        if (!hay.includes(cityLower)) return false;
      }
      const key = `${r.agencyId}-${r.motLineId}-${r.direction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(r => ({
      relId:    `gtfs:${r.routeId}`,
      ref:      r.ref,
      to:       r.to,
      from:     r.from,
      colour:   r.colour,
      operator: r.operator,
    }));
}
