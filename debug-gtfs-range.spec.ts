/**
 * Checks what compressed size the GTFS ZIP reports for stops.txt
 * and whether the range response actually delivers that many bytes.
 */
import { test } from '@playwright/test';

test('gtfs range size check', async ({ page }) => {
  test.setTimeout(120_000);

  // Intercept responses to log sizes
  const rangeSizes: string[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.includes('gtfsfiles')) return;
    const range = res.headers()['content-range'] || '';
    const len   = res.headers()['content-length'] || '';
    const status = res.status();
    try {
      const buf = await res.body();
      rangeSizes.push(`${status} range="${range}" cl=${len} actual=${buf.byteLength}`);
    } catch {
      rangeSizes.push(`${status} range="${range}" cl=${len} (body read failed)`);
    }
  });

  await page.goto('http://localhost:5173/nearby');

  // Wipe cache and inject diagnostic code
  await page.evaluate(() => {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i); if (k) localStorage.removeItem(k);
    }
  });

  // Inject a test that directly calls the internals to measure stops.txt size
  const result = await page.evaluate(async () => {
    const ZIP = '/proxy/mot/gtfsfiles/israel-public-transportation.zip';

    // Step 1: probe total size
    const probe = await fetch(ZIP, { headers: { Range: 'bytes=0-0' } });
    const cr = probe.headers.get('content-range') || '';
    const sizeMatch = cr.match(/\/(\d+)$/);
    const size = sizeMatch ? parseInt(sizeMatch[1]) : 0;

    // Step 2: get tail for EOCD
    const tailLen = Math.min(65558, size);
    const tailRes = await fetch(ZIP, { headers: { Range: `bytes=${size - tailLen}-${size - 1}` } });
    const tail = await tailRes.arrayBuffer();
    const dv = new DataView(tail);
    let eocd = -1;
    for (let i = tail.byteLength - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd === -1) return { error: 'EOCD not found' };
    const cdSize = dv.getUint32(eocd + 12, true);
    const cdOff  = dv.getUint32(eocd + 16, true);

    // Step 3: fetch central directory
    const cdRes = await fetch(ZIP, { headers: { Range: `bytes=${cdOff}-${cdOff + cdSize - 1}` } });
    const cd = await cdRes.arrayBuffer();
    const cdv2 = new DataView(cd);

    // Step 4: find stops.txt in central directory
    let p = 0;
    const entries: any[] = [];
    while (p + 46 <= cd.byteLength) {
      if (cdv2.getUint32(p, true) !== 0x02014b50) break;
      const compressedSize   = cdv2.getUint32(p + 20, true);
      const uncompressedSize = cdv2.getUint32(p + 24, true);
      const fnLen  = cdv2.getUint16(p + 28, true);
      const extLen = cdv2.getUint16(p + 30, true);
      const cmtLen = cdv2.getUint16(p + 32, true);
      const localOff = cdv2.getUint32(p + 42, true);
      const fname = new TextDecoder().decode(new Uint8Array(cd, p + 46, fnLen));
      if (fname.includes('stops') || fname.includes('agency') || fname.includes('routes')) {
        entries.push({ fname, compressedSize, uncompressedSize, localOff });
      }
      p += 46 + fnLen + extLen + cmtLen;
    }

    // Step 5: for stops.txt, fetch the actual data range and check size
    const stopsEntry = entries.find(e => e.fname === 'stops.txt');
    if (!stopsEntry) return { error: 'stops.txt not found', entries };

    const { localOff, compressedSize } = stopsEntry;
    const rangeEnd = localOff + 512 + compressedSize - 1;
    const dataRes = await fetch(ZIP, { headers: { Range: `bytes=${localOff}-${rangeEnd}` } });
    const dataBuf = await dataRes.arrayBuffer();

    // Read local file header to find actual data start
    const ldv = new DataView(dataBuf);
    const fnLenLocal = ldv.getUint16(26, true);
    const exLenLocal = ldv.getUint16(28, true);
    const dataStart  = 30 + fnLenLocal + exLenLocal;
    const available  = dataBuf.byteLength - dataStart;

    return {
      zipTotalSize: size,
      entries,
      stopsEntry,
      requestedBytes: rangeEnd - localOff + 1,
      receivedBytes:  dataBuf.byteLength,
      dataStart,
      available,
      truncated: available < compressedSize,
      truncatedBy: compressedSize - available,
    };
  });

  console.log('\n=== GTFS RANGE ANALYSIS ===');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n=== RANGE RESPONSES ===');
  rangeSizes.forEach(r => console.log(' ', r));
});
