// Use the Google Maps JS SDK (loaded via @react-google-maps/api) instead of
// direct HTTP calls — the REST endpoints block browser requests with CORS.

function sdk() {
  if (!window.google?.maps) throw new Error('Google Maps SDK not yet loaded');
  return window.google.maps;
}

export async function getTransitDirections(origin, destination, departureTime = new Date()) {
  const maps = sdk();
  const service = new maps.DirectionsService();

  const result = await service.route({
    origin: new maps.LatLng(origin.lat, origin.lng),
    destination: new maps.LatLng(destination.lat, destination.lng),
    travelMode: maps.TravelMode.TRANSIT,
    transitOptions: {
      modes: [maps.TransitMode.BUS, maps.TransitMode.RAIL],
      departureTime,
    },
    provideRouteAlternatives: true,
    language: 'en',
  });

  if (result.status !== 'OK') throw new Error(`Directions: ${result.status}`);
  return result.routes;
}

export async function geocodeAddress(address) {
  const maps = sdk();
  const geocoder = new maps.Geocoder();

  const result = await geocoder.geocode({
    address,
    componentRestrictions: { country: 'IL' },
  });

  if (!result.results?.length) throw new Error('Address not found');
  const loc = result.results[0].geometry.location;
  return {
    lat: loc.lat(),
    lng: loc.lng(),
    label: result.results[0].formatted_address,
  };
}

export async function reverseGeocode(lat, lng) {
  const geocoder = new sdk().Geocoder();
  const result = await geocoder.geocode({ location: { lat, lng } });
  return result.results?.[0]?.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
