/**
 * Tests for the GTFS routes service.
 * Runs in a real browser (Vitest browser mode) so DecompressionStream
 * and fetch are native.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── parseCsv ─────────────────────────────────────────────────────
// Import only the pure functions by re-exporting them from a test shim,
// or test them through the public API with mocked fetch.

// We test the CSV parser by exercising getGtfsRoutes with a fully mocked fetch.

const AGENCY_CSV = `agency_id,agency_name,agency_url,agency_timezone
3,אגד,https://www.egged.co.il,Asia/Jerusalem
5,דן,https://www.dan.co.il,Asia/Jerusalem
`;

// Route long names end with -N or -N# (single suffix) — the regex strips those.
const ROUTES_CSV = `route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_color
1001,3,16,תל אביב<->ירושלים-1#,16-1,3,1A73C8
1002,5,4,אשדוד<->תל אביב-2,4-2,3,
`;

function makeDeflateRaw(text) {
  // We'll return the raw bytes as "stored" (method=0) in a fake zip local file header
  const encoded = new TextEncoder().encode(text);
  const fnBytes = new TextEncoder().encode('routes.txt');
  // Local file header: PK\x03\x04, version=20, flags=0, method=0(stored),
  // mod time/date=0, crc=0, compressed=len, uncompressed=len, fnLen, extLen
  const hdr = new Uint8Array(30 + fnBytes.length);
  const hdv = new DataView(hdr.buffer);
  hdv.setUint32(0, 0x04034b50, true);  // signature
  hdv.setUint16(6, 0, true);            // flags
  hdv.setUint16(8, 0, true);            // method = stored
  hdv.setUint32(18, encoded.length, true); // compressed size
  hdv.setUint32(22, encoded.length, true); // uncompressed size
  hdv.setUint16(26, fnBytes.length, true); // filename length
  hdv.setUint16(28, 0, true);             // extra length
  hdr.set(fnBytes, 30);
  const combined = new Uint8Array(hdr.length + encoded.length);
  combined.set(hdr, 0);
  combined.set(encoded, hdr.length);
  return combined.buffer;
}

describe('GTFS route parsing via parseCsv internals', () => {
  // We test parseFromTo and AGENCY_COLORS by importing them dynamically
  // since they are not exported. Instead we test via getGtfsRoutes with mocked fetch.

  it('parseFromTo extracts from/to from route_long_name with <->', async () => {
    // Inline the function logic to test it
    function parseFromTo(longName) {
      const sep = longName.indexOf('<->');
      if (sep === -1) return { from: '', to: longName };
      const from = longName.slice(0, sep).trim();
      const to = longName.slice(sep + 3).replace(/-\d+[#\d]?$/, '').trim();
      return { from, to };
    }
    // -1# suffix: regex strips -1# → "ירושלים"
    expect(parseFromTo('תל אביב<->ירושלים-1#')).toEqual({ from: 'תל אביב', to: 'ירושלים' });
    // -2 suffix (no #): regex strips -2 → "תל אביב"
    expect(parseFromTo('אשדוד<->תל אביב-2')).toEqual({ from: 'אשדוד', to: 'תל אביב' });
    expect(parseFromTo('Just a Name')).toEqual({ from: '', to: 'Just a Name' });
  });

  it('parseCsv handles BOM, quoted fields, and Hebrew text', () => {
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

    const result = parseCsv(AGENCY_CSV);
    expect(result).toHaveLength(2);
    expect(result[0].agency_id).toBe('3');
    expect(result[0].agency_name).toBe('אגד');
    expect(result[1].agency_id).toBe('5');

    // BOM-prefixed CSV
    const withBOM = '\uFEFFid,name\n1,foo\n';
    expect(parseCsv(withBOM)[0].id).toBe('1');
    expect(parseCsv(withBOM)[0].name).toBe('foo');

    // Quoted field with comma inside
    const quoted = 'a,b\n"hello, world",42\n';
    expect(parseCsv(quoted)[0].a).toBe('hello, world');
    expect(parseCsv(quoted)[0].b).toBe('42');
  });
});

describe('GTFS ZIP range decompression with mocked fetch', () => {
  beforeEach(() => {
    // Clear module caches so we get a fresh instance for each test
    vi.resetModules();
  });

  it('loads and parses routes from a stored-method (uncompressed) zip entry', async () => {
    // We construct a minimal ZIP with stored entries for agency.txt and routes.txt,
    // plus a valid End-of-Central-Directory record so getZipOffsets() succeeds.

    const agencyBytes  = new TextEncoder().encode(AGENCY_CSV);
    const routesBytes  = new TextEncoder().encode(ROUTES_CSV);

    // Build two local file header + data blocks
    function localEntry(filename, data) {
      const fnb = new TextEncoder().encode(filename);
      const hdr = new Uint8Array(30 + fnb.length);
      const dv  = new DataView(hdr.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(8, 0, true);  // stored
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, fnb.length, true);
      dv.setUint16(28, 0, true);
      hdr.set(fnb, 30);
      return { hdr, data: new Uint8Array(data) };
    }

    const agencyEntry = localEntry('agency.txt', agencyBytes);
    const routesEntry = localEntry('routes.txt', routesBytes);

    // Positions
    const agencyLocalOff = 0;
    const agencyLocalSize = agencyEntry.hdr.length + agencyEntry.data.length;
    const routesLocalOff  = agencyLocalSize;
    const routesLocalSize = routesEntry.hdr.length + routesEntry.data.length;
    const cdOff = routesLocalOff + routesLocalSize;

    // Build Central Directory entries
    function cdEntry(filename, localOff, compressedSize) {
      const fnb = new TextEncoder().encode(filename);
      const entry = new Uint8Array(46 + fnb.length);
      const dv = new DataView(entry.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(10, 0, true); // method=stored
      dv.setUint32(20, compressedSize, true);
      dv.setUint32(24, compressedSize, true);
      dv.setUint16(28, fnb.length, true);
      dv.setUint16(30, 0, true);
      dv.setUint16(32, 0, true);
      dv.setUint32(42, localOff, true);
      entry.set(fnb, 46);
      return entry;
    }

    const cdAgency = cdEntry('agency.txt', agencyLocalOff, agencyBytes.length);
    const cdRoutes = cdEntry('routes.txt', routesLocalOff, routesBytes.length);
    const cdSize   = cdAgency.length + cdRoutes.length;

    // EOCD
    const eocd = new Uint8Array(22);
    const eocdDv = new DataView(eocd.buffer);
    eocdDv.setUint32(0, 0x06054b50, true);
    eocdDv.setUint16(8, 2, true);  // total entries
    eocdDv.setUint32(12, cdSize, true);
    eocdDv.setUint32(16, cdOff, true);

    // Concatenate everything
    const totalSize = cdOff + cdSize + eocd.length;
    const zipBuf = new Uint8Array(totalSize);
    let off = 0;
    zipBuf.set(agencyEntry.hdr, off); off += agencyEntry.hdr.length;
    zipBuf.set(agencyEntry.data, off); off += agencyEntry.data.length;
    zipBuf.set(routesEntry.hdr, off); off += routesEntry.hdr.length;
    zipBuf.set(routesEntry.data, off); off += routesEntry.data.length;
    zipBuf.set(cdAgency, off); off += cdAgency.length;
    zipBuf.set(cdRoutes, off); off += cdRoutes.length;
    zipBuf.set(eocd, off);

    // Mock fetch to serve range requests from the fake ZIP
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      const rangeHeader = opts?.headers?.Range || '';
      const m = rangeHeader.match(/bytes=(\d+)-(\d+)/);
      if (!m) throw new Error('Expected Range header');
      const start = parseInt(m[1]);
      const end   = Math.min(parseInt(m[2]), totalSize - 1);
      const slice = zipBuf.slice(start, end + 1);
      return {
        status: 206,
        ok: true,
        headers: new Headers({ 'content-range': `bytes ${start}-${end}/${totalSize}` }),
        arrayBuffer: async () => slice.buffer,
        text: async () => new TextDecoder().decode(slice),
      };
    }));

    const { getGtfsRoutes } = await import('../services/api/gtfsRoutes.js');
    const routes = await getGtfsRoutes();

    expect(routes).toHaveLength(2);

    const r16 = routes.find(r => r.ref === '16');
    expect(r16).toBeDefined();
    expect(r16.from).toBe('תל אביב');
    expect(r16.to).toBe('ירושלים');
    expect(r16.colour).toBe('#1A73C8');
    expect(r16.operator).toBe('אגד');

    const r4 = routes.find(r => r.ref === '4');
    expect(r4).toBeDefined();
    expect(r4.from).toBe('אשדוד');
    expect(r4.to).toBe('תל אביב');
    // No route_color in CSV → fallback to AGENCY_COLORS for agency_id=5 (דן)
    expect(r4.colour).toBe('#B71C1C');

    vi.unstubAllGlobals();
  });
});
