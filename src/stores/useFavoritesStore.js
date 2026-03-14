import { create } from 'zustand';

const STORAGE_KEY = 'transitil_favorites';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function save(list) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

export const useFavoritesStore = create((set, get) => ({
  favorites: load(),

  isFavorite: (stopId, routeRef, routeRelId) =>
    get().favorites.some(
      (f) => f.stopId === stopId && f.routeRef === routeRef && f.routeRelId === routeRelId
    ),

  toggle: (entry) => {
    const { favorites } = get();
    const exists = favorites.some(
      (f) => f.stopId === entry.stopId && f.routeRef === entry.routeRef && f.routeRelId === entry.routeRelId
    );
    const next = exists
      ? favorites.filter(
          (f) => !(f.stopId === entry.stopId && f.routeRef === entry.routeRef && f.routeRelId === entry.routeRelId)
        )
      : [{ id: `${entry.stopId}-${entry.routeRef}-${entry.routeRelId}`, ...entry }, ...favorites];
    save(next);
    set({ favorites: next });
  },
}));
