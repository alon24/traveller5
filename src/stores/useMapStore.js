import { create } from 'zustand';
import { ISRAEL_CENTER, DEFAULT_ZOOM } from '../config/constants';

export const useMapStore = create((set) => ({
  center: ISRAEL_CENTER,
  zoom: DEFAULT_ZOOM,
  selectedStopId: null,
  selectedVehicleId: null,
  showBusMarkers: true,
  showStopMarkers: true,

  setCenter: (center) => set({ center }),
  setZoom: (zoom) => set({ zoom }),
  selectStop: (stopId) => set({ selectedStopId: stopId, selectedVehicleId: null }),
  selectVehicle: (vehicleId) => set({ selectedVehicleId: vehicleId, selectedStopId: null }),
  clearSelection: () => set({ selectedStopId: null, selectedVehicleId: null }),
  toggleBusMarkers: () => set((s) => ({ showBusMarkers: !s.showBusMarkers })),
  toggleStopMarkers: () => set((s) => ({ showStopMarkers: !s.showStopMarkers })),
}));
