import { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, RefreshCw, X, Star, Train, Loader, Trash2, Search, Clock } from 'lucide-react';
import { useLocationStore } from '../stores/useLocationStore';
import { useNearbyStops } from '../hooks/useNearbyStops';
import { useRouteStops } from '../hooks/useRouteStops';
import { useRouteShape } from '../hooks/useRouteShape';
import { useVehiclePositions } from '../hooks/useGtfsRealtime';
import { useTrainSchedule } from '../hooks/useTrainSchedule';
import { useLineSearch } from '../hooks/useLineSearch';
import { useFavoritesStore } from '../stores/useFavoritesStore';
import { useStopArrivals } from '../hooks/useStopArrivals';
import LoadingSpinner from '../components/common/LoadingSpinner';
import NearbyMap from '../components/nearby/NearbyMap';
import TrainMap from '../components/trains/TrainMap';
import TrainRow from '../components/trains/TrainRow';
import StationPicker from '../components/trains/StationPicker';
import EmptyState from '../components/common/EmptyState';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEARBY_FLEX = { default: [55, 45], list: [80, 20], map: [28, 72] };

// ── Route badge with star ───────────────────────────────────────
function RouteBadge({ route, stopId, stopName, active, onClick }) {
  const bg = route.colour || '#1e3a5f';
  const isFav = useFavoritesStore((s) => s.isFavorite(stopId, route.ref, route.relId));
  const toggle = useFavoritesStore((s) => s.toggle);

  const handleStar = (e) => {
    e.stopPropagation();
    toggle({ stopId, stopName, routeRef: route.ref, routeRelId: route.relId, routeColour: route.colour, routeTo: route.to });
  };

  return (
    <span className="shrink-0 flex items-center rounded overflow-hidden">
      <button
        onMouseDown={(e) => { e.stopPropagation(); onClick(route); }}
        className={`px-1.5 py-0.5 text-xs font-bold font-mono transition-all ${active ? 'ring-2 ring-inset ring-white scale-110' : 'opacity-90 hover:opacity-100'}`}
        style={{ backgroundColor: bg, color: '#fff' }}
        title={route.to ? `→ ${route.to}` : route.ref}
      >
        {route.ref}
      </button>
      <button
        onMouseDown={handleStar}
        className="px-1 py-0.5 transition-colors"
        style={{ backgroundColor: bg, opacity: isFav ? 1 : 0.5 }}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={9} fill={isFav ? '#fff' : 'none'} color="#fff" />
      </button>
    </span>
  );
}

// ── Live arrivals panel ──────────────────────────────────────────
function ArrivalsPanel({ stopCode }) {
  const { data: arrivals = [], isLoading, error, dataUpdatedAt } = useStopArrivals(stopCode);

  if (isLoading) return (
    <div className="flex items-center gap-1.5 px-1 py-2 text-gray-500">
      <Loader size={11} className="animate-spin" />
      <span className="text-[10px]">Loading arrivals…</span>
    </div>
  );

  if (error) return (
    <p className="text-[10px] text-gray-600 px-1 py-1.5">No live data for this stop</p>
  );

  if (arrivals.length === 0) return (
    <p className="text-[10px] text-gray-600 px-1 py-1.5">No buses in the next 30 min</p>
  );

  const updated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="mt-1.5 mb-0.5">
      <div className="flex items-center gap-1 mb-1">
        <Clock size={9} className="text-gray-600" />
        <span className="text-[9px] text-gray-600 uppercase tracking-wider">Live arrivals{updated ? ` · ${updated}` : ''}</span>
      </div>
      <div className="space-y-0.5">
        {arrivals.slice(0, 5).map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="shrink-0 w-7 text-center text-[10px] font-bold font-mono text-white bg-gray-700 rounded px-1 py-0.5">
              {a.lineRef}
            </span>
            <span className="flex-1 text-[10px] text-gray-400 truncate" dir="auto">{a.destination}</span>
            <span className={`shrink-0 text-[10px] font-medium tabular-nums ${a.etaMinutes <= 2 ? 'text-red-400' : a.etaMinutes <= 5 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {a.etaMinutes === 0 ? 'Now' : `${a.etaMinutes}m`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stop row ─────────────────────────────────────────────────────
function StopRow({ stop, selected, onClick, selectedLine, onLineClick, rowRef }) {
  return (
    <div
      ref={rowRef}
      onClick={onClick}
      className={`px-3 py-1.5 border-b border-gray-800/50 cursor-pointer transition-colors ${selected ? 'bg-blue-950/40 border-l-2 border-l-blue-500 pl-2.5' : 'hover:bg-gray-800/30'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="text-xs font-medium text-white truncate">{stop.name}</span>
          {stop.ref && <span className="text-[10px] text-gray-500 shrink-0">#{stop.ref}</span>}
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">{stop.distance}m</span>
      </div>
      {stop.routes.length > 0 ? (
        <div className="flex gap-1 mt-1 overflow-x-auto pb-0.5 no-scrollbar">
          {stop.routes.map((r) => (
            <RouteBadge
              key={r.ref}
              route={r}
              stopId={stop.id}
              stopName={stop.name}
              active={selectedLine?.ref === r.ref && selectedLine?.stopId === stop.id}
              onClick={(route) => onLineClick(route, stop.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-700 mt-0.5">No line data</p>
      )}
      {selected && stop.ref && <ArrivalsPanel stopCode={stop.ref} />}
    </div>
  );
}

// ── Favorites content ─────────────────────────────────────────────
function FavoritesContent({ selectedFavId, onSelect }) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggle = useFavoritesStore((s) => s.toggle);

  const groups = useMemo(() => {
    const map = new Map();
    for (const fav of favorites) {
      const key = fav.stopId || '__lines__';
      if (!map.has(key)) map.set(key, { stopId: fav.stopId, stopName: fav.stopName, lines: [] });
      map.get(key).lines.push(fav);
    }
    return Array.from(map.values());
  }, [favorites]);

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-600 py-12">
        <Star size={28} className="opacity-30" />
        <p className="text-xs">No favorites yet</p>
        <p className="text-[10px] text-center px-8 opacity-70">Tap ★ on a line badge in Nearby or Lines tabs</p>
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.stopId ?? '__lines__'} className="border-b border-gray-800">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-900">
            <MapPin size={11} className="text-gray-500 shrink-0" />
            <span className="text-xs font-medium text-white truncate">
              {group.stopName || 'Lines'}
            </span>
          </div>
          {group.lines.map((fav) => {
            const active = selectedFavId === fav.id;
            return (
              <button
                key={fav.id}
                onClick={() => onSelect(active ? null : fav)}
                className={`w-full flex items-center gap-2 px-3 py-2 border-t border-gray-800/50 transition-colors text-left ${
                  active ? 'bg-blue-950/40 border-l-2 border-l-blue-500 pl-2.5' : 'hover:bg-gray-800/30'
                }`}
              >
                <span
                  className="shrink-0 px-2 py-0.5 rounded text-xs font-bold font-mono text-white"
                  style={{ backgroundColor: fav.routeColour || '#1e3a5f' }}
                >
                  {fav.routeRef}
                </span>
                <span className="flex-1 text-xs text-gray-400 truncate">
                  {fav.routeTo ? `→ ${fav.routeTo}` : '—'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); toggle(fav); }}
                  className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ── Line search result row (needs hook for fav state) ────────────
function LineResult({ line, active, loading, onSelect }) {
  const isFav = useFavoritesStore((s) => s.isFavorite(null, line.ref, line.relId));
  const toggle = useFavoritesStore((s) => s.toggle);
  const favEntry = {
    id: `null-${line.ref}-${line.relId}`,
    stopId: null, stopName: null,
    routeRef: line.ref, routeRelId: line.relId,
    routeColour: line.colour, routeTo: line.to,
  };
  return (
    <div className={`flex items-center border-b border-gray-800/50 transition-colors ${active ? 'bg-blue-950/40 border-l-2 border-l-blue-500' : 'hover:bg-gray-800/30'}`}>
      <button onClick={onSelect} className="flex-1 flex items-center gap-3 px-3 py-2.5 text-left">
        <span
          className="shrink-0 px-2 py-1 rounded text-xs font-bold font-mono text-white min-w-[2.5rem] text-center"
          style={{ backgroundColor: line.colour || '#1e3a5f' }}
        >
          {line.ref}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white truncate">
            {line.from && line.to ? `${line.from} → ${line.to}` : line.to || line.from || 'Unknown route'}
          </p>
          {line.operator && <p className="text-[10px] text-gray-500 truncate">{line.operator}</p>}
        </div>
        {loading && <Loader size={13} className="animate-spin text-blue-400 shrink-0" />}
      </button>
      <button
        onClick={() => toggle(favEntry)}
        className="px-3 py-2.5 transition-colors shrink-0"
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={14} fill={isFav ? 'currentColor' : 'none'} className={isFav ? 'text-yellow-400' : 'text-gray-500'} />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
const TABS = [
  { id: 'nearby', label: 'Nearby', icon: MapPin },
  { id: 'lines', label: 'Lines', icon: Search },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'trains', label: 'Trains', icon: Train },
];

export default function NearbyPage() {
  const [tab, setTab] = useState('nearby');

  // Location
  const coords = useLocationStore((s) => s.coords);
  const usingFallback = useLocationStore((s) => s.usingFallback);
  const fallbackLocation = useLocationStore((s) => s.fallbackLocation);

  // ── Nearby tab state ──
  const [selectedId, setSelectedId] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);
  const [mode, setMode] = useState('default');
  const listRef = useRef(null);
  const rowRefs = useRef({});

  const { data: stops = [], isLoading: stopsLoading, error: stopsError, refetch } = useNearbyStops(coords?.lat, coords?.lng);
  const { data: routeStops = [], isFetching: routeLoading } = useRouteStops(selectedLine?.relId);
  const nearbyRouteShape = useRouteShape(selectedLine?.relId);
  const { data: allVehicles = [] } = useVehiclePositions();

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current[selectedId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const handleSelectStop = (id) => {
    setSelectedId((prev) => (prev === id ? null : id));
    if (mode === 'list') setMode('default');
  };

  const handleLineClick = (route, stopId) => {
    if (selectedLine?.ref === route.ref && selectedLine?.stopId === stopId) {
      setSelectedLine(null);
      setMode('default');
    } else {
      setSelectedLine({ ref: route.ref, relId: route.relId, colour: route.colour, stopId });
      setMode('map');
    }
  };

  const clearLine = (e) => {
    e.stopPropagation();
    setSelectedLine(null);
    setMode('default');
  };

  const handleHeaderClick = () => {
    setMode((prev) => (prev === 'list' ? 'default' : 'list'));
    if (mode !== 'list') setSelectedLine(null);
  };

  // ── Lines search tab state ──
  const [lineRef, setLineRef] = useState('');
  const [lineCity, setLineCity] = useState('');
  const [lineSearchInput, setLineSearchInput] = useState('');
  const [lineCityInput, setLineCityInput] = useState('');
  const [selectedSearchLine, setSelectedSearchLine] = useState(null);

  const { data: lineResults = [], isFetching: linesLoading, error: linesError } =
    useLineSearch(lineRef, lineCity);
  const { data: searchRouteStops = [], isFetching: searchRouteLoading } =
    useRouteStops(selectedSearchLine?.relId);
  const searchRouteShape = useRouteShape(selectedSearchLine?.relId);

  const handleLineSearch = (e) => {
    e.preventDefault();
    setLineRef(lineSearchInput);
    setLineCity(lineCityInput);
    setSelectedSearchLine(null);
  };

  // ── Favorites tab state ──
  const [selectedFav, setSelectedFav] = useState(null);
  const { data: favRouteStops = [], isFetching: favRouteLoading } =
    useRouteStops(selectedFav?.routeRelId);
  const favRouteShape = useRouteShape(selectedFav?.routeRelId);

  // Whichever tab is active, pick the right route stops for bus filtering
  const activeRouteStops = tab === 'favorites' ? favRouteStops
    : tab === 'lines' ? searchRouteStops
    : routeStops;

  const busPositions = useMemo(() => {
    if (!allVehicles.length) return [];
    if (activeRouteStops.length) {
      return allVehicles.filter((v) => activeRouteStops.some((s) => haversine(v.lat, v.lng, s.lat, s.lng) <= 400));
    }
    if (!coords) return [];
    return allVehicles.filter((v) => haversine(v.lat, v.lng, coords.lat, coords.lng) <= 1000);
  }, [allVehicles, activeRouteStops, coords]);

  // ── Trains tab state ──
  const [trainFrom, setTrainFrom] = useState(null);
  const [trainTo, setTrainTo] = useState(null);
  const [selectedTrainIdx, setSelectedTrainIdx] = useState(null);
  const [stations, setStations] = useState([]);

  useEffect(() => {
    fetch('/gtfs/israel-rail-stations.json').then((r) => r.json()).then(setStations).catch(() => {});
  }, []);
  useEffect(() => { setSelectedTrainIdx(null); }, [trainFrom?.code, trainTo?.code]);

  const { data: trainRoutes = [], isLoading: trainsLoading, error: trainsError, refetch: refetchTrains } =
    useTrainSchedule(trainFrom?.code, trainTo?.code);

  const selectedTrain = selectedTrainIdx !== null ? trainRoutes[selectedTrainIdx] : null;

  // ── Tab switching ──
  const handleTabChange = (id) => {
    setTab(id);
    if (id !== 'nearby') { setSelectedLine(null); setMode('default'); }
    if (id !== 'trains') setSelectedTrainIdx(null);
    if (id !== 'lines') setSelectedSearchLine(null);
    if (id !== 'favorites') setSelectedFav(null);
  };

  // ── Flex layout ──
  const [topFlex, bottomFlex] = tab === 'nearby'
    ? NEARBY_FLEX[mode]
    : (tab === 'trains' && selectedTrain) ||
      (tab === 'lines' && selectedSearchLine) ||
      (tab === 'favorites' && selectedFav)
      ? [45, 55]
      : [55, 45];

  const showTrainMap = tab === 'trains' && !!selectedTrain;
  const showSearchRouteOnMap = tab === 'lines' && !!selectedSearchLine;
  const showFavRouteOnMap = tab === 'favorites' && !!selectedFav;

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-screen pb-16 lg:pb-0 overflow-hidden">

      {/* ── Top area ── */}
      <div
        className="flex flex-col min-h-0 overflow-hidden"
        style={{ flex: topFlex, transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {/* Tab bar */}
        <div className="shrink-0 bg-gray-950 border-b border-gray-800">
          <div className="flex">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors flex-1 justify-center ${
                  tab === id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {/* ── Nearby Stops tab ── */}
          {tab === 'nearby' && (
            <>
              {/* Sub-header */}
              <div
                onClick={handleHeaderClick}
                className="shrink-0 cursor-pointer bg-gray-950 px-3 py-1.5 flex items-center justify-between border-b border-gray-800 select-none sticky top-0 z-10"
              >
                <div className="flex items-center gap-2">
                  {usingFallback && (
                    <span className="text-yellow-400 text-[10px]">{fallbackLocation.name}</span>
                  )}
                  {selectedLine && (
                    <span
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono text-white"
                      style={{ backgroundColor: selectedLine.colour || '#1e3a5f' }}
                    >
                      Line {selectedLine.ref}
                      {routeLoading && <span className="opacity-60">…</span>}
                      <button onClick={clearLine} className="opacity-70 hover:opacity-100 ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); refetch(); }}
                  disabled={stopsLoading}
                  className="text-gray-500 hover:text-white disabled:opacity-30 transition-colors"
                >
                  <RefreshCw size={12} className={stopsLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {stopsLoading && <LoadingSpinner className="py-8" />}
              {stopsError && (
                <div className="px-4 py-4 text-center">
                  <p className="text-red-400 text-xs">{stopsError.message}</p>
                  <button onClick={() => refetch()} className="mt-2 text-blue-400 text-xs hover:underline">Retry</button>
                </div>
              )}
              {!stopsLoading && !stopsError && stops.length === 0 && (
                <div className="flex flex-col items-center py-10 text-gray-600">
                  <MapPin size={22} className="mb-2 opacity-40" />
                  <p className="text-xs">No stops found nearby</p>
                </div>
              )}
              <div ref={listRef}>
                {stops.map((stop) => (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    selected={stop.id === selectedId}
                    selectedLine={selectedLine}
                    rowRef={(el) => { rowRefs.current[stop.id] = el; }}
                    onClick={() => handleSelectStop(stop.id === selectedId ? null : stop.id)}
                    onLineClick={handleLineClick}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Lines search tab ── */}
          {tab === 'lines' && (
            <>
              {/* Search form */}
              <form onSubmit={handleLineSearch} className="px-3 pt-2.5 pb-2 border-b border-gray-800 sticky top-0 z-10 bg-gray-950 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Search size={13} className="text-gray-500 shrink-0" />
                    <input
                      type="text"
                      value={lineSearchInput}
                      onChange={(e) => setLineSearchInput(e.target.value)}
                      placeholder="Line number (e.g. 16)"
                      className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
                    />
                  </div>
                  <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2">
                    <MapPin size={13} className="text-gray-500 shrink-0" />
                    <input
                      type="text"
                      value={lineCityInput}
                      onChange={(e) => setLineCityInput(e.target.value)}
                      placeholder="City (optional)"
                      className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 rounded-lg transition-colors"
                  >
                    Go
                  </button>
                </div>
              </form>

              {/* Results */}
              {linesLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                  <Loader size={16} className="animate-spin" />
                  <span className="text-xs">Searching…</span>
                </div>
              )}
              {linesError && (
                <div className="px-4 py-4 text-center">
                  <p className="text-red-400 text-xs">{linesError.message}</p>
                </div>
              )}
              {!linesLoading && lineRef && lineResults.length === 0 && !linesError && (
                <div className="flex flex-col items-center py-10 text-gray-600">
                  <Search size={22} className="mb-2 opacity-40" />
                  <p className="text-xs">No lines found</p>
                </div>
              )}
              {lineResults.map((line) => (
                <LineResult
                  key={line.relId}
                  line={line}
                  active={selectedSearchLine?.relId === line.relId}
                  loading={selectedSearchLine?.relId === line.relId && searchRouteLoading}
                  onSelect={() => setSelectedSearchLine(selectedSearchLine?.relId === line.relId ? null : line)}
                />
              ))}
            </>
          )}

          {/* ── Favorites tab ── */}
          {tab === 'favorites' && (
            <FavoritesContent
              selectedFavId={selectedFav?.id}
              onSelect={setSelectedFav}
            />
          )}

          {/* ── Trains tab ── */}
          {tab === 'trains' && (
            <>
              {/* Station pickers */}
              <div className="shrink-0 bg-gray-950 px-3 pt-2 pb-2 space-y-2 border-b border-gray-800 sticky top-0 z-10">
                <div className="bg-gray-800 rounded-xl p-2.5 space-y-2">
                  <StationPicker label="From" value={trainFrom} onChange={setTrainFrom} />
                  <div className="border-t border-gray-700" />
                  <StationPicker label="To" value={trainTo} onChange={setTrainTo} />
                </div>
              </div>

              {/* Train list */}
              {trainsLoading && (
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                  <Loader size={16} className="animate-spin" />
                  <span className="text-xs">Loading trains…</span>
                </div>
              )}
              {trainsError && (
                <div className="px-4 py-4 text-center">
                  <p className="text-red-400 text-xs">{trainsError.message}</p>
                  <button onClick={() => refetchTrains()} className="mt-2 text-blue-400 text-xs hover:underline">Retry</button>
                </div>
              )}
              {!trainsLoading && !trainsError && trainFrom && trainTo && trainRoutes.length === 0 && (
                <EmptyState icon={Train} title="No trains found" description="Try a different station or time" />
              )}
              {trainRoutes.length > 0 && (
                <>
                  <div className="grid grid-cols-4 px-3 py-1.5 border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-wider sticky top-[84px] bg-gray-950 z-10">
                    <span>Departs</span><span>Arrives</span><span>Platform</span><span>Status</span>
                  </div>
                  {trainRoutes.map((route, i) => (
                    <TrainRow
                      key={i}
                      route={route}
                      selected={selectedTrainIdx === i}
                      onClick={() => setSelectedTrainIdx(selectedTrainIdx === i ? null : i)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Bottom: map ── */}
      <div
        className="relative shrink-0 min-h-0 border-t-2 border-blue-900/60 rounded-t-xl overflow-hidden"
        style={{ flex: bottomFlex, transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)' }}
      >
        {/* NearbyMap stays mounted always to avoid Google Maps re-init crash */}
        <div className="w-full h-full" style={{ visibility: showTrainMap ? 'hidden' : 'visible' }}>
          <NearbyMap
            stops={tab === 'nearby' ? stops : []}
            selectedId={selectedId}
            onSelectStop={handleSelectStop}
            routeStops={
              tab === 'nearby' ? routeStops :
              showSearchRouteOnMap ? searchRouteStops :
              showFavRouteOnMap ? favRouteStops : []
            }
            routeShape={
              tab === 'nearby' ? nearbyRouteShape :
              tab === 'lines' ? searchRouteShape :
              tab === 'favorites' ? favRouteShape : null
            }
            routeColor={
              tab === 'lines' ? (selectedSearchLine?.colour || '#F59E0B') :
              tab === 'favorites' ? (selectedFav?.routeColour || '#F59E0B') :
              (selectedLine?.colour || '#F59E0B')
            }
            busPositions={busPositions}
            routeLoading={
              (tab === 'nearby' && !!selectedLine && routeLoading) ||
              (tab === 'lines' && !!selectedSearchLine && searchRouteLoading) ||
              (tab === 'favorites' && !!selectedFav && favRouteLoading)
            }
          />
        </div>
        {showTrainMap && (
          <div className="absolute inset-0">
            <TrainMap route={selectedTrain} stations={stations} />
          </div>
        )}
      </div>
    </div>
  );
}
