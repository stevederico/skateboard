import { useNavigate } from 'react-router-dom';
import { getState } from '@/context.jsx';
import { useEffect, useState } from 'react';
import { DynamicIcon } from "lucide-react/dynamic";
import constants from "@/constants.json";
import pkg from '../../package.json';
import { showCheckout, isAppMode } from './Utilities';
import Header from '@/skateboard-ui/Header.jsx';

export default function SettingsView() {
  const navigate = useNavigate();
  const { state, dispatch } = getState();

  useEffect(() => {
    // let a = isAppMode()
  }, []);

  function signOutClicked() {
    dispatch({ type: 'CLEAR_USER', payload: null });
    navigate('/signin');
  }

  return (
    <div className="h-full min-h-screen flex flex-col">
      {/* Navbar */}
      <div className="flex border-b w-full items-center">
        <Header
          buttonClass=""
          title={"Settings"}
        >
        </Header>
        <div className="ml-auto mr-5 pt-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 items-center p-4 gap-6">
        {/* PROFILE */}
        <div className="w-full bg-accent p-6 rounded flex items-center justify-between">
          <div className="w-10 h-10 bg-app dark:text-black text-white flex justify-center items-center rounded-full">
            <span className="uppercase">{state.user?.name?.split(' ').map(word => word[0]).join('') || "NA"}</span>
          </div>
          <div className="ml-4">
            <div className="text font-medium block mb-1 capitalize">{state.user?.name || "No User"}</div>
            <div className="text-sm text-gray-500">{state.user?.email || "no@user.com"}</div>
          </div>
          <div className="ml-auto">
            <button className="bg-sidebar-background text-center border-foreground border ml-2 px-3 py-2 rounded text-sm border cursor-pointer" onClick={() => {
              signOutClicked()
            }}>Sign Out</button>
          </div>
        </div>

        {/* SUPPORT */}
        <div className="flex gap-6 w-full">
          <div className="bg-accent p-6 rounded flex-1">
            <div className="flex items-center">
              <div>
                <div className="mb-2 font-medium">Contact Support</div>
                <div className="text-sm text-gray-500">How can we help you?</div>
              </div>
              <div className="ml-auto">
                <div onClick={() => { window.location.href = `mailto:${constants.companyEmail}`; }} className="bg-sidebar-background text-center border-foreground border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer">Support</div>
              </div>
            </div>
          </div>
        </div>

        {/* BILLING */}
        <div className="flex gap-6 mb-10 w-full">
          <div className="bg-accent p-6 rounded flex-1">
            <div className="flex items-center">
              <div>
                <div className="mb-2 font-medium">Billing</div>
                <div className="text-sm text-gray-500">
                  {state.user?.subStatus === null || typeof state.user?.subStatus === 'undefined'
                    ? "Your plan is free"
                    : ["active", "canceled"].includes(state.user?.subStatus)
                      ? `Your plan ${state.user?.subStatus === "active" ? "renews" : "ends"} ${new Date(state.user.expires * 1000).toLocaleDateString('en-US')}`
                      : `Your plan is ${state.user?.subStatus}`
                  }
                </div>
              </div>
              {isAppMode() === false && 
              <div className="ml-auto">
                {state.user?.stripeID ? (
                  <div onClick={() => { showManage(state.user?.stripeID) }} className="bg-sidebar-background border-foreground border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer text-center">Manage</div>
                ) : (
                  <div onClick={() => { showCheckout(state.user?.email) }} className="bg-app text-white border-app border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer">Subscribe</div>

                )}
              </div>}

            </div>
          </div>
        </div>
      </div>

      {/* Footer Links */}
      <div className="mt-auto text-center">
        <div className="m-2 mb-4 block text-sm text-gray-500 pb-24 md:pb-0">v{pkg.version}</div>
      </div>
    </div>


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
  };

  return (
    <button onClick={toggleTheme} className="cursor-pointer">
      {theme === 'dark' &&
        <span className="text-gray-500">
          <DynamicIcon name={'sun'} size={24} />
        </span>
      }
      {theme !== 'dark' &&
        <span className="text-gray-500">
          <DynamicIcon name={'moon'} size={24} />
        </span>
      }
    </button>
  );
};