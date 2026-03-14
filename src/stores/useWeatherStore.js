import { create } from 'zustand';

export const useWeatherStore = create((set) => ({
  current: null,
  hourly: [],
  hasAlert: false,
  alertMessage: null,
  lastFetched: null,

  setWeather: ({ current, hourly }) => {
    const alert = detectAlert(hourly);
    set({
      current,
      hourly,
      hasAlert: !!alert,
      alertMessage: alert,
      lastFetched: Date.now(),
    });
  },

  clearAlert: () => set({ hasAlert: false, alertMessage: null }),
}));

function detectAlert(hourly) {
  if (!hourly?.length) return null;
  const next6h = hourly.slice(0, 2); // 3h intervals × 2 = 6h
  for (const h of next6h) {
    const id = h.weather?.[0]?.id;
    if (id >= 200 && id < 700) return `Weather alert: ${h.weather[0].description} expected`;
    if (h.main?.temp > 38) return 'Extreme heat expected (38°C+)';
    if (h.main?.temp < 5) return 'Very cold conditions expected';
  }
  return null;
}
