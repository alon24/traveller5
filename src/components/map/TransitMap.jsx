import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Crosshair } from 'lucide-react';
import AdvancedMarker from './AdvancedMarker';
import { useMapStore } from '../../stores/useMapStore';
import { useLocationStore } from '../../stores/useLocationStore';
import { useTripStore } from '../../stores/useTripStore';
import { useNearbyStops } from '../../hooks/useNearbyStops';
import { useVehiclePositions } from '../../hooks/useGtfsRealtime';
import { getGtfsRoutes } from '../../services/api/gtfsRoutes';
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

  const [routeIdMap, setRouteIdMap] = useState({});
  useEffect(() => {
    getGtfsRoutes().then(allRoutes => {
      const map = {};
      allRoutes.forEach(r => { map[r.routeId] = r.ref; });
      setRouteIdMap(map);
    }).catch(() => {});
  }, []);

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

  const [libraries] = useState(GOOGLE_MAPS_LIBRARIES);
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
    libraries,
  });

  const onLoad = useCallback((map) => { mapRef.current = map; }, []);

  const locateMe = () => {
    if (coords && mapRef.current) {
      mapRef.current.panTo(coords);
      mapRef.current.setZoom(16);
    }
  };

  if (loadError) return (
    <div className="flex items-center justify-center h-full bg-gray-50 text-gray-600">
      Map failed to load. Check your API key.
    </div>
  );

  if (!isLoaded) return <LoadingSpinner size="lg" className="h-full bg-gray-50" />;

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
        {nearbyBuses.map((bus) => {
          const lineRef = routeIdMap[bus.routeId];
          return (
            <AdvancedMarker
              key={bus.vehicleId}
              position={{ lat: bus.lat, lng: bus.lng }}
              title={lineRef ? `Line ${lineRef} (Bus ${bus.vehicleId})` : `Bus ${bus.vehicleId}`}
              zIndex={80}
            >
              <div 
                className="relative flex items-center justify-center z-[80] drop-shadow-md"
                style={{ width: 42, height: 28, cursor: 'pointer' }}
              >
                {/* Bus Skeleton Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 24 24" className="overflow-visible">
                  <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
                  </g>
                  <g stroke="#3B82F6" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
                  </g>
                </svg>

                {/* Line Number Badge */}
                {lineRef && (
                  <div 
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm border border-white"
                    style={{ backgroundColor: '#3B82F6' }}
                  >
                    {lineRef}
                  </div>
                )}

                {/* Live Pulsating Indicator */}
                <div className="absolute top-0.5 left-0.5 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500 opacity-40 animate-ping" />
                </div>

                <div 
                  className="absolute inset-x-0 bottom-0 top-0 pointer-events-none"
                  style={{ transform: `rotate(${bus.bearing ?? 0}deg)` }}
                >
                  <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-gray-700 drop-shadow-sm" />
                </div>
              </div>
            </AdvancedMarker>
          );
        })}
      </GoogleMap>

      {!compact && (
        <button
          onClick={locateMe}
          title="Go to my location"
          className="absolute bottom-24 right-3 z-10 bg-gray-50 hover:bg-gray-100 border border-gray-300 text-gray-900 p-2.5 rounded-full shadow-lg transition-colors"
        >
          <Crosshair size={18} />
        </button>
      )}
    </div>
  );
}
