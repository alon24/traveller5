import { useState, useRef, useEffect } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { MapPin, X, Clock } from 'lucide-react';
import { GOOGLE_MAPS_LIBRARIES } from '../map/TransitMap';

const RECENT_KEY = 'transitil_recent_addresses';
const MAX_RECENT = 8;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}

function saveRecent(place) {
  const list = loadRecent().filter((p) => p.placeId !== place.placeId || p.label !== place.label);
  list.unshift(place);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

export default function PlaceAutocomplete({ placeholder, value, onChange }) {
  const [input, setInput] = useState(value?.label || '');
  const [suggestions, setSuggestions] = useState([]);
  const [recent, setRecent] = useState([]);
  const [focused, setFocused] = useState(false);
  const autocompleteService = useRef(null);
  const placesService = useRef(null);
  const sessionToken = useRef(null);
  const debounceTimer = useRef(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    language: 'he',
    region: 'IL',
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places) return;
    autocompleteService.current = new window.google.maps.places.AutocompleteService();
    placesService.current = new window.google.maps.places.PlacesService(
      document.createElement('div')
    );
    sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
  }, [isLoaded]);

  useEffect(() => {
    if (value?.label) setInput(value.label);
  }, [value?.label]);

  const handleFocus = () => {
    setFocused(true);
    setRecent(loadRecent());
  };

  const handleBlur = () => {
    // Delay so clicks on suggestions register first
    setTimeout(() => setFocused(false), 150);
  };

  const handleInput = (e) => {
    const val = e.target.value;
    setInput(val);

    clearTimeout(debounceTimer.current);

    if (!val) { setSuggestions([]); return; }
    if (!autocompleteService.current) return;

    debounceTimer.current = setTimeout(() => {
      autocompleteService.current.getPlacePredictions(
        {
          input: val,
          componentRestrictions: { country: 'il' },
          sessionToken: sessionToken.current,
        },
        (predictions, status) => {
          setSuggestions(status === 'OK' ? (predictions || []) : []);
        }
      );
    }, 200);
  };

  const handleSelect = (prediction) => {
    setSuggestions([]);
    setFocused(false);
    setInput(prediction.description);

    placesService.current.getDetails(
      { placeId: prediction.place_id, fields: ['geometry', 'formatted_address'] },
      (place, status) => {
        if (status === 'OK') {
          const result = {
            placeId: prediction.place_id,
            label: prediction.description,
            coords: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
          };
          onChange(result);
          saveRecent(result);
          setRecent(loadRecent());
          sessionToken.current = new window.google.maps.places.AutocompleteSessionToken();
        }
      }
    );
  };

  const handleRecentSelect = (place) => {
    setInput(place.label);
    setSuggestions([]);
    setFocused(false);
    onChange(place);
    saveRecent(place);
  };

  const clear = () => { setInput(''); setSuggestions([]); onChange(null); };

  const showRecent = focused && !input && recent.length > 0;
  const showSuggestions = suggestions.length > 0;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-gray-500 shrink-0" />
        <input
          type="text"
          value={input}
          onChange={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
        />
        {input && (
          <button onClick={clear} className="text-gray-500 hover:text-gray-300">
            <X size={14} />
          </button>
        )}
      </div>

      {(showSuggestions || showRecent) && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden z-50 shadow-xl max-h-64 overflow-y-auto">
          {showSuggestions && suggestions.map((s) => (
            <li key={s.place_id}>
              <button
                className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
                onMouseDown={() => handleSelect(s)}
              >
                <MapPin size={13} className="text-gray-500 shrink-0" />
                <span>
                  <span className="font-medium text-white">{s.structured_formatting.main_text}</span>
                  <span className="text-gray-500 ml-2">{s.structured_formatting.secondary_text}</span>
                </span>
              </button>
            </li>
          ))}

          {showRecent && (
            <>
              <li className="px-4 py-1.5 text-xs text-gray-500 uppercase tracking-wider bg-gray-900 sticky top-0">
                Recent
              </li>
              {recent.map((p, i) => (
                <li key={i}>
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center gap-2"
                    onMouseDown={() => handleRecentSelect(p)}
                  >
                    <Clock size={13} className="text-gray-500 shrink-0" />
                    <span className="truncate">{p.label}</span>
                  </button>
                </li>
              ))}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
