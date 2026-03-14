import { create } from 'zustand';

export const useTripStore = create((set) => ({
  origin: null,       // { placeId, label, coords }
  destination: null,
  routes: [],
  selectedRouteIndex: 0,
  departureTime: new Date(),
  loading: false,

  setOrigin: (origin) => set({ origin }),
  setDestination: (destination) => set({ destination }),
  setRoutes: (routes) => set({ routes, selectedRouteIndex: 0, loading: false }),
  selectRoute: (index) => set({ selectedRouteIndex: index }),
  setDepartureTime: (departureTime) => set({ departureTime }),
  setLoading: (loading) => set({ loading }),
  clearTrip: () => set({ routes: [], selectedRouteIndex: 0 }),
}));
