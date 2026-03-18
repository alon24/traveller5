import { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, RefreshCw, X, Star, Train, Loader, Trash2, Search, Clock } from 'lucide-react';
import { useLocationStore } from '../stores/useLocationStore';
import { useNearbyStops } from '../hooks/useNearbyStops';
import { useRouteStops } from '../hooks/useRouteStops';
import { useRouteShape } from '../hooks/useRouteShape';
import { useRelIdResolver } from '../hooks/useRelIdResolver';
import { useSiriVehiclePositions } from '../hooks/useGtfsRealtime';
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

// Extract the destination city from a raw GTFS "to" string.
// Input examples: "אקווריום ישראל-ירושלים-3א", "מרכז ביג/המשק-באר שבע", "רחובות"
// Output: "ירושלים", "באר שבע", "רחובות"
function toCity(to) {
  if (!to) return '';
  // Strip trailing variant suffix: -<digits><optional Hebrew letter>
  const clean = to.replace(/-\d+[א-ת]?$/, '').trim();
  // The city is the last segment after a '-'
  const dash = clean.lastIndexOf('-');
  return dash >= 0 ? clean.slice(dash + 1).trim() : clean;
}

// ── Single line row (li) inside a stop ──────────────────────────
function LineRow({ route, stopId, stopName, active, onClick }) {
  const bg = route.colour || '#1e3a5f';
  const isFav = useFavoritesStore((s) => s.isFavorite(stopId, route.ref, route.relId));
  const toggle = useFavoritesStore((s) => s.toggle);
  const dest = toCity(route.to);

  const handleStar = (e) => {
    e.stopPropagation();
    toggle({ stopId, stopName, routeRef: route.ref, routeRelId: route.relId, routeColour: route.colour, routeTo: route.to });
  };

  return (
    <li
      className={`flex items-center gap-2 px-2 py-1 rounded transition-colors cursor-pointer select-none
        ${active ? 'bg-blue-950/60 ring-1 ring-blue-500/50' : 'hover:bg-gray-800/40'}`}
      onMouseDown={(e) => { e.stopPropagation(); onClick(route); }}
    >
      {/* Line number badge */}
      <span
        className="shrink-0 min-w-[2rem] text-center px-1.5 py-0.5 rounded text-xs font-bold font-mono text-white"
        style={{ backgroundColor: bg }}
      >
        {route.ref}
      </span>

      {/* Direction arrow + destination */}
      <span className="flex-1 flex items-center gap-1 min-w-0" dir="rtl">
        <span className="text-gray-500 text-[10px] shrink-0">→</span>
        <span className={`text-xs truncate ${dest ? 'text-gray-300' : 'text-gray-600'}`}>
          {dest || '—'}
        </span>
      </span>

      {/* Star */}
      <button
        onMouseDown={handleStar}
        className={`shrink-0 transition-colors ${isFav ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-400'}`}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={10} fill={isFav ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}

// ── Compact line-specific arrivals strip ─────────────────────────
function LineArrivalsStrip({ stopCode, lineRef, colour }) {
  const { data: arrivals = [], isLoading, dataUpdatedAt } = useStopArrivals(stopCode);

  const lineArrivals = arrivals.filter((a) => a.lineRef === lineRef).slice(0, 4);
  const updated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="flex items-center gap-1.5 mt-1 min-h-[18px]">
      <Clock size={9} className="text-gray-500 shrink-0" />
      {isLoading ? (
        <Loader size={9} className="animate-spin text-gray-500" />
      ) : lineArrivals.length === 0 ? (
        <span className="text-[9px] text-gray-600">No arrivals in 30 min</span>
      ) : (
        <>
          {lineArrivals.map((a, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-700">·</span>}
              <span className={`text-[10px] font-semibold tabular-nums ${
                a.etaMinutes <= 2 ? 'text-red-400' : a.etaMinutes <= 5 ? 'text-yellow-400' : 'text-emerald-400'
              }`}>
                {a.etaMinutes === 0 ? 'Now' : `${a.etaMinutes}m`}
              </span>
            </span>
          ))}
          {updated && <span className="text-[9px] text-gray-700 ml-auto shrink-0">{updated}</span>}
        </>
      )}
    </div>
  );
}

// ── Stop row ─────────────────────────────────────────────────────
function StopRow({ stop, selected, onClick, selectedLine, onLineClick, rowRef }) {
  const activeLineRef = selectedLine?.stopId === stop.id ? selectedLine?.ref : null;

  return (
    <div
      ref={rowRef}
      className={`border-b border-gray-800/50 transition-colors ${selected ? 'bg-blue-950/20 border-l-2 border-l-blue-500' : ''}`}
    >
      {/* Stop header — click to expand/collapse */}
      <div
        onClick={onClick}
        className="flex items-center justify-between gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-800/30"
      >
        <div className="min-w-0 flex items-center gap-1.5">
          <MapPin size={11} className="text-gray-500 shrink-0" />
          <span className="text-xs font-medium text-white truncate">{stop.name}</span>
          {stop.ref && <span className="text-[10px] text-gray-500 shrink-0">#{stop.ref}</span>}
        </div>
        <span className="text-[10px] text-gray-500 shrink-0">{stop.distance}m</span>
      </div>

      {/* Lines list */}
      {stop.routes.length > 0 ? (
        <ul className="px-2 pb-1.5 space-y-0.5">
          {stop.routes.map((r) => (
            <LineRow
              key={r.ref}
              route={r}
              stopId={stop.id}
              stopName={stop.name}
              active={activeLineRef === r.ref}
              onClick={(route) => onLineClick(route, stop)}
            />
          ))}
          {/* Arrivals for the active line */}
          {activeLineRef && stop.ref && (
            <li className="pt-0.5">
              <LineArrivalsStrip stopCode={stop.ref} lineRef={activeLineRef} colour={selectedLine.colour} />
            </li>
          )}
        </ul>
      ) : (
        <p className="text-[10px] text-gray-700 px-3 pb-1.5">No line data</p>
      )}
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
  const resolveRelId = useRelIdResolver();

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current[selectedId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const handleSelectStop = (id) => {
    setSelectedId((prev) => (prev === id ? null : id));
    if (mode === 'list') setMode('default');
  };

  const handleLineClick = (route, stop) => {
    const stopId = typeof stop === 'object' ? stop.id : stop;
    if (selectedLine?.ref === route.ref && selectedLine?.stopId === stopId) {
      setSelectedLine(null);
      setMode('default');
      return;
    }
    // relId stays as mot-line: for the lifetime of this selection —
    // changing it would re-trigger useRouteShape and cause a flicker.
    // Encode the stop's MOT code into relId so route/shape lookups can use
    // a stop-correlated Stride query and pick the right city variant.
    const stopCode = typeof stop === 'object' ? stop.ref : '';
    const relId = stopCode ? `mot-line:${route.ref}:${stopCode}` : route.relId;
    setSelectedLine({ ref: route.ref, relId, colour: route.colour, stopId });
    setMode('map');

    // Resolve precise relId for accurate stop/shape matching (city dedup).
    // Result intentionally NOT fed back into selectedLine — that would re-trigger
    // useRouteShape and cause flicker. mot-line: works for stops, shape and SIRI.
    const stopRef = typeof stop === 'object' ? stop.ref : null;
    if (stopRef) resolveRelId(stopRef, route.ref, route.to);
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

  // Whichever tab is active, pick the right route stops / relId for bus filtering
  const activeRouteStops = tab === 'favorites' ? favRouteStops
    : tab === 'lines' ? searchRouteStops
    : routeStops;

  const activeRelId =
    tab === 'favorites' ? selectedFav?.routeRelId :
    tab === 'lines'     ? selectedSearchLine?.relId :
    selectedLine?.relId;

  // Poll SIRI vehicle positions only when a line is active (no API key needed)
  const { data: allVehicles = [] } = useSiriVehiclePositions(activeRelId);

  // allVehicles already scoped to the active line by useSiriVehiclePositions
  const busPositions = allVehicles;

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
        {/* Floating selected-line badge */}
        {activeRelId && (() => {
          const line =
            tab === 'favorites' ? { ref: selectedFav?.routeRef,         colour: selectedFav?.routeColour } :
            tab === 'lines'     ? { ref: selectedSearchLine?.ref,        colour: selectedSearchLine?.colour } :
                                  { ref: selectedLine?.ref,              colour: selectedLine?.colour };
          if (!line?.ref) return null;
          return (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
              <span
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold font-mono text-white shadow-lg"
                style={{ backgroundColor: line.colour || '#1e3a5f', boxShadow: `0 2px 12px ${line.colour || '#1e3a5f'}88` }}
              >
                🚌 {line.ref}
              </span>
            </div>
          );
        })()}

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
              tab === 'lines' ? (selectedSearchLine?.colour || '#1565C0') :
              tab === 'favorites' ? (selectedFav?.routeColour || '#1565C0') :
              (selectedLine?.colour || '#1565C0')
            }
            busPositions={busPositions}
            activeLine={
              tab === 'favorites' ? { ref: selectedFav?.routeRef,        to: selectedFav?.routeTo        || '' } :
              tab === 'lines'     ? { ref: selectedSearchLine?.ref,       to: selectedSearchLine?.to      || '' } :
                                    { ref: selectedLine?.ref,             to: selectedLine?.to            || '' }
            }
            routeLoading={
              (tab === 'nearby'    && !!selectedLine       && (routeLoading       || nearbyRouteShape  === null)) ||
              (tab === 'lines'     && !!selectedSearchLine && (searchRouteLoading || searchRouteShape  === null)) ||
              (tab === 'favorites' && !!selectedFav        && (favRouteLoading    || favRouteShape     === null))
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
