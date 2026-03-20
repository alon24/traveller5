import { useQuery } from '@tanstack/react-query';
import { searchGtfsRoutes } from '../services/api/gtfsRoutes';

export function useLineSearch(lineRef, city) {
  return useQuery({
    queryKey: ['line-search-gtfs', lineRef?.trim(), city?.trim()],
    queryFn: ({ signal }) => searchGtfsRoutes(lineRef.trim(), city?.trim() || '', signal),
    enabled: !!(lineRef?.trim()),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
}
