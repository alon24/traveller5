import { useQuery } from '@tanstack/react-query';
import { motApi } from '../services/api/axiosInstance';
import { decodeVehiclePositions, decodeTripUpdates } from '../services/gtfs/gtfsRtDecoder';
import { GTFS_RT_POLL_INTERVAL } from '../config/constants';
import { getSiriLineRef, fetchSiriVehicleLocations } from '../services/api/stride';

// Paths relative to /proxy/mot base
const VEHICLE_PATH = '/gtfsrealtime/VehiclePosition';
const TRIP_PATH = '/gtfsrealtime/TripUpdate';

async function fetchRtFeed(path, decoder) {
  const { data } = await motApi.get(path, {
    responseType: 'arraybuffer',
    timeout: 10000,
  });
  return decoder(data);
}

// Shared options: no retries, stop polling after repeated failures
const RT_QUERY_OPTS = {
  retry: false,
  refetchInterval: (query) =>
    query.state.fetchFailureCount >= 2 ? false : GTFS_RT_POLL_INTERVAL,
  staleTime: GTFS_RT_POLL_INTERVAL,
  throwOnError: false,
};

export function useVehiclePositions({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['gtfs-rt-vehicles'],
    queryFn: () => fetchRtFeed(VEHICLE_PATH, decodeVehiclePositions),
    ...RT_QUERY_OPTS,
    enabled,
  });
}

/**
 * Polls SIRI vehicle locations via Stride — no API key needed.
 * Only active when relId is set (selected line).
 * Poll interval: 30 s (Stride ingests SIRI data every ~1 min).
 */
export function useSiriVehiclePositions(relId) {
  return useQuery({
    queryKey: ['siri-vehicles', relId],
    queryFn: async () => {
      const lineRef = await getSiriLineRef(relId);
      if (!lineRef) return [];
      return fetchSiriVehicleLocations(lineRef);
    },
    enabled: !!relId,
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: false,
    throwOnError: false,
  });
}

export function useTripUpdates() {
  return useQuery({
    queryKey: ['gtfs-rt-trips'],
    queryFn: () => fetchRtFeed(TRIP_PATH, decodeTripUpdates),
    ...RT_QUERY_OPTS,
  });
}
