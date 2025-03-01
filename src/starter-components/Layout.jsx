import { Outlet } from 'react-router-dom';
import TabBar from './TabBar.jsx'
import { SidebarProvider, SidebarTrigger } from "@/shadcn/ui/components/ui/sidebar"
import { AppSidebar } from "@/shadcn/ui/components/ui/app-sidebar"


export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-light-back dark:bg-dark-back text-light-text dark:text-dark-text">
      <div className="fixed inset-0 flex overflow-hidden">
        <SidebarProvider>
          <AppSidebar />
          <main className="flex-1 relative overflow-y-auto scrollbar-hide">
            <div className="container mx-auto px-4 py-8 mb-16 md:mb-0">
              <Outlet />
            </div>
          </main>
        </SidebarProvider>
      </div>
      <TabBar className="md:hidden" />
    </div>
  )
}





