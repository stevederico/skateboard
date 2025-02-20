import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx'
import TabBar  from './TabBar.jsx'


export default function Layout() {
    return (
        <>
          <div style={{
            overflow: 'hidden',
            overscrollBehaviorY: 'none',
            bottom: '0px',
            right: '0px',
            left: '0px',
            top: 'env(safe-area-inset-top, 0px)',
          }}
            className="fixed flex h-full w-full bg-light-back dark:bg-dark-back text-light-text dark:text-dark-text">
            <Sidebar />
            <div className="flex-1 px-4 md:px-6" style={{
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              top: 'env(safe-area-inset-top, 0px)',
              bottom: '0',
              width: '100%',
              paddingBottom: '4rem', // Space for mobile TabBar
            }}>
              <Outlet />
            </div>
          </div>
          <TabBar />
        </>
      );
}




  