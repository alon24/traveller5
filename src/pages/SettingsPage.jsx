import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Check, Navigation, X, Loader } from 'lucide-react';
import { useJsApiLoader } from '@react-google-maps/api';
import { useLocationStore } from '../stores/useLocationStore';
import { GOOGLE_MAPS_LIBRARIES } from '../components/map/TransitMap';

export default function SettingsPage() {
  const fallbackLocation = useLocationStore((s) => s.fallbackLocation);
  const usingFallback = useLocationStore((s) => s.usingFallback);
  const setFallbackLocation = useLocationStore((s) => s.setFallbackLocation);

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const autocompleteRef = useRef(null);
  const placesRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  // Init Google services once loaded
  useEffect(() => {
    if (!isLoaded || !window.google) return;
    autocompleteRef.current = new window.google.maps.places.AutocompleteService();
    placesRef.current = new window.google.maps.places.PlacesService(
      document.createElement('div')
    );
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  const handleInput = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);

    clearTimeout(debounceRef.current);
    if (!val.trim() || !autocompleteRef.current) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      autocompleteRef.current.getPlacePredictions(
        {
          input: val,
          // No componentRestrictions so Hebrew transliterations work globally
          sessionToken: sessionTokenRef.current,
          types: ['geocode', 'establishment'],
        },
        (predictions, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
            setSuggestions(predictions);
            setOpen(true);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
    }, 200);
  }, []);

  const handleSelect = useCallback((prediction) => {
    setSuggestions([]);
    setOpen(false);
    setQuery(prediction.description);

    placesRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'formatted_address', 'name'],
        sessionToken: sessionTokenRef.current,
      },
      (place, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK) {
          setFallbackLocation({
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            name: place.formatted_address || place.name || prediction.description,
          });
          setQuery('');
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
          // Rotate session token after a completed session
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
    );
  }, [setFallbackLocation]);

  function clearInput() {
    setQuery('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-gray-900 text-xl font-bold">Settings</h1>

      {/* GPS status */}
      <div className="bg-gray-100 rounded-xl p-4">
        <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Location Source</p>
        <div className="flex items-center gap-1.5">
          <Navigation size={16} className={usingFallback ? 'text-yellow-400' : 'text-green-400'} />
          <span className="text-sm text-gray-200">
            {usingFallback ? 'Using fallback location' : 'Using GPS'}
          </span>
        </div>
      </div>

      {/* Fallback location */}
      <div className="bg-gray-100 rounded-xl p-4 space-y-4">
        {/* Current */}
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Fallback Location</p>
          <div className="flex items-center gap-1.5">
            <MapPin size={15} className="text-blue-400 shrink-0" />
            <span className="text-sm text-gray-200 flex-1 leading-snug">{fallbackLocation.name}</span>
            {saved && (
              <span className="flex items-center gap-1 text-green-400 text-xs shrink-0">
                <Check size={13} /> Saved
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-1 pl-6">
            {fallbackLocation.lat.toFixed(5)}, {fallbackLocation.lng.toFixed(5)}
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <p className="text-xs text-gray-600 uppercase tracking-wider mb-2">Change Location</p>

          <div className="flex items-center gap-1.5 bg-gray-200 rounded-lg px-2.5 py-2 focus-within:ring-2 focus-within:ring-blue-500">
            {!isLoaded
              ? <Loader size={14} className="text-gray-600 shrink-0 animate-spin" />
              : <MapPin size={14} className="text-gray-600 shrink-0" />
            }
            <input
              ref={inputRef}
              value={query}
              onChange={handleInput}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={isLoaded ? 'Search in Hebrew or English…' : 'Loading maps…'}
              disabled={!isLoaded}
              dir="auto"
              className="flex-1 bg-transparent text-gray-900 text-sm outline-none placeholder-gray-500 disabled:opacity-40"
            />
            {query && (
              <button onClick={clearInput} className="text-gray-500 hover:text-gray-700">
                <X size={14} />
              </button>
            )}
          </div>

          {open && suggestions.length > 0 && (
            <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-50 border border-gray-300 rounded-xl overflow-hidden shadow-2xl z-50 max-h-72 overflow-y-auto">
              {suggestions.map((s) => (
                <li key={s.place_id}>
                  <button
                    onMouseDown={() => handleSelect(s)}
                    className="w-full text-left flex items-start gap-1.5.5 px-4 py-2 hover:bg-gray-100 transition-colors border-b border-gray-200/50 last:border-0"
                  >
                    <MapPin size={13} className="text-gray-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900" dir="auto">
                        {s.structured_formatting.main_text}
                      </p>
                      {s.structured_formatting.secondary_text && (
                        <p className="text-xs text-gray-500 truncate">
                          {s.structured_formatting.secondary_text}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
