import { useState, useCallback } from 'react';
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api';
import { X, Check } from 'lucide-react';
import { GOOGLE_MAPS_LIBRARIES } from '../map/TransitMap';
import AdvancedMarker from '../map/AdvancedMarker';
import { useLocationStore } from '../../stores/useLocationStore';
import LoadingSpinner from '../common/LoadingSpinner';

const MAP_OPTIONS = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
};

export default function LocationPickerModal({ isOpen, onClose, onConfirm, title }) {
  const coords = useLocationStore((s) => s.coords);
  const [pin, setPin] = useState(null);
  const [label, setLabel] = useState('');

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const handleMapClick = useCallback((e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    setPin({ lat, lng });
    setLabel('');

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      setLabel(
        status === 'OK' && results[0]
          ? results[0].formatted_address
          : `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      );
    });
  }, []);

  const handleConfirm = () => {
    if (!pin) return;
    onConfirm({ coords: pin, label: label || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`, placeId: null });
    onClose();
    setPin(null);
    setLabel('');
  };

  const handleClose = () => {
    onClose();
    setPin(null);
    setLabel('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 bg-gray-50 border-b border-gray-200 shrink-0">
        <span className="text-gray-900 font-medium">{title}</span>
        <button onClick={handleClose} className="text-gray-600 hover:text-gray-900">
          <X size={20} />
        </button>
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        {isLoaded ? (
          <GoogleMap
            mapContainerClassName="w-full h-full"
            center={coords || { lat: 31.8942, lng: 34.812 }}
            zoom={14}
            options={MAP_OPTIONS}
            onClick={handleMapClick}
          >
            {pin && (
              <AdvancedMarker position={pin}>
                <svg width="24" height="32" viewBox="0 0 24 32" style={{ display: 'block' }}>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20S24 21 24 12C24 5.373 18.627 0 12 0z"
                    fill="#EF4444" stroke="white" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="4" fill="white"/>
                </svg>
              </AdvancedMarker>
            )}
          </GoogleMap>
        ) : (
          <LoadingSpinner size="lg" className="h-full bg-gray-50" />
        )}

        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-50/90 text-gray-700 text-sm px-2.5 py-1 rounded-full pointer-events-none">
          Tap the map to drop a pin
        </div>
      </div>

      {/* Bottom confirm bar */}
      <div className={`bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center gap-1.5 shrink-0 transition-opacity ${pin ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <p className="flex-1 text-sm text-gray-700 truncate">
          {label || 'Fetching address…'}
        </p>
        <button
          onClick={handleConfirm}
          disabled={!pin || !label}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-gray-900 px-4 py-2 rounded-lg flex items-center gap-1.5 text-sm shrink-0"
        >
          <Check size={16} />
          Select
        </button>
      </div>
    </div>
  );
}
