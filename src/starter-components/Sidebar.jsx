import { getState } from '@/context.jsx'
import { useNavigate, useLocation } from 'react-router-dom';

export default function Sidebar() {
  const { state } = getState();
  const navigate = useNavigate();
  const location = useLocation();


  return (
    <div className="bg-light-component dark:bg-dark-back dark:text-dark-text text-light-text flex flex-col h-full z-10 border-r border-gray-200 dark:border-dark-border w-full md:w-48 hidden md:flex">
      {/* LOGO */}

      <div className="flex flex-row align-items pt-8 pb-9 px-3" onClick={() => navigate(`/app`)}>
        <div className="w-5 md:w-12 mb-4 ml-1"><img src={"/icons/icon.svg"} /></div>
        <div className="text-lg md:text-xl font-semibold">{state.constants.appName}</div>
      </div>


      {/* PAGES */}
      {state.constants?.pages?.map((item, index) => (
        <div
          onClick={() => navigate(`/app/${item.title.toLowerCase()}`)}
          key={item.title}
          className={
            location.pathname.includes(item.title.toLowerCase())
              ? "mx-2 my-1 p-1 hover:bg-[#EBEBEB] dark:hover:bg-[#1F1F1F] flex cursor-pointer rounded items-center bg-[#EBEBEB] dark:bg-[#1F1F1F] "
              : "mx-2 my-1 p-1 hover:bg-[#EBEBEB] dark:hover:bg-[#1F1F1F] flex cursor-pointer rounded items-center font-light "
          }
        >
          <span className={`w-6 text-center bi bi-${item.icon} `}></span>
          <span className="ml-1 text-sm">{item.title}</span>
        </div>
      ))}

      {/* SETTINGS */}
      <div
        className={location.pathname.includes('settings')
          ? "mt-auto mx-2 mb-2 m-1 p-1 hover:bg-[#EBEBEB] dark:hover:bg-[#1F1F1F] flex cursor-pointer rounded items-center bg-[#EBEBEB] dark:bg-[#1F1F1F]"
          : "mt-auto mx-2 mb-2 m-1 p-1 hover:bg-[#EBEBEB] dark:hover:bg-[#1F1F1F] flex cursor-pointer rounded items-center font-light"}
        onClick={() => navigate(`/app/settings`)}
      >
        <span className="w-6 text-center bi bi-gear" ></span>
        <span className="ml-1 text-sm">Settings</span>
      </div>
    </div>
  );
}