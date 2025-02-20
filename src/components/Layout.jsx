import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx'
import TabBar from './TabBar.jsx'

export default function Layout() {
  return (
    <div className="min-h-screen bg-light-back dark:bg-dark-back">
      <div className="fixed inset-0 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 relative overflow-y-auto scrollbar-hide">
          <div className="container mx-auto px-4 py-8 mb-16 md:mb-0">
            <Outlet />
          </div>
        </main>
      </div>
      <TabBar className="md:hidden" />
    </div>
  );
}




  