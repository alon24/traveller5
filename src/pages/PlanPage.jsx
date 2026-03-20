import { useState } from 'react';
import { ArrowUpDown, Navigation, MapPin } from 'lucide-react';
import { useTripStore } from '../stores/useTripStore';
import { useDirections } from '../hooks/useDirections';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ErrorMessage from '../components/common/ErrorMessage';
import EmptyState from '../components/common/EmptyState';
import RouteOptionCard from '../components/trip/RouteOptionCard';
import PlaceAutocomplete from '../components/trip/PlaceAutocomplete';
import LocationPickerModal from '../components/trip/LocationPickerModal';

export default function PlanPage() {
  const { origin, destination, routes, setOrigin, setDestination } = useTripStore();
  const { isLoading, error, refetch } = useDirections();
  const [picker, setPicker] = useState(null); // 'origin' | 'destination' | null

  const swap = () => {
    const o = origin;
    setOrigin(destination);
    setDestination(o);
  };

  const handlePickerConfirm = (place) => {
    if (picker === 'origin') setOrigin(place);
    else setDestination(place);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Plan Trip</h1>

      {/* Origin / destination inputs */}
      <div className="bg-gray-100 rounded-xl p-4 space-y-3 relative">
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <PlaceAutocomplete
              placeholder="From…"
              value={origin}
              onChange={setOrigin}
            />
          </div>
          <button
            onClick={() => setPicker('origin')}
            title="Pick on map"
            className="text-gray-600 hover:text-blue-400 transition-colors p-1"
          >
            <MapPin size={16} />
          </button>
        </div>
        <div className="border-t border-gray-300" />
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <PlaceAutocomplete
              placeholder="To…"
              value={destination}
              onChange={setDestination}
            />
          </div>
          <button
            onClick={() => setPicker('destination')}
            title="Pick on map"
            className="text-gray-600 hover:text-blue-400 transition-colors p-1"
          >
            <MapPin size={16} />
          </button>
        </div>
        <button
          onClick={swap}
          className="absolute right-12 top-1/2 -translate-y-1/2 bg-gray-200 hover:bg-gray-600 p-2 rounded-full transition-colors"
        >
          <ArrowUpDown size={16} />
        </button>
      </div>

      {/* Results */}
      {isLoading && <LoadingSpinner className="py-12" />}
      {error && <ErrorMessage message={error.message} onRetry={refetch} />}
      {!isLoading && !error && routes.length === 0 && origin && destination && (
        <EmptyState icon={Navigation} title="No routes found" description="Try adjusting your search" />
      )}
      {routes.map((route, idx) => (
        <RouteOptionCard key={idx} route={route} index={idx} />
      ))}

      <LocationPickerModal
        isOpen={!!picker}
        onClose={() => setPicker(null)}
        onConfirm={handlePickerConfirm}
        title={picker === 'origin' ? 'Pick starting point' : 'Pick destination'}
      />
    </div>
  );
}
