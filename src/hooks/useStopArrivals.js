import { useQuery } from '@tanstack/react-query';
import { getScheduledArrivals } from '../services/api/stride';

async function fetchArrivals(stopCode, signal) {
  const res = await fetch(`/proxy/curlbus/${stopCode}`, {
    headers: { Accept: 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`Curlbus ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors[0].trim());
  }

  let visits = data.visits?.[String(stopCode)] || [];
  const now = new Date();

  // If no real-time arrivals and it's late (>= 9:00 PM), fallback to tomorrow's schedule
  if (visits.length === 0 && now.getHours() >= 21) {
    try {
      const scheduled = await getScheduledArrivals(stopCode, signal);
      if (scheduled.length > 0) return scheduled.map(s => ({
        ...s,
        etaMinutes: Math.round((new Date(s.eta) - now) / 60000),
      }));
    } catch {}
  }

  return visits
    .map((v) => ({
      lineRef: v.line_name,
      destination: v.static_info?.route?.destination?.name?.HE
        || v.static_info?.route?.destination?.name?.EN
        || '',
      operator: v.static_info?.route?.agency?.name?.EN || '',
      eta: v.eta,
      etaMinutes: Math.round((new Date(v.eta) - now) / 60000),
    }))
    .filter((v) => v.etaMinutes >= 0)
    .sort((a, b) => a.etaMinutes - b.etaMinutes);
}

export function useStopArrivals(stopCode) {
  return useQuery({
    queryKey: ['stop-arrivals', stopCode],
    queryFn: ({ signal }) => fetchArrivals(stopCode, signal),
    enabled: !!stopCode,
    refetchInterval: 30000,
    staleTime: 20000,
    retry: 1,
  });
}
