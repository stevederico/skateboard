import constants from "@/constants.json";
import { Link, useLocation } from 'react-router-dom';
import { DynamicIcon } from 'lucide-react/dynamic';

export default function TabBar() {
  const location = useLocation();

  return (
    <div style={{
      overflow: "hidden",
      overscrollBehavior: "none"
    }} className="fixed flex md:hidden pt-2 pb-4 bottom-0 inset-x-0 justify-around text-center border-t shadow-lg bg-sidebar">
      {constants?.pages?.map((item) => (
        <span className="px-3" key={item.title}>
          <Link to={`/app/${item.url.toLowerCase()}`} >
            {
              location.pathname.includes(item.url.toLowerCase())
                ? (
                  <DynamicIcon name={item.icon} color="black" size={32} />
                )
                : (
                  <DynamicIcon name={item.icon} color="gray" size={32} />
                )
            }
          </Link>
        </span>
      ))}
      <span className="px-3">
        <Link to={`/app/settings`}>
        {
              location.pathname.includes('Settings'.toLowerCase())
                ? (
                  <DynamicIcon name={"settings"} size={32} color="black" />
                )
                : (
                  <DynamicIcon name={"settings"} color="gray" size={32} />
                )
            }
        </Link></span>
    </div>
  );
};
