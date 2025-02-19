import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx'
import TabBar  from './TabBar.jsx'


const Layout = () => {
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
            className="fixed flex h-full w-full">
            <Sidebar />
            <div className="flex-1" style={{
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              top: 'env(safe-area-inset-top, 0px)',
              bottom: '0',
              width: '100%',
            }}>
              <Outlet />
            </div>
          </div>
          <TabBar />
        </>
      );
}

export default Layout;


  