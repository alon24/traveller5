import { useState, useEffect } from 'react';
import { Train } from 'lucide-react';

export default function StationPicker({ label, value, onChange }) {
  const [stations, setStations] = useState([]);
  const [search, setSearch] = useState(value?.name || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/gtfs/israel-rail-stations.json')
      .then((r) => r.json())
      .then(setStations)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (value?.name) setSearch(value.name);
  }, [value?.name]);

  const filtered = stations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Train size={16} className="text-gray-500 shrink-0" />
        <input
          type="text"
          placeholder={`${label} station…`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
        />
      </div>
      {open && filtered.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-50 shadow-xl max-h-48 overflow-y-auto">
          {filtered.map((s) => (
            <li key={s.code}>
              <button
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                onClick={() => { onChange(s); setSearch(s.name); setOpen(false); }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
