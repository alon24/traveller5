import { useQuery } from '@tanstack/react-query';
import { getTransitDirections } from '../services/api/googleMaps';
import { useTripStore } from '../stores/useTripStore';
import { DIRECTIONS_STALE_TIME } from '../config/constants';

export function useDirections() {
  const { origin, destination, departureTime, setRoutes, setLoading } = useTripStore();

  const query = useQuery({
    queryKey: ['directions', origin?.placeId, destination?.placeId, departureTime?.toISOString()],
    queryFn: async () => {
      setLoading(true);
      const routes = await getTransitDirections(origin.coords, destination.coords, departureTime);
      setRoutes(routes);
      return routes;
    },
    enabled: !!origin?.coords && !!destination?.coords,
    staleTime: DIRECTIONS_STALE_TIME,
  });

  return query;
}
