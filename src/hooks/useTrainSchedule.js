import { useQuery } from '@tanstack/react-query';
import { getTrainDepartures } from '../services/api/israelRail';

export function useTrainSchedule(fromStation, toStation, date = new Date()) {
  return useQuery({
    queryKey: ['train-schedule', fromStation, toStation, date.toDateString()],
    queryFn: () => getTrainDepartures(fromStation, toStation, date),
    enabled: !!fromStation && !!toStation,
    staleTime: 5 * 60 * 1000,
  });
}
