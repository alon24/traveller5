import { useState } from 'react';
import { Clock, ArrowRight, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import { useTripStore } from '../../stores/useTripStore';
import RouteTimeline from './RouteTimeline';
import Badge from '../common/Badge';
import { TRANSIT_COLORS } from '../../config/constants';

export default function RouteOptionCard({ route, index }) {
  const [expanded, setExpanded] = useState(false);
  const { selectedRouteIndex, selectRoute } = useTripStore();
  const isSelected = selectedRouteIndex === index;

  const leg = route.legs?.[0];
  if (!leg) return null;

  const transitSteps = leg.steps?.filter((s) => s.travel_mode === 'TRANSIT') || [];
  const duration = leg.duration?.text;
  const departureTime = leg.departure_time?.text;
  const arrivalTime = leg.arrival_time?.text;

  return (
    <div
      className={`bg-gray-800 rounded-xl overflow-hidden border transition-colors ${
        isSelected ? 'border-blue-500' : 'border-gray-700 hover:border-gray-600'
      }`}
    >
      <button
        className="w-full p-4 text-left"
        onClick={() => { selectRoute(index); setExpanded(!expanded); }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-gray-400" />
            <span className="text-white font-semibold">{duration}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{departureTime}</span>
            <ArrowRight size={12} />
            <span>{arrivalTime}</span>
          </div>
        </div>

        {/* Transit leg chips */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {transitSteps.map((step, i) => {
            const line = step.transit_details?.line;
            const color = line?.color || TRANSIT_COLORS.dan;
            const textColor = line?.text_color || '#FFFFFF';
            return (
              <Badge key={i} color={color} textColor={textColor}>
                {line?.short_name || line?.name || '—'}
              </Badge>
            );
          })}
          {transitSteps.length === 0 && (
            <span className="text-gray-500 text-xs">Walking only</span>
          )}
          <span className="ml-auto">{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-700 px-4 pb-4 pt-3">
          <RouteTimeline leg={leg} />
          <button className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
            <Bell size={14} /> Set Departure Alert
          </button>
        </div>
      )}
    </div>
  );
}
