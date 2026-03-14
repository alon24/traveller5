import { useQuery } from '@tanstack/react-query';
import { motApi } from '../services/api/axiosInstance';
import { decodeVehiclePositions, decodeTripUpdates } from '../services/gtfs/gtfsRtDecoder';
import { GTFS_RT_POLL_INTERVAL } from '../config/constants';

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

export function useVehiclePositions() {
  return useQuery({
    queryKey: ['gtfs-rt-vehicles'],
    queryFn: () => fetchRtFeed(VEHICLE_PATH, decodeVehiclePositions),
    ...RT_QUERY_OPTS,
  });
}

export function useTripUpdates() {
  return useQuery({
    queryKey: ['gtfs-rt-trips'],
    queryFn: () => fetchRtFeed(TRIP_PATH, decodeTripUpdates),
    ...RT_QUERY_OPTS,
  });
}
