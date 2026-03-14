/**
 * React wrapper for google.maps.marker.AdvancedMarkerElement.
 * Replaces the deprecated google.maps.Marker API.
 * Requires mapId to be set on the parent <GoogleMap>.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGoogleMap } from '@react-google-maps/api';

export default function AdvancedMarker({
  position,
  children,
  onClick,
  zIndex,
  title,
  cursor,
}) {
  const map = useGoogleMap();
  // Stable container div — lives for the lifetime of this component
  const [container] = useState(() => document.createElement('div'));
  const markerRef = useRef(null);
  const listenerRef = useRef(null);

  // Create/destroy the marker
  useEffect(() => {
    if (!map || !window.google?.maps?.marker?.AdvancedMarkerElement) return;

    const marker = new window.google.maps.marker.AdvancedMarkerElement({
      position,
      map,
      content: container,
      title: title || '',
      zIndex: zIndex ?? 0,
    });

    if (cursor) container.style.cursor = cursor;

    if (onClick) {
      marker.element.addEventListener('gmp-click', onClick);
      listenerRef.current = onClick;
    }

    markerRef.current = marker;

    return () => {
      if (listenerRef.current) {
        marker.element.removeEventListener('gmp-click', listenerRef.current);
        listenerRef.current = null;
      }
      marker.map = null;
      markerRef.current = null;
    };
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync position
  useEffect(() => {
    if (markerRef.current && position) markerRef.current.position = position;
  }, [position?.lat, position?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync zIndex
  useEffect(() => {
    if (markerRef.current) markerRef.current.zIndex = zIndex ?? 0;
  }, [zIndex]);

  // Sync click handler
  useEffect(() => {
    if (!markerRef.current) return;
    const el = markerRef.current.element;
    if (listenerRef.current) {
      el.removeEventListener('gmp-click', listenerRef.current);
      listenerRef.current = null;
    }
    if (onClick) {
      el.addEventListener('gmp-click', onClick);
      listenerRef.current = onClick;
    }
  }, [onClick]);

  return createPortal(children, container);
}
