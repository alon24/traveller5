/**
 * Inspects the raw Overpass response to see if OSM nodes
 * actually carry `ref` tags matching GTFS stop codes.
 */
import { test } from '@playwright/test';

test('inspect Overpass node tags near Rehovot', async ({ page }) => {
  test.setTimeout(60_000);

  let overpassResponseBody: string | null = null;

  page.on('response', async (res) => {
    if (res.url().includes('overpass') && res.request().method() === 'POST') {
      try { overpassResponseBody = await res.text(); } catch {}
    }
  });

  await page.context().grantPermissions(['geolocation']);
  // Use Rehovot (fallback) coords directly
  await page.context().setGeolocation({ latitude: 31.8939, longitude: 34.8126 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://localhost:5173/nearby');
  await page.waitForTimeout(20_000); // wait for Overpass to complete

  if (!overpassResponseBody) {
    console.log('No Overpass response captured');
    return;
  }

  const data = JSON.parse(overpassResponseBody);
  const nodes = data.elements?.filter((e: any) => e.type === 'node') ?? [];
  const rels  = data.elements?.filter((e: any) => e.type === 'relation') ?? [];

  console.log(`\nNodes: ${nodes.length}, Relations: ${rels.length}`);

  // Show tag keys for first 10 nodes
  console.log('\n--- First 10 node tag sets ---');
  nodes.slice(0, 10).forEach((n: any) => {
    const tags = n.tags || {};
    console.log(`  node ${n.id}: ${JSON.stringify(tags)}`);
  });

  // Count nodes with ref tags
  const withRef     = nodes.filter((n: any) => n.tags?.ref).length;
  const withRefILBS = nodes.filter((n: any) => n.tags?.['ref:IL:BS']).length;
  const withLocalRef = nodes.filter((n: any) => n.tags?.local_ref).length;
  console.log(`\nNodes with ref: ${withRef}, ref:IL:BS: ${withRefILBS}, local_ref: ${withLocalRef}`);

  // Sample relation refs
  console.log('\n--- First 5 relations ---');
  rels.slice(0, 5).forEach((r: any) => {
    const nodeMembers = (r.members || []).filter((m: any) => m.type === 'node').length;
    console.log(`  rel ${r.id}: ref=${r.tags?.ref} route=${r.tags?.route} name=${r.tags?.name?.slice(0,40)} nodeMembers=${nodeMembers}`);
  });
});
