import { Circle } from '@react-google-maps/api';

export default function UserMarker({ position }) {
  return (
    <>
      <Circle
        center={position}
        radius={10}
        options={{
          fillColor: '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
          zIndex: 100,
        }}
      />
      <Circle
        center={position}
        radius={50}
        options={{
          fillColor: '#3B82F6',
          fillOpacity: 0.15,
          strokeColor: '#3B82F6',
          strokeWeight: 1,
          zIndex: 99,
        }}
      />
    </>
  );
}
