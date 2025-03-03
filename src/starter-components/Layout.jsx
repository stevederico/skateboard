import { Outlet } from 'react-router-dom';
import TabBar from './TabBar.jsx'
import { SidebarProvider, SidebarTrigger } from "@/shadcn/ui/components/ui/sidebar"
import { AppSidebar } from "@/shadcn/ui/components/ui/app-sidebar"
import { useEffect } from 'react';

export default function Layout({ children }) {

  useEffect(() => {
    const root = document.documentElement;
    let theme = localStorage.getItem('theme')
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, []);

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <div className="fixed inset-0 flex overflow-hidden">
        <SidebarProvider>
          <AppSidebar />
          <main className="flex-1 relative overflow-y-auto scrollbar-hide">
            <Outlet />
          </main>
        </SidebarProvider>
      </div>
      <TabBar className="md:hidden" />
    </div>
  )
}





