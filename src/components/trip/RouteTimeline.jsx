import { FootprintsIcon, Bus, Train } from 'lucide-react';
import Badge from '../common/Badge';
import { TRANSIT_COLORS } from '../../config/constants';

export default function RouteTimeline({ leg }) {
  const steps = leg?.steps || [];

  return (
    <ol className="space-y-3">
      {steps.map((step, i) => {
        const isTransit = step.travel_mode === 'TRANSIT';
        const td = step.transit_details;
        const line = td?.line;
        const color = line?.color || TRANSIT_COLORS.dan;
        const textColor = line?.text_color || '#FFFFFF';
        const vehicle = line?.vehicle?.type;
        const Icon = vehicle === 'HEAVY_RAIL' || vehicle === 'RAIL' ? Train : isTransit ? Bus : FootprintsIcon;

        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={isTransit ? { backgroundColor: color } : { backgroundColor: '#374151' }}
              >
                <Icon size={14} style={isTransit ? { color: textColor } : { color: '#9CA3AF' }} />
              </div>
              {i < steps.length - 1 && (
                <div className="w-0.5 flex-1 bg-gray-700 mt-1 mb-1 min-h-4" />
              )}
            </div>
            <div className="pb-2 flex-1 min-w-0">
              {isTransit ? (
                <>
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge color={color} textColor={textColor}>{line?.short_name || line?.name}</Badge>
                    <span className="text-white text-sm font-medium truncate">{td?.headsign}</span>
                  </div>
                  <p className="text-gray-400 text-xs">
                    Board at <span className="text-gray-200">{td?.departure_stop?.name}</span>
                    {' · '}Alight at <span className="text-gray-200">{td?.arrival_stop?.name}</span>
                    {' · '}{td?.num_stops} stop{td?.num_stops !== 1 ? 's' : ''}
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    {td?.departure_time?.text} → {td?.arrival_time?.text}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-300 text-sm">Walk {step.duration?.text}</p>
                  <p className="text-gray-500 text-xs">{step.distance?.text}</p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
