import { useState, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polyline } from '@react-google-maps/api';
import { GOOGLE_MAPS_LIBRARIES } from '../map/TransitMap';
import AdvancedMarker from '../map/AdvancedMarker';
import { getRouteStopCoords } from '../../services/api/railStationCoords';
import LoadingSpinner from '../common/LoadingSpinner';

const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'greedy',
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

function extractStopCodes(route) {
  // Collect all station codes in order across all train legs
  const codes = [];
  const seen = new Set();
  for (const train of route.Train || []) {
    const stops = train.Stations || [];
    if (stops.length) {
      for (const s of stops) {
        const id = String(s.StationId || s.stationId || s.station_id);
        if (id && id !== 'undefined' && !seen.has(id)) { seen.add(id); codes.push(id); }
      }
    } else {
      // Fallback: just origin and destination
      const o = String(train.OrignStation || train.originStation || '');
      const d = String(train.DestStation || train.destStation || '');
      if (o && !seen.has(o)) { seen.add(o); codes.push(o); }
      if (d && !seen.has(d)) { seen.add(d); codes.push(d); }
    }
  }
  return codes;
}

export default function TrainMap({ route, stations }) {
  const [stops, setStops] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const mapRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    if (!route || !isLoaded) return;
    const codes = extractStopCodes(route);
    if (!codes.length) return;
    setGeocoding(true);
    getRouteStopCoords(codes, stations)
      .then((coords) => { setStops(coords); setGeocoding(false); })
      .catch(() => setGeocoding(false));
  }, [route, isLoaded]);

  // Fit map to all stops
  useEffect(() => {
    if (!stops.length || !mapRef.current || !isLoaded) return;
    const bounds = new window.google.maps.LatLngBounds();
    stops.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
    mapRef.current.fitBounds(bounds, 50);
  }, [stops, isLoaded]);

  if (!isLoaded || geocoding) return <LoadingSpinner className="h-full bg-gray-900" />;
  if (!stops.length) return (
    <div className="h-full bg-gray-900 flex items-center justify-center text-gray-500 text-xs">
      No station coordinates available
    </div>
  );

  const path = stops.map((s) => ({ lat: s.lat, lng: s.lng }));

  return (
    <GoogleMap
      mapContainerClassName="w-full h-full"
      center={stops[0] ? { lat: stops[0].lat, lng: stops[0].lng } : { lat: 31.8, lng: 34.9 }}
      zoom={8}
      options={MAP_OPTIONS}
      onLoad={(map) => { mapRef.current = map; }}
    >
      {/* Route line */}
      {path.length > 1 && (
        <Polyline path={path} options={{
          strokeColor: '#6B48FF',
          strokeOpacity: 0.9,
          strokeWeight: 4,
          zIndex: 10,
        }} />
      )}

      {/* Station markers */}
      {stops.map((stop, i) => {
        const isFirst = i === 0, isLast = i === stops.length - 1;
        const sz = isFirst || isLast ? 18 : 14;
        const bg = isFirst ? '#10B981' : isLast ? '#EF4444' : '#6B7280';
        return (
          <AdvancedMarker
            key={stop.code}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name}
            zIndex={isFirst || isLast ? 20 : 10}
          >
            <div style={{
              width: sz, height: sz, borderRadius: '50%',
              background: bg, border: '2px solid #fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, fontWeight: 'bold', color: '#fff',
            }}>
              {i + 1}
            </div>
          </AdvancedMarker>
        );
      })}
    </GoogleMap>
  );
}
