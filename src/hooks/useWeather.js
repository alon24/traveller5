import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getCurrentWeather, getHourlyForecast } from '../services/api/weather';
import { useWeatherStore } from '../stores/useWeatherStore';
import { WEATHER_STALE_TIME } from '../config/constants';

export function useWeather(lat, lng) {
  const setWeather = useWeatherStore((s) => s.setWeather);

  const query = useQuery({
    queryKey: ['weather', lat, lng],
    queryFn: async () => {
      const [current, hourly] = await Promise.all([
        getCurrentWeather(lat, lng),
        getHourlyForecast(lat, lng),
      ]);
      return { current, hourly };
    },
    enabled: !!lat && !!lng,
    staleTime: WEATHER_STALE_TIME,
  });

  useEffect(() => {
    if (query.data) setWeather(query.data);
  }, [query.data]);

  return query;
}
