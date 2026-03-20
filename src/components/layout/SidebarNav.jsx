import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Navigation, Map, MapPin, Train, Bell, Star, Settings } from 'lucide-react';

const items = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/plan', icon: Navigation, label: 'Plan Trip' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/nearby', icon: MapPin, label: 'Nearby Stops' },
  { to: '/trains', icon: Train, label: 'Trains' },
  { to: '/favorites', icon: Star, label: 'Favorites' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function SidebarNav() {
  return (
    <aside className="hidden lg:flex flex-col w-56 bg-gray-50 border-r border-gray-200 min-h-screen pt-6">
      <div className="px-4 mb-6">
        <span className="text-gray-900 font-bold text-lg">🚌 TransitIL</span>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
