import { create } from 'zustand';

const FALLBACK_KEY = 'transitil_fallback_location';
const DEFAULT_FALLBACK = { lat: 31.8942, lng: 34.8120, name: 'Rehovot, Israel' };

function loadFallback() {
  try {
    const stored = localStorage.getItem(FALLBACK_KEY);
    return stored ? JSON.parse(stored) : DEFAULT_FALLBACK;
  } catch {
    return DEFAULT_FALLBACK;
  }
}

export const useLocationStore = create((set, get) => {
  const fallbackLocation = loadFallback();
  return {
    coords: fallbackLocation,       // start immediately with fallback
    accuracy: null,
    watching: false,
    error: null,
    watchId: null,
    usingFallback: true,
    fallbackLocation,
    isManual: false,
    manualLabel: null,

    setFallbackLocation: (loc) => {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(loc));
      const { usingFallback, isManual } = get();
      set({
        fallbackLocation: loc,
        ...((usingFallback && !isManual) ? { coords: loc } : {}),
      });
    },

    setManualLocation: (cols) => {
      const { stopWatch } = get();
      stopWatch();
      set({
        coords: cols.coords,
        manualLabel: cols.label,
        isManual: true,
        usingFallback: false,
      });
    },

    resetToGPS: () => {
      set({ isManual: false });
      const { startWatch } = get();
      startWatch();
    },

    startWatch: () => {
      if (!navigator.geolocation) {
        set({ error: 'Geolocation not supported' });
        return;
      }
      const watchId = navigator.geolocation.watchPosition(
        (pos) => set({
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          error: null,
          watching: true,
          usingFallback: false,
        }),
        (err) => {
          const { fallbackLocation } = get();
          set({ error: err.message, coords: fallbackLocation, usingFallback: true });
        },
        { enableHighAccuracy: true, maximumAge: 10000 }
      );
      set({ watchId, watching: true });
    },

    stopWatch: () => {
      const { watchId } = useLocationStore.getState();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      set({ watching: false, watchId: null });
    },

    setError: (error) => set({ error }),
  };
});
