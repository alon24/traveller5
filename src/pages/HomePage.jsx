import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Navigation, MapPin, Train, Bell, Map, 
  Sun, Cloud, CloudRain, Snowflake, CloudLightning, 
  Wind, Droplets, ChevronDown, ChevronUp, Clock 
} from 'lucide-react';
import { useLocationStore } from '../stores/useLocationStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { useWeather } from '../hooks/useWeather';
import { useTripStore } from '../stores/useTripStore';
import TransitMap from '../components/map/TransitMap';
import LocationPickerModal from '../components/trip/LocationPickerModal';
import { RefreshCw } from 'lucide-react';

function getWeatherIcon(id, size = 20) {
  if (id >= 200 && id < 600) return <CloudRain size={size} />;
  if (id >= 600 && id < 700) return <Snowflake size={size} />;
  if (id >= 700 && id < 800) return <Wind size={size} />;
  if (id === 800) return <Sun size={size} />;
  if (id > 800 && id < 803) return <Cloud size={size} />;
  if (id >= 803) return <Cloud size={size} className="text-gray-400" />;
  return <Sun size={size} />;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [showWeatherDetails, setShowWeatherDetails] = useState(false);
  
  const coords = useLocationStore((s) => s.coords);
  const usingFallback = useLocationStore((s) => s.usingFallback);
  const fallbackLocation = useLocationStore((s) => s.fallbackLocation);
  const isManual = useLocationStore((s) => s.isManual);
  const manualLabel = useLocationStore((s) => s.manualLabel);
  const setManualLocation = useLocationStore((s) => s.setManualLocation);
  const resetToGPS = useLocationStore((s) => s.resetToGPS);

  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const current = useWeatherStore((s) => s.current);
  const hourly = useWeatherStore((s) => s.hourly);
  const hasAlert = useWeatherStore((s) => s.hasAlert);
  const alertMessage = useWeatherStore((s) => s.alertMessage);
  
  const activeTrip = useTripStore((s) => s.origin && s.destination ? { origin: s.origin, destination: s.destination } : null);

  useWeather(coords?.lat, coords?.lng);

  const quickActions = [
    { label: 'Plan a Trip', icon: Navigation, to: '/plan', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Nearby Stops', icon: MapPin, to: '/nearby', color: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Train Times', icon: Train, to: '/trains', color: 'bg-purple-600 hover:bg-purple-700' },
    { label: 'My Alerts', icon: Bell, to: '/alerts', color: 'bg-orange-600 hover:bg-orange-700' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Weather banner */}
      {current && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
          <button 
            onClick={() => setShowWeatherDetails(!showWeatherDetails)}
            className="w-full text-left p-4 hover:bg-gray-50/50 transition-colors"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-blue-50 p-2.5 rounded-xl text-blue-500">
                  {getWeatherIcon(current.weather?.[0]?.id, 32)}
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 leading-tight">
                    {Math.round(current.main?.temp)}°C
                  </p>
                  <p className="text-sm font-medium text-gray-600 capitalize">
                    {current.weather?.[0]?.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                  {showWeatherDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>Details</span>
                </div>
                <div className="text-right text-[11px] text-gray-500 leading-none">
                  Feels {Math.round(current.main?.feels_like)}°C
                </div>
              </div>
            </div>

            {hasAlert && !showWeatherDetails && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-amber-700 text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span className="font-medium truncate">{alertMessage}</span>
              </div>
            )}
          </button>

          {showWeatherDetails && (
            <div className="border-t border-gray-100 bg-gray-50/30 p-4 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
              {hasAlert && (
                <div className="bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 text-amber-800 text-xs font-medium">
                  ⚠️ {alertMessage}
                </div>
              )}
              
              {/* Secondary stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white border border-gray-100 rounded-xl p-2.5 flex flex-col items-center gap-1">
                  <Wind size={14} className="text-gray-400" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Wind</span>
                  <span className="text-xs font-bold text-gray-700">{Math.round(current.wind?.speed)} km/h</span>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-2.5 flex flex-col items-center gap-1">
                  <Droplets size={14} className="text-gray-400" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Humidity</span>
                  <span className="text-xs font-bold text-gray-700">{current.main?.humidity}%</span>
                </div>
                <div className="bg-white border border-gray-100 rounded-xl p-2.5 flex flex-col items-center gap-1">
                  <Clock size={14} className="text-gray-400" />
                  <span className="text-[10px] text-gray-500 uppercase tracking-tighter">Feels</span>
                  <span className="text-xs font-bold text-gray-700">{Math.round(current.main?.feels_like)}°C</span>
                </div>
              </div>

              {/* Hourly Forecast */}
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 ml-1">Hourly Forecast</p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1 -mx-1">
                  {hourly.map((h, i) => (
                    <div key={i} className="flex-shrink-0 bg-white border border-gray-100 rounded-xl p-2.5 min-w-[64px] flex flex-col items-center gap-1.5 shadow-sm">
                      <span className="text-[9px] font-bold text-gray-400 uppercase">
                        {i === 0 ? 'Now' : new Date(h.dt * 1000).getHours() + ':00'}
                      </span>
                      <div className="text-blue-500">
                        {getWeatherIcon(h.weather?.[0]?.id, 18)}
                      </div>
                      <span className="text-sm font-bold text-gray-800">{Math.round(h.main?.temp)}°</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mini map */}
      <div className="bg-gray-100 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-xs text-gray-600 uppercase tracking-wider">
            {activeTrip ? 'Active Trip' : 'My Location'}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase tracking-tight"
            >
              <MapPin size={10} />
              Set Location
            </button>
            <button
              onClick={() => navigate('/map')}
              className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
            >
              <Map size={12} />
              Full map
            </button>
          </div>
        </div>
        <div className="h-48">
          <TransitMap compact />
        </div>
        {activeTrip && (
          <div className="px-4 py-2 border-t border-gray-300 text-xs text-gray-600 truncate">
            {activeTrip.origin.label} → {activeTrip.destination.label}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-gray-600 text-xs uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {quickActions.map(({ label, icon: Icon, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`${color} rounded-xl p-4 flex flex-col items-center gap-1.5 transition-colors`}
            >
              <Icon size={24} className="text-gray-900" />
              <span className="text-gray-900 text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Location status */}
      <div className="bg-gray-100 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-gray-600 uppercase tracking-wider">Location Status</p>
          {isManual && (
            <button 
              onClick={resetToGPS}
              className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-600 uppercase tracking-tight"
            >
              <RefreshCw size={10} />
              Reset to GPS
            </button>
          )}
        </div>
        
        {isManual ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-blue-400 font-medium truncate">{manualLabel || 'Manual Location'}</p>
              <p className="text-[10px] text-gray-500">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="text-xs text-blue-400 hover:underline shrink-0">Change</button>
          </div>
        ) : usingFallback ? (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-yellow-300 font-medium truncate">{fallbackLocation.name}</p>
              <p className="text-[10px] text-gray-400">Using Fallback</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="text-xs text-blue-400 hover:underline shrink-0">Set Manual</button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
               <p className="text-sm text-green-400 font-medium">GPS Location Active</p>
               <p className="text-[10px] text-gray-500">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="text-xs text-blue-400 hover:underline shrink-0">Set Manual</button>
          </div>
        )}
      </div>

      <LocationPickerModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={setManualLocation}
        title="Set My Location"
      />
    </div>
  );
}
