import { useWeatherStore } from '../../stores/useWeatherStore';
import { Cloud, Sun, CloudRain } from 'lucide-react';

function WeatherBadge() {
  const current = useWeatherStore((s) => s.current);
  if (!current) return null;

  const id = current.weather?.[0]?.id;
  const Icon = id >= 500 && id < 600 ? CloudRain : id >= 800 ? Sun : Cloud;
  const temp = Math.round(current.main?.temp);

  return (
    <div className="flex items-center gap-1 text-sm text-gray-300">
      <Icon size={16} className="text-blue-400" />
      <span>{temp}°C</span>
    </div>
  );
}

export default function Header() {
  return (
    <header className="lg:hidden sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 h-14 flex items-center justify-between">
      <span className="text-white font-bold">🚌 TransitIL</span>
      <WeatherBadge />
    </header>
  );
}
