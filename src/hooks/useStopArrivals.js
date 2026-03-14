import { useQuery } from '@tanstack/react-query';

async function fetchArrivals(stopCode) {
  const res = await fetch(`/proxy/curlbus/${stopCode}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Curlbus ${res.status}`);
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors[0]);

  const visits = data.visits?.[String(stopCode)] || [];
  const now = new Date();

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
    queryFn: () => fetchArrivals(stopCode),
    enabled: !!stopCode,
    refetchInterval: 30000,
    staleTime: 20000,
    retry: 1,
  });
}
