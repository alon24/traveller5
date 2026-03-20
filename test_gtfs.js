import { getGtfsStops, getGtfsRoutes } from './src/services/api/gtfsRoutes.js';

// Test script to verify stop city extraction.
async function testStops() {
  const [stops, routes] = await Promise.all([getGtfsStops(), getGtfsRoutes()]);
  
  const rehovotStops = stops.filter(s => s.name.includes('רחובות'));
  console.log('Sample Rehovot stops:');
  rehovotStops.slice(0, 5).forEach(s => {
    console.log(`Name: ${s.name}, City: ${s.city}`);
  });
  
  const variants14 = routes.filter(r => r.ref === '14');
  console.log('\nLine 14 Variants (first 10):');
  variants14.slice(0, 10).forEach(v => {
    console.log(`From: ${v.from}, To: ${v.to}, Long: ${v.longName}`);
  });
  
  const rehovot14 = variants14.filter(v => 
    v.to.includes('רחובות') || v.from.includes('רחובות') || v.longName.includes('רחובות')
  );
  console.log('\nRehovot Line 14 variants found:', rehovot14.length);
  rehovot14.forEach(v => console.log(` - ${v.longName}`));
}

testStops().catch(console.error);
