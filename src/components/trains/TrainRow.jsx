import { ChevronRight } from 'lucide-react';

export default function TrainRow({ route, selected, onClick }) {
  const train = route.Train?.[0] || {};
  const departure = train.DepartureTime?.replace(/^(\d{2})(\d{2})$/, '$1:$2') || '—';
  const arrival = train.ArrivalTime?.replace(/^(\d{2})(\d{2})$/, '$1:$2') || '—';
  const platform = train.Platform || '—';
  const delay = train.Delay;
  const stops = train.Stations?.length || 0;
  const legs = route.Train?.length || 1;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left grid grid-cols-4 items-center px-4 py-2 border-b border-gray-300/50 transition-colors ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-500 pl-3.5' : 'hover:bg-gray-100/50'
      }`}
    >
      <span className="text-gray-900 font-medium text-sm">{departure}</span>
      <span className="text-gray-700 text-sm">{arrival}</span>
      <div className="text-sm">
        <span className="text-gray-600">{platform}</span>
        {legs > 1 && (
          <span className="ml-1.5 text-[10px] text-yellow-400 bg-yellow-900/40 px-1 py-0.5 rounded">
            {legs - 1}x
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-sm ${delay > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
          {delay > 0 ? `+${delay}m` : 'On time'}
        </span>
        <ChevronRight size={14} className={`transition-transform ${selected ? 'text-blue-400 rotate-90' : 'text-gray-600'}`} />
      </div>
    </button>
  );
}
