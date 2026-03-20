import { Polyline } from '@react-google-maps/api';

export default function RoutePolyline({ route }) {
  if (!route?.overview_polyline?.points) return null;

  // Decode Google's encoded polyline
  const path = decodePolyline(route.overview_polyline.points);

  return (
    <Polyline
      path={path}
      options={{
        strokeColor: '#3B82F6',
        strokeOpacity: 1.0,
        strokeWeight: 5,
        zIndex: 10,
      }}
    />
  );
}

function decodePolyline(encoded) {
  const poly = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;

    poly.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return poly;
}
