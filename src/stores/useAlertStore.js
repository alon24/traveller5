import { create } from 'zustand';

const STORAGE_KEY = 'transit-alerts';

function loadAlerts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveAlerts(alerts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export const useAlertStore = create((set, get) => ({
  alerts: loadAlerts(),
  permission: Notification.permission,

  addAlert: (alert) => {
    const alerts = [...get().alerts, { ...alert, id: Date.now().toString(), fired: false }];
    saveAlerts(alerts);
    set({ alerts });
  },

  removeAlert: (id) => {
    const alerts = get().alerts.filter((a) => a.id !== id);
    saveAlerts(alerts);
    set({ alerts });
  },

  markFired: (id) => {
    const alerts = get().alerts.map((a) => a.id === id ? { ...a, fired: true } : a);
    saveAlerts(alerts);
    set({ alerts });
  },

  requestPermission: async () => {
    const permission = await Notification.requestPermission();
    set({ permission });
    return permission;
  },
}));
