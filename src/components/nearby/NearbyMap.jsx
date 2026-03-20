import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { Loader, Bus } from 'lucide-react';
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

  const [libraries] = useState(GOOGLE_MAPS_LIBRARIES);
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
    libraries,
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
        strokeOpacity: 1.0,
        strokeWeight:  5,
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

  if (!isLoaded) return <LoadingSpinner className="h-full bg-gray-50" />;
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
        className="absolute bottom-24 right-3 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-gray-50/90 border border-gray-600 shadow-lg text-blue-400 hover:text-blue-300 hover:border-blue-500 active:scale-95 transition-all"
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
        <div className="flex items-center gap-1.5 pl-3 pr-2 py-2 rounded-full bg-gray-50/90 border border-gray-300 shadow-lg">
          <Loader size={14} className="animate-spin text-gray-900" />
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
        const sz = firstSelected ? 24 : 18;
        return (
          <>
            {/* Arrow at first stop (only if there are 2+ stops for direction) */}
            {routeStopsWithBearing.length >= 2 && (
              <AdvancedMarker
                key="route-arrow-start"
                position={{ lat: first.lat, lng: first.lng }}
                title={first.name || ''}
                zIndex={firstSelected ? 60 : firstNearby ? 40 : 25}
                onClick={firstNearby ? () => {
                  onSelectStop(first.id === selectedId ? null : first.id);
                  if (mapRef.current && mapRef.current.getZoom() < 17) mapRef.current.setZoom(17);
                } : undefined}
                cursor={firstNearby ? 'pointer' : 'default'}
              >
                <div 
                  className={`flex items-center justify-center rounded-full border-2 shadow-sm transition-all bg-white overflow-hidden ${firstSelected ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  style={{ 
                    width: sz, 
                    height: sz, 
                    borderColor: firstSelected ? '#3B82F6' : color,
                    color: firstSelected ? '#3B82F6' : color
                  }}
                >
                  <svg width={sz * 0.75} height={sz * 0.75} viewBox="-10 -10 20 20"
                    style={{ transform: `rotate(${first.bearing}deg)`, display: 'block', transformOrigin: 'center' }}>
                    <polygon points="0,-8 5,4 0,1 -5,4"
                      fill="currentColor" stroke="white" strokeWidth="1.5" />
                  </svg>
                </div>
              </AdvancedMarker>
            )}
            {/* Dot at last stop */}
            <AdvancedMarker
              key="route-dot-end"
              position={{ lat: last.lat, lng: last.lng }}
              title={last.name || ''}
              zIndex={lastSelected ? 60 : lastNearby ? 40 : 25}
              onClick={lastNearby ? () => {
                onSelectStop(last.id === selectedId ? null : last.id);
                if (mapRef.current && mapRef.current.getZoom() < 17) mapRef.current.setZoom(17);
              } : undefined}
              cursor={lastNearby ? 'pointer' : 'default'}
            >
            <div 
              className={`flex items-center justify-center rounded-full border-2 shadow-sm transition-all bg-white overflow-hidden ${lastSelected ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ 
                width: sz, 
                height: sz, 
                borderColor: lastSelected ? '#3B82F6' : color,
                color: lastSelected ? '#3B82F6' : color
              }}
            >
              <div style={{
                width: sz * 0.5,
                height: sz * 0.5,
                borderRadius: '50%',
                background: 'currentColor',
              }} />
            </div>
            </AdvancedMarker>
          </>
        );
      })()}

      {/* Intermediate route stop markers (all stops between first and last) */}
      {routeStopsWithBearing.slice(1, -1).map((stop) => {
        const isNearby   = !!nearbyById[stop.id];
        const isSelected = stop.id === selectedId;
        const sz = isSelected ? 20 : 14;
        return (
          <AdvancedMarker
            key={`route-mid-${stop.id}`}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name || ''}
            zIndex={isSelected ? 55 : isNearby ? 35 : 15}
            onClick={isNearby ? () => {
              onSelectStop(stop.id === selectedId ? null : stop.id);
              if (mapRef.current && mapRef.current.getZoom() < 17) mapRef.current.setZoom(17);
            } : undefined}
            cursor={isNearby ? 'pointer' : 'default'}
          >
            <div 
              className={`flex items-center justify-center rounded-full border-2 shadow-sm transition-all bg-white overflow-hidden ${isSelected ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ 
                width: sz, 
                height: sz, 
                borderColor: isSelected ? '#3B82F6' : color,
                color: isSelected ? '#3B82F6' : color,
                opacity: isNearby ? 1.0 : 0.8
              }}
            >
              <Bus size={sz * 0.65} />
            </div>
          </AdvancedMarker>
        );
      })}

      {/* Nearby stop circles (those not already shown as route arrows) */}
      {stops.filter((s) => !routeStopIds.has(s.id)).map((stop) => {
        const isSelected = stop.id === selectedId;
        const sz = isSelected ? 24 : 18;
        return (
          <AdvancedMarker
            key={stop.id}
            position={{ lat: stop.lat, lng: stop.lng }}
            title={stop.name}
            zIndex={isSelected ? 50 : 10}
            onClick={() => {
              onSelectStop(stop.id === selectedId ? null : stop.id);
              if (mapRef.current && mapRef.current.getZoom() < 17) mapRef.current.setZoom(17);
            }}
            cursor="pointer"
          >
            <div 
              className={`flex items-center justify-center rounded-full border-2 shadow-sm transition-all bg-white overflow-hidden ${isSelected ? 'scale-125 ring-2 ring-blue-500 ring-offset-1' : ''}`}
              style={{ 
                width: sz, 
                height: sz, 
                borderColor: isSelected ? '#3B82F6' : '#10B981',
                color: isSelected ? '#3B82F6' : '#10B981'
              }}
            >
              <Bus size={sz * 0.6} />
            </div>
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
            className="relative flex items-center justify-center z-[80] drop-shadow-md"
            style={{ width: 42, height: 28, cursor: 'pointer' }}
          >
            {/* Bus Skeleton Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 24 24" className="overflow-visible">
              <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
              </g>
              <g stroke={color || '#1D4ED8'} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>
              </g>
            </svg>

            {/* Line Number Badge */}
            {activeLine?.ref && (
              <div 
                className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white shadow-sm border border-white"
                style={{ backgroundColor: color || '#1D4ED8' }}
              >
                {activeLine.ref}
              </div>
            )}

            {/* Live Pulsating Indicator */}
            <div className="absolute top-0.5 left-0.5 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-red-500 opacity-40 animate-ping" />
            </div>

            {/* Direction Pointer */}
            <div 
              className="absolute inset-x-0 bottom-0 top-0 pointer-events-none"
              style={{ transform: `rotate(${bus.bearing ?? 0}deg)` }}
            >
              <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-gray-700 drop-shadow-sm" />
            </div>
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
          className="pointer-events-none absolute z-30 px-2.5 py-2 rounded-xl bg-gray-50/95 border border-gray-300 shadow-xl text-gray-900 text-xs leading-snug"
          style={{
            left:      flipX ? tooltip.x - 8  : tooltip.x + 12,
            top:       tooltip.y - 12,
            transform: flipX ? 'translateX(-100%)' : 'none',
            minWidth:  120,
          }}
        >
          {lineRef && <div className="font-bold text-sm mb-0.5" style={{ color }}>{lineRef}</div>}
          {lineTo  && <div className="text-gray-700 truncate max-w-[140px]">{lineTo}</div>}
          <div className="text-gray-600 mt-1">{dir} · {tooltip.bus.velocity ? `${Math.round(tooltip.bus.velocity)} km/h` : 'stopped'}</div>
          {secsAgo !== null && (
            <div className="text-gray-500 mt-0.5">{secsAgo < 60 ? `${secsAgo}s ago` : `${Math.round(secsAgo/60)}m ago`}</div>
          )}
        </div>
      );
    })()}
    </div>
  );
}
