import { useNavigate } from 'react-router-dom';
import { Navigation, MapPin, Train, Bell, Map } from 'lucide-react';
import { useLocationStore } from '../stores/useLocationStore';
import { useWeatherStore } from '../stores/useWeatherStore';
import { useWeather } from '../hooks/useWeather';
import { useTripStore } from '../stores/useTripStore';
import TransitMap from '../components/map/TransitMap';

export default function HomePage() {
  const navigate = useNavigate();
  const coords = useLocationStore((s) => s.coords);
  const usingFallback = useLocationStore((s) => s.usingFallback);
  const fallbackLocation = useLocationStore((s) => s.fallbackLocation);
  const current = useWeatherStore((s) => s.current);
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
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-2xl font-bold text-white">{Math.round(current.main?.temp)}°C</p>
              <p className="text-gray-400 capitalize">{current.weather?.[0]?.description}</p>
            </div>
            <div className="text-right text-sm text-gray-400">
              <p>Feels like {Math.round(current.main?.feels_like)}°C</p>
              <p>Humidity {current.main?.humidity}%</p>
            </div>
          </div>
          {hasAlert && (
            <div className="mt-3 bg-yellow-900/50 border border-yellow-700 rounded-lg px-3 py-2 text-yellow-300 text-sm">
              ⚠️ {alertMessage}
            </div>
          )}
        </div>
      )}

      {/* Mini map */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider">
            {activeTrip ? 'Active Trip' : 'My Location'}
          </p>
          <button
            onClick={() => navigate('/map')}
            className="flex items-center gap-1 text-xs text-blue-400 hover:underline"
          >
            <Map size={12} />
            Full map
          </button>
        </div>
        <div className="h-48">
          <TransitMap compact />
        </div>
        {activeTrip && (
          <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-400 truncate">
            {activeTrip.origin.label} → {activeTrip.destination.label}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map(({ label, icon: Icon, to, color }) => (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={`${color} rounded-xl p-4 flex flex-col items-center gap-2 transition-colors`}
            >
              <Icon size={24} className="text-white" />
              <span className="text-white text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Location status */}
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Location</p>
        {usingFallback ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-yellow-300">{fallbackLocation.name}</p>
            <button onClick={() => navigate('/settings')} className="text-xs text-blue-400 hover:underline">Change</button>
          </div>
        ) : (
          <p className="text-sm text-gray-200">{coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</p>
        )}
      </div>
    </div>
  );
}
