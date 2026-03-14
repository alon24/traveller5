import { Star, Trash2, MapPin } from 'lucide-react';
import { useFavoritesStore } from '../stores/useFavoritesStore';

function groupByStop(favorites) {
  const map = new Map();
  for (const fav of favorites) {
    if (!map.has(fav.stopId)) map.set(fav.stopId, { stopId: fav.stopId, stopName: fav.stopName, lines: [] });
    map.get(fav.stopId).lines.push(fav);
  }
  return Array.from(map.values());
}

export default function FavoritesPage() {
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggle = useFavoritesStore((s) => s.toggle);
  const groups = groupByStop(favorites);

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-screen pb-16 lg:pb-0 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-gray-950 px-4 pt-4 pb-3 border-b border-gray-800">
        <h1 className="text-white font-bold text-base flex items-center gap-2">
          <Star size={16} className="text-yellow-400" fill="currentColor" />
          Favorites
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {favorites.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
            <Star size={36} className="opacity-30" />
            <p className="text-sm">No favorites yet</p>
            <p className="text-xs text-center px-8">
              Tap the ★ next to a line badge in Nearby Stops to save it here.
            </p>
          </div>
        )}

        {groups.map((group) => (
          <div key={group.stopId} className="border-b border-gray-800">
            {/* Stop header */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-900">
              <MapPin size={13} className="text-gray-500 shrink-0" />
              <span className="text-sm font-medium text-white truncate">{group.stopName}</span>
            </div>

            {/* Lines at this stop */}
            {group.lines.map((fav) => (
              <div
                key={fav.id}
                className="flex items-center gap-3 px-4 py-3 border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
              >
                {/* Badge */}
                <span
                  className="shrink-0 px-2 py-1 rounded text-xs font-bold font-mono text-white"
                  style={{ backgroundColor: fav.routeColour || '#1e3a5f' }}
                >
                  {fav.routeRef}
                </span>

                {/* Direction */}
                <div className="flex-1 min-w-0">
                  {fav.routeTo ? (
                    <span className="text-xs text-gray-400 truncate block">→ {fav.routeTo}</span>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                </div>

                {/* Remove */}
                <button
                  onClick={() => toggle(fav)}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Remove from favorites"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
