import { useState, useEffect } from 'react';
import { Train, Loader } from 'lucide-react';
import { useTrainSchedule } from '../hooks/useTrainSchedule';
import StationPicker from '../components/trains/StationPicker';
import TrainRow from '../components/trains/TrainRow';
import TrainMap from '../components/trains/TrainMap';
import EmptyState from '../components/common/EmptyState';

export default function TrainsPage() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(null);
  const [stations, setStations] = useState([]);

  const { data: routes = [], isLoading, error, refetch } = useTrainSchedule(from?.code, to?.code);

  // Load station list for coordinate lookup in TrainMap
  useEffect(() => {
    fetch('/gtfs/israel-rail-stations.json').then((r) => r.json()).then(setStations).catch(() => {});
  }, []);

  // Reset selection when route list changes
  useEffect(() => { setSelectedIdx(null); }, [from?.code, to?.code]);

  const selectedRoute = selectedIdx !== null ? routes[selectedIdx] : null;
  const showMap = !!selectedRoute;

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-screen pb-16 lg:pb-0 overflow-hidden">

      {/* ── Top: picker + list ── */}
      <div
        className="flex flex-col min-h-0 overflow-hidden"
        style={{ flex: showMap ? 50 : 100, transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {/* Station pickers */}
        <div className="shrink-0 bg-gray-950 px-4 pt-4 pb-3 space-y-3 border-b border-gray-800">
          <h1 className="text-white font-bold text-base">Train Schedule</h1>
          <div className="bg-gray-800 rounded-xl p-3 space-y-3">
            <StationPicker label="From" value={from} onChange={setFrom} />
            <div className="border-t border-gray-700" />
            <StationPicker label="To" value={to} onChange={setTo} />
          </div>
        </div>

        {/* Departure list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
              <Loader size={18} className="animate-spin" />
              <span className="text-sm">Loading trains…</span>
            </div>
          )}

          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-red-400 text-sm">{error.message}</p>
              <button onClick={() => refetch()} className="mt-2 text-blue-400 text-xs hover:underline">Retry</button>
            </div>
          )}

          {!isLoading && !error && from && to && routes.length === 0 && (
            <EmptyState icon={Train} title="No trains found" description="Try a different station or time" />
          )}

          {routes.length > 0 && (
            <>
              {/* Table header */}
              <div className="grid grid-cols-4 px-4 py-2 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-950 z-10">
                <span>Departs</span>
                <span>Arrives</span>
                <span>Platform</span>
                <span>Status</span>
              </div>
              {routes.map((route, i) => (
                <TrainRow
                  key={i}
                  route={route}
                  selected={selectedIdx === i}
                  onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Bottom: map (only when a train is selected) ── */}
      {showMap && (
        <div
          className="shrink-0 min-h-0 border-t-2 border-purple-900/60 rounded-t-xl overflow-hidden"
          style={{ flex: 50, transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)' }}
        >
          <TrainMap route={selectedRoute} stations={stations} />
        </div>
      )}
    </div>
  );
}
