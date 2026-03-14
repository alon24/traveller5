export const ISRAEL_CENTER = { lat: 31.7683, lng: 35.2137 };
export const DEFAULT_ZOOM = 13;
export const NEARBY_RADIUS_METERS = 500;
export const GTFS_RT_POLL_INTERVAL = 15000; // 15 seconds
export const WEATHER_STALE_TIME = 30 * 60 * 1000; // 30 minutes
export const DIRECTIONS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

export const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL || '/proxy';

export const URLS = {
  gtfsStatic: import.meta.env.VITE_GTFS_STATIC_URL || `${PROXY_BASE}/mot/gtfs/israel-public-transportation.zip`,
  gtfsRtVehicle: import.meta.env.VITE_GTFS_RT_VEHICLE_URL || `${PROXY_BASE}/mot/gtfsrealtime/VehiclePosition`,
  gtfsRtTrip: import.meta.env.VITE_GTFS_RT_TRIP_URL || `${PROXY_BASE}/mot/gtfsrealtime/TripUpdate`,
  gtfsRtAlert: import.meta.env.VITE_GTFS_RT_ALERT_URL || `${PROXY_BASE}/mot/gtfsrealtime/ServiceAlert`,
  rail: `${PROXY_BASE}/rail`,
};

export const TRANSIT_COLORS = {
  egged: '#E8521A',
  dan: '#0050A0',
  rail: '#6B2D8B',
  metropoline: '#007A3D',
  kavim: '#E91E8C',
};
