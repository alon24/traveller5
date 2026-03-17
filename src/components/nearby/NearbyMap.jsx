import { useRef, useEffect, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, Circle } from '@react-google-maps/api';
import { Loader } from 'lucide-react';
import { GOOGLE_MAPS_LIBRARIES } from '../map/TransitMap';
import { useLocationStore } from '../../stores/useLocationStore';
import AdvancedMarker from '../map/AdvancedMarker';
import LoadingSpinner from '../common/LoadingSpinner';

const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  gestureHandling: 'greedy',
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

function computeBearing(lat1, lng1, lat2, lng2) {
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default function NearbyMap({ stops, selectedId, onSelectStop, routeStops, routeShape, routeColor, busPositions, routeLoading }) {
  const coords = useLocationStore((s) => s.coords);
  const mapRef    = useRef(null);
  const polyRef   = useRef(null); // google.maps.Polyline instance

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const nearbyById = useMemo(() => {
    const m = {};
    stops.forEach((s) => { m[s.id] = s; });
    return m;
  }, [stops]);

  const routeStopsWithBearing = useMemo(() => {
    return routeStops.map((stop, i) => {
      const prev = routeStops[i - 1] ?? stop;
      const next = routeStops[i + 1] ?? stop;
      return { ...stop, bearing: computeBearing(prev.lat, prev.lng, next.lat, next.lng) };
    });
  }, [routeStops]);

  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const shapePoints = routeShape?.length > 1 ? routeShape : null;
    const anchorPoints = shapePoints ?? (routeStopsWithBearing.length ? routeStopsWithBearing : null);
    if (anchorPoints) {
      const bounds = new window.google.maps.LatLngBounds();
      anchorPoints.forEach((s) => bounds.extend({ lat: s.lat, lng: s.lng }));
      mapRef.current.fitBounds(bounds, 40);
    } else if (selectedId) {
      const stop = stops.find((s) => s.id === selectedId);
      if (stop) mapRef.current.panTo({ lat: stop.lat, lng: stop.lng });
    }
  }, [selectedId, routeStopsWithBearing, routeShape, isLoaded]);

  const color = routeColor || '#1565C0';

  // Manage the route polyline directly so it is always removed/updated cleanly.
  // Using <Polyline> from @react-google-maps/api can leave stale instances on
  // the map when the component unmounts or the path switches between sources.
  const polylinePath = useMemo(
    () => (routeShape && routeShape.length > 1)
      ? routeShape
      : routeStopsWithBearing.map((s) => ({ lat: s.lat, lng: s.lng })),
    [routeShape, routeStopsWithBearing],
  );

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const maps = window.google?.maps;
    if (!maps) return;

    // Create the polyline once and reuse it (avoids leaving stale instances on map)
    if (!polyRef.current) {
      polyRef.current = new maps.Polyline({
        strokeOpacity: 0.85,
        strokeWeight:  4,
        zIndex:        20,
      });
    }

    if (polylinePath.length <= 1) {
      // No route selected — hide the polyline
      polyRef.current.setMap(null);
    } else {
      polyRef.current.setOptions({ strokeColor: color });
      polyRef.current.setPath(polylinePath);
      polyRef.current.setMap(mapRef.current);
    }
  }, [polylinePath, isLoaded, color]);

  // Remove the polyline when NearbyMap unmounts entirely
  useEffect(() => {
    return () => { if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null; } };
  }, []);

  if (!isLoaded) return <LoadingSpinner className="h-full bg-gray-900" />;
  const routeStopIds = new Set(routeStopsWithBearing.map((s) => s.id));

  return (
    <div className="relative w-full h-full">
    {routeLoading && (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-gray-900/80 border border-gray-700 shadow-lg">
          <Loader size={14} className="animate-spin text-blue-400" />
          <span className="text-xs text-gray-300">Loading route…</span>
        </div>
      </div>
    )}
    <GoogleMap
      mapContainerClassName="w-full h-full"
      center={coords || { lat: 31.8942, lng: 34.812 }}
      zoom={15}
      options={MAP_OPTIONS}
      onLoad={(map) => { mapRef.current = map; }}
    >
      {/* User location */}
      {coords && (
        <>
          <Circle center={coords} radius={8}
            options={{ fillColor: '#3B82F6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, zIndex: 100 }} />
          <Circle center={coords} radius={50}
            options={{ fillColor: '#3B82F6', fillOpacity: 0.15, strokeColor: '#3B82F6', strokeWeight: 1, zIndex: 99 }} />
        </>
      )}

      {/* Route polyline is managed directly via polyRef — see useEffect above */}

      {/* Route terminal markers: arrow at start, dot at end */}
      {routeStopsWithBearing.length >= 1 && (() => {
        const first = routeStopsWithBearing[0];
        const last  = routeStopsWithBearing[routeStopsWithBearing.length - 1];
        const firstSelected = first.id === selectedId;
        const firstNearby   = !!nearbyById[first.id];
        const lastNearby    = !!nearbyById[last.id];
        const lastSelected  = last.id === selectedId;
        const sz = firstSelected ? 20 : 16;
        return (
          <>
            {/* Arrow at first stop (only if there are 2+ stops for direction) */}
            {routeStopsWithBearing.length >= 2 && (
              <AdvancedMarker
                key="route-arrow-start"
                position={{ lat: first.lat, lng: first.lng }}
                title={first.name || ''}
                zIndex={firstSelected ? 60 : firstNearby ? 40 : 25}
                onClick={firstNearby ? () => onSelectStop(first.id === selectedId ? null : first.id) : undefined}
                cursor={firstNearby ? 'pointer' : 'default'}
              >
                <svg width={sz} height={sz} viewBox="-10 -10 20 20"
                  style={{ transform: `rotate(${first.bearing}deg)`, display: 'block', transformOrigin: 'center' }}>
                  <polygon points="0,-8 5,4 0,1 -5,4"
                    fill={firstSelected ? '#3B82F6' : color} stroke="white" strokeWidth="1.5" />
                </svg>
              </AdvancedMarker>
            )}
            {/* Dot at last stop */}
            <AdvancedMarker
              key="route-dot-end"
              position={{ lat: last.lat, lng: last.lng }}
              title={last.name || ''}
              zIndex={lastSelected ? 60 : lastNearby ? 40 : 25}
              onClick={lastNearby ? () => onSelectStop(last.id === selectedId ? null : last.id) : undefined}
              cursor={lastNearby ? 'pointer' : 'default'}
            >
              <div style={{
                width: lastSelected ? 14 : 10,
                height: lastSelected ? 14 : 10,
                borderRadius: '50%',
                background: lastSelected ? '#3B82F6' : color,
                border: `${lastSelected ? 2.5 : 1.5}px solid #fff`,
              }} />
            </AdvancedMarker>
          </>
        );
      })()}

      {/* Intermediate route stop markers (all stops between first and last) */}
      {routeStopsWithBearing.slice(1, -1).map((stop) => {
        const isNearby   = !!nearbyById[stop.id];
        const isSelected = stop.id === selectedId;
        const sz = isSelected ? 12 : 7;
        return (
          <AdvancedMarker
            key={`route-mid-${stop.id}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name || ''}
            zIndex={isSelected ? 55 : isNearby ? 35 : 15}
            onClick={isNearby ? () => onSelectStop(stop.id === selectedId ? null : stop.id) : undefined}
            cursor={isNearby ? 'pointer' : 'default'}
          >
            <div style={{
              width: sz, height: sz, borderRadius: '50%',
              background: isSelected ? '#3B82F6' : color,
              border: `${isSelected ? 2 : 1.5}px solid #fff`,
              opacity: 0.9,
            }} />
          </AdvancedMarker>
        );
      })}

      {/* Nearby stop circles (those not already shown as route arrows) */}
      {stops.filter((s) => !routeStopIds.has(s.id)).map((stop) => {
        const isSelected = stop.id === selectedId;
        const sz = isSelected ? 16 : 10;
        return (
          <AdvancedMarker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name}
            zIndex={isSelected ? 50 : 10}
            onClick={() => onSelectStop(stop.id === selectedId ? null : stop.id)}
            cursor="pointer"
          >
            <div style={{
              width: sz, height: sz, borderRadius: '50%',
              background: isSelected ? '#3B82F6' : '#10B981',
              border: `${isSelected ? 2.5 : 1.5}px solid #fff`,
            }} />
          </AdvancedMarker>
        );
      })}

      {/* Live bus positions */}
      {busPositions?.map((bus) => (
        <AdvancedMarker
          key={bus.vehicleId}
          position={{ lat: bus.lat, lng: bus.lng }}
          title={`Bus ${bus.vehicleId}`}
          zIndex={80}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="-16 -16 32 32"
            style={{ transform: `rotate(${(bus.bearing ?? 0) - 90}deg)`, display: 'block' }}>
            <rect x="-9" y="-6" width="18" height="12" rx="3" fill={color} stroke="white" strokeWidth="1.5"/>
            <polygon points="9,-2 13,0 9,2" fill="white" opacity="0.9"/>
            <rect x="-6" y="-4" width="5" height="4" rx="1" fill="white" opacity="0.75"/>
            <rect x="1" y="-4" width="5" height="4" rx="1" fill="white" opacity="0.75"/>
            <circle cx="-5" cy="6" r="2" fill={color} stroke="white" strokeWidth="1.5"/>
            <circle cx="5" cy="6" r="2" fill={color} stroke="white" strokeWidth="1.5"/>
          </svg>
        </AdvancedMarker>
      ))}
    </GoogleMap>
    </div>
  );
}
