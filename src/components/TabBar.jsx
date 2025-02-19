
import { getState } from '../context.jsx'
import { Link, useLocation } from 'react-router-dom';

const TabBar = () => {
    const location = useLocation();
    const { state } = getState();
    return (
      <div style={{
        overflow: "hidden",
        overscrollBehavior: "none"
      }} className="fixed flex md:hidden pt-2 pb-4 bottom-0 inset-x-0 justify-around text-center border-t border-gray-200 dark:border-dark-border shadow-lg  ">
        {state.constants?.pages?.map((item) => (
          <span className="px-3" key={item.title}>
            <Link to={`/console/${item.title.toLowerCase()}`} >
              <div className={location.pathname.includes(item.title.toLowerCase())
                ? `text-primary w-10 h-10 bi bi-${item.icon} text-4xl`
                : `bi bi-${item.icon} w-10 h-10 text-4xl text-gray-500`
              }></div>
            </Link>
          </span>
        ))}
        <span className="px-3">
          <Link to={`/console/settings`}>
            <span className={
              location.pathname.includes('settings')
                ? `text-primary w-10 h-10 bi bi-gear text-4xl`
                : ` w-10 h-10 bi bi-gear text-4xl text-gray-500`
            }></span>
          </Link></span>
      </div>
    );
  };

  export default TabBar;