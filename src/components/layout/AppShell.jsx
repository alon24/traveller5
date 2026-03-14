import { Outlet } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
import SidebarNav from './SidebarNav';

export default function AppShell() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex">
      <SidebarNav />
      <div className="flex-1 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 pb-16 lg:pb-0">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
