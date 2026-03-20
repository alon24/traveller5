import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Navigation, Map, MapPin, Settings } from 'lucide-react';

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/plan', icon: Navigation, label: 'Plan' },
  { to: '/nearby', icon: MapPin, label: 'Nearby' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function BottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-gray-50 border-t border-gray-200 z-50">
      <div className="flex justify-around items-center h-14">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] transition-colors ${
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
