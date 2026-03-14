import { useEffect } from 'react';
import { useLocationStore } from '../stores/useLocationStore';

export function useGeolocation() {
  const { coords, accuracy, watching, error, startWatch, stopWatch } = useLocationStore();

  useEffect(() => {
    startWatch();
    return () => stopWatch();
  }, []);

  return { coords, accuracy, watching, error };
}
