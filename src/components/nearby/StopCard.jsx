import { useState } from 'react';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import Badge from '../common/Badge';

export default function StopCard({ stop }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-100 rounded-xl overflow-hidden">
      <button
        className="w-full p-4 text-left flex items-start gap-1.5"
        onClick={() => setExpanded(!expanded)}
      >
        <MapPin size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-gray-900 font-medium truncate">{stop.name}</span>
            <span className="text-gray-600 text-xs shrink-0">{stop.distance}m</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {stop.routes?.slice(0, 5).map((r) => (
              <Badge key={r.id} color={r.color} textColor={r.textColor}>
                {r.shortName || r.longName?.split(' ')[0]}
              </Badge>
            ))}
            {stop.routes?.length > 5 && (
              <span className="text-gray-500 text-xs self-center">+{stop.routes.length - 5}</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-600 mt-1 shrink-0" /> : <ChevronDown size={16} className="text-gray-600 mt-1 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-300 px-4 py-2">
          <p className="text-xs text-gray-500 mb-2">All lines at this stop</p>
          <div className="flex flex-wrap gap-1.5">
            {stop.routes?.map((r) => (
              <Badge key={r.id} color={r.color} textColor={r.textColor}>
                {r.shortName || r.id}
              </Badge>
            ))}
            {(!stop.routes || stop.routes.length === 0) && (
              <span className="text-gray-500 text-xs">No route data available</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
