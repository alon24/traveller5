import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
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

function bearingToDir(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export default function NearbyMap({ stops, selectedId, onSelectStop, routeStops, routeShape, routeColor, busPositions, routeLoading, activeLine }) {
  const coords = useLocationStore((s) => s.coords);
  const mapRef    = useRef(null);
  const polyRef   = useRef(null); // google.maps.Polyline instance
  const mapContainerRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { bus, x, y }

  const handleBusEnter = useCallback((bus, e) => {
    const rect = mapContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ bus, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleBusLeave = useCallback(() => setTooltip(null), []);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
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
    // While a line is selected and shape is still loading, hold off — avoids
    // zooming to the previous line's bounds or to stale stops data.
    if (activeLine?.ref && routeShape === null) return;

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
  }, [selectedId, routeStopsWithBearing, routeShape, isLoaded, activeLine?.ref]);

  const color = routeColor || '#1565C0';

  // Manage the route polyline directly so it is always removed/updated cleanly.
  // Using <Polyline> from @react-google-maps/api can leave stale instances on
  // the map when the component unmounts or the path switches between sources.
  const polylinePath = useMemo(() => {
    // null  → shape still loading: clear old polyline immediately, draw nothing
    // []    → shape done but failed: fall back to stop-sequence line
    // [...] → smooth shape ready: use it
    if (routeShape === null) return [];
    if (routeShape.length > 1) return routeShape;
    return routeStopsWithBearing.map((s) => ({ lat: s.lat, lng: s.lng }));
  }, [routeShape, routeStopsWithBearing]);

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

  function zoomToMe() {
    if (!coords || !mapRef.current) return;
    mapRef.current.panTo({ lat: coords.lat, lng: coords.lng });
    mapRef.current.setZoom(16);
  }

  return (
    <div ref={mapContainerRef} className="relative w-full h-full">
    {/* Zoom-to-location button */}
    {coords && (
      <button
        onClick={zoomToMe}
        title="Zoom to my location"
        className="absolute bottom-24 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-gray-900/90 border border-gray-600 shadow-lg text-blue-400 hover:text-blue-300 hover:border-blue-500 active:scale-95 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
        </svg>
      </button>
    )}
    {routeLoading && (
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-full bg-gray-900/90 border border-gray-700 shadow-lg">
          <Loader size={14} className="animate-spin text-white" />
          {activeLine?.ref && (
            <span
              className="text-sm font-bold font-mono text-white px-2 py-0.5 rounded"
              style={{ backgroundColor: color }}
            >
              {activeLine.ref}
            </span>
          )}
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
      {/* User location — pulsing blue dot */}
      {coords && (
        <AdvancedMarker position={coords} zIndex={100} title="You are here">
          <div className="relative flex items-center justify-center" style={{ width: 48, height: 48 }}>
            {/* Pulsing outer ring */}
            <div className="absolute w-10 h-10 rounded-full bg-blue-500 opacity-30 animate-ping" />
            {/* Static halo */}
            <div className="absolute w-8 h-8 rounded-full bg-blue-500 opacity-20" />
            {/* White ring */}
            <div className="absolute w-5 h-5 rounded-full bg-white shadow-md" />
            {/* Blue core */}
            <div className="absolute w-3.5 h-3.5 rounded-full bg-blue-600" />
          </div>
        </AdvancedMarker>
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
          {/* Rotate to bearing; bus SVG faces right (east = 0°) */}
          <div
            onMouseEnter={(e) => handleBusEnter(bus, e)}
            onMouseLeave={handleBusLeave}
            style={{ transform: `rotate(${bus.bearing ?? 0}deg)`, display: 'inline-block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))', cursor: 'default' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="52" height="28" viewBox="0 0 52 28">
              {/* Body */}
              <rect x="2" y="4" width="44" height="18" rx="4" fill={color} />
              {/* Roof highlight */}
              <rect x="4" y="4" width="40" height="5" rx="3" fill="white" opacity="0.18" />
              {/* Front face (right side = direction of travel) */}
              <rect x="44" y="4" width="6" height="18" rx="2" fill={color} />
              <rect x="45" y="6" width="4" height="7" rx="1" fill="white" opacity="0.85" />
              {/* Headlight */}
              <rect x="46" y="14" width="3" height="3" rx="0.5" fill="#FFF176" />
              {/* Rear */}
              <rect x="2" y="6" width="4" height="8" rx="1" fill="white" opacity="0.3" />
              {/* Windows */}
              <rect x="9"  y="6" width="8" height="7" rx="1.5" fill="white" opacity="0.82" />
              <rect x="20" y="6" width="8" height="7" rx="1.5" fill="white" opacity="0.82" />
              <rect x="31" y="6" width="8" height="7" rx="1.5" fill="white" opacity="0.82" />
              {/* Door */}
              <rect x="9" y="14" width="8" height="6" rx="1" fill="white" opacity="0.35" />
              {/* Wheels */}
              <circle cx="12" cy="23" r="4" fill="#222" stroke="white" strokeWidth="1.5" />
              <circle cx="38" cy="23" r="4" fill="#222" stroke="white" strokeWidth="1.5" />
              {/* Outline */}
              <rect x="2" y="4" width="44" height="18" rx="4" fill="none" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
        </AdvancedMarker>
      ))}
    </GoogleMap>

    {/* Bus hover tooltip */}
    {tooltip && (() => {
      const secsAgo = tooltip.bus.recordedAt
        ? Math.round((Date.now() - new Date(tooltip.bus.recordedAt)) / 1000)
        : null;
      const dir = bearingToDir(tooltip.bus.bearing ?? 0);
      const lineRef = activeLine?.ref;
      const lineTo  = activeLine?.to;
      // Keep tooltip inside map: flip left if near right edge
      const flipX = tooltip.x > (mapContainerRef.current?.clientWidth ?? 400) - 160;
      return (
        <div
          className="pointer-events-none absolute z-30 px-3 py-2 rounded-xl bg-gray-900/95 border border-gray-700 shadow-xl text-white text-xs leading-snug"
          style={{
            left:      flipX ? tooltip.x - 8  : tooltip.x + 12,
            top:       tooltip.y - 12,
            transform: flipX ? 'translateX(-100%)' : 'none',
            minWidth:  120,
          }}
        >
          {lineRef && <div className="font-bold text-sm mb-0.5" style={{ color }}>{lineRef}</div>}
          {lineTo  && <div className="text-gray-300 truncate max-w-[140px]">{lineTo}</div>}
          <div className="text-gray-400 mt-1">{dir} · {tooltip.bus.velocity ? `${Math.round(tooltip.bus.velocity)} km/h` : 'stopped'}</div>
          {secsAgo !== null && (
            <div className="text-gray-500 mt-0.5">{secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo/60)}m ago`}</div>
          )}
        </div>
      );
    })()}
    </div>
  );
}
