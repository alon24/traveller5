import { useCallback, useRef, useMemo } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Crosshair } from 'lucide-react';
import AdvancedMarker from './AdvancedMarker';
import { useMapStore } from '../../stores/useMapStore';
import { useLocationStore } from '../../stores/useLocationStore';
import { useTripStore } from '../../stores/useTripStore';
import { useNearbyStops } from '../../hooks/useNearbyStops';
import { useVehiclePositions } from '../../hooks/useGtfsRealtime';
import UserMarker from './UserMarker';
import RoutePolyline from './RoutePolyline';
import LoadingSpinner from '../common/LoadingSpinner';

const BUS_RADIUS_M = 1500;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const GOOGLE_MAPS_LIBRARIES = ['places', 'geometry', 'marker'];

const MAP_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

// compact=true → no controls, no stop markers (for dashboard preview)
export default function TransitMap({ compact = false }) {
  const { center, zoom } = useMapStore();
  const coords = useLocationStore((s) => s.coords);
  const routes = useTripStore((s) => s.routes);
  const selectedRouteIndex = useTripStore((s) => s.selectedRouteIndex);
  const mapRef = useRef(null);

  const { data: stops = [] } = useNearbyStops(
    compact ? null : coords?.lat,
    compact ? null : coords?.lng,
    1000
  );

  const { data: allVehicles = [] } = useVehiclePositions();
  const nearbyBuses = useMemo(() => {
    if (compact || !coords || !allVehicles.length) return [];
    return allVehicles.filter(
      (v) => haversine(coords.lat, coords.lng, v.lat, v.lng) <= BUS_RADIUS_M
    );
  }, [allVehicles, coords, compact]);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const onLoad = useCallback((map) => { mapRef.current = map; }, []);

  const locateMe = () => {
    if (coords && mapRef.current) {
      mapRef.current.panTo(coords);
      mapRef.current.setZoom(16);
    }
  };

  if (loadError) return (
    <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
      Map failed to load. Check your API key.
    </div>
  );

  if (!isLoaded) return <LoadingSpinner size="lg" className="h-full bg-gray-900" />;

  const selectedRoute = routes[selectedRouteIndex];

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        mapContainerClassName="w-full h-full"
        center={coords || center}
        zoom={compact ? 14 : zoom}
        options={{
          ...MAP_OPTIONS,
          zoomControl: !compact,
          gestureHandling: compact ? 'none' : 'auto',
          keyboardShortcuts: !compact,
        }}
        onLoad={onLoad}
      >
        {coords && <UserMarker position={coords} />}
        {selectedRoute && <RoutePolyline route={selectedRoute} />}
        {!compact && stops.slice(0, 60).map((stop) => (
          <AdvancedMarker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name}
          >
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#10B981', border: '1.5px solid #fff',
            }} />
          </AdvancedMarker>
        ))}

        {/* Live bus positions */}
        {nearbyBuses.map((bus) => (
          <AdvancedMarker
            key={bus.vehicleId}
            position={{ lat: bus.lat, lng: bus.lng }}
            title={`Bus ${bus.vehicleId}`}
            zIndex={80}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-16 -16 32 32"
              style={{ transform: `rotate(${(bus.bearing ?? 0) - 90}deg)`, display: 'block' }}>
              <rect x="-9" y="-6" width="18" height="12" rx="3" fill="#1D4ED8" stroke="white" strokeWidth="1.5"/>
              <polygon points="9,-2 13,0 9,2" fill="white" opacity="0.9"/>
              <rect x="-6" y="-4" width="5" height="4" rx="1" fill="white" opacity="0.75"/>
              <rect x="1" y="-4" width="5" height="4" rx="1" fill="white" opacity="0.75"/>
              <circle cx="-5" cy="6" r="2" fill="#1D4ED8" stroke="white" strokeWidth="1.5"/>
              <circle cx="5" cy="6" r="2" fill="#1D4ED8" stroke="white" strokeWidth="1.5"/>
            </svg>
          </AdvancedMarker>
        ))}
      </GoogleMap>

      {!compact && (
        <button
          onClick={locateMe}
          title="Go to my location"
          className="absolute bottom-24 right-3 z-10 bg-gray-900 hover:bg-gray-800 border border-gray-700 text-white p-2.5 rounded-full shadow-lg transition-colors"
        >
          <Crosshair size={18} />
        </button>
      )}
    </div>
  );
}
