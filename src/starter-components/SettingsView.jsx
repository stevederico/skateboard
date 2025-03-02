import { useNavigate } from 'react-router-dom';
import { getState } from '@/context.jsx';
import { useRef, useEffect, useState } from 'react';
import { DynamicIcon } from "lucide-react/dynamic";

export default function SettingsView() {
  const navigate = useNavigate();
  const { state } = getState();

  const toggleDarkMode = () => {
 
  };

  return (
    <>
      <div className="flex border-b w-full">
        <div className="m-3 p-2  hover:bg-accent hover:text-accent-foreground rounded cursor-pointer font-medium text-xl">
          Settings
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-4 gap-6">

        {/* PROFILE */}
        <div className="w-full  bg-accent p-6 rounded flex items-center justify-between">
          <div className="w-10 h-10 bg-primary dark:text-black text-white flex justify-center items-center rounded-full "> <span className="uppercase">{state.currentUser?.name.split(' ').map(word => word[0]).join('') || "A"}</span></div>
          {/* NAME */}
          <div className="ml-4">
            <div className="text font-medium block mb-0 capitalize">{state.currentUser?.name || "Test User"}</div>
            <div className="text-sm text-gray-500">{state.currentUser?.email || "user@test.com" }</div>
          </div >
          {/* BUTTON */}
          <div className="ml-auto">
            <button className="bg-accent  dark:border-dark-buttonBorder text-black dark:text-white ml-2 px-3 py-2 rounded text-sm border cursor-pointer" onClick={() => {
              document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
              navigate('/');
            }} >Sign Out</button>
          </div>
        </div>

        {/* SUPPORT */}

        <div className="flex gap-6 mb-10 w-full">
          <div className="bg-accent p-6 rounded flex-1">
            <div className="flex items-center">
              <div>
                <div className="text-black dark:text-white mb-2 font-medium">
                  Contact Support
                </div>
                <div className="text-sm text-gray-500">
                  How can we help you?
                </div>
              </div>
              <div className="ml-auto">
                <div onClick={() => { window.location.href = `mailto:${state.constants.companyEmail}`; }} className="bg-accent dark:border-dark-buttonBorder border text-black dark:text-white ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer">Support</div>
              </div>
            </div>
          </div>
        </div>


        {/* LINKS */}
        <div className="my-10 text-center">
          <span onClick={() => { navigate('/terms') }} className="m-2  font-medium text-gray-500 cursor-pointer">Terms</span>
          <span onClick={() => { navigate('/privacy') }} className="m-2  font-medium text-gray-500 cursor-pointer">Privacy</span>
          <span onClick={() => { navigate('/eula') }} className="m-2  font-medium text-gray-500 cursor-pointer">EULA</span>

          <div className="m-2 block font-semibold text-gray-500">v{state.constants.version}</div>
          <ThemeToggle />
        </div>


      </div>
    </>

  );
}


const ThemeToggle = () => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
    document.body.classList.toggle('dark');
  };

  return (
    <button onClick={toggleTheme} className="">
      {theme === 'dark' &&
         <DynamicIcon name={'sun'} size={24} color="gray" strokeWidth={2} />
      }
      {theme !== 'dark' &&
        <DynamicIcon name={'moon'} size={24} color="gray" strokeWidth={2} />
      }
    </button>
  );
};