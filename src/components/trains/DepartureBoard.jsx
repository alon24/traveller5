import TrainRow from './TrainRow';

export default function DepartureBoard({ routes }) {
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden">
      <div className="grid grid-cols-4 px-4 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wider">
        <span>Departure</span>
        <span>Arrival</span>
        <span>Platform</span>
        <span>Status</span>
      </div>
      {routes.map((route, i) => (
        <TrainRow key={i} route={route} />
      ))}
    </div>
  );
}
