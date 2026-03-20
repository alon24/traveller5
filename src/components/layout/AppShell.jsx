import { Outlet } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';

export default function AppShell() {
  return (
    <div className="min-h-screen bg-white text-gray-900 flex">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 pb-14 lg:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
