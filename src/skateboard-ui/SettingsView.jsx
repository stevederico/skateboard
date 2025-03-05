import { useNavigate } from 'react-router-dom';
import { getState } from '@/context.jsx';
import { useEffect, useState } from 'react';
import { DynamicIcon } from "lucide-react/dynamic";
import constants from "@/constants.json";


export default function SettingsView() {
  const navigate = useNavigate();
  const { state, dispatch } = getState();

  async function showManage() {
    try {
      const uri = `${constants.backendURL}/create-portal-session`;
      const response = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerID: state.user?.stripeID }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("/create-portal-session response: ", data);
        if (data.url) {
          window.location.href = data.url; // Redirect to Stripe billing portal
        } else {
          console.error("No URL returned from server");
        }
      } else {
        console.error("Error with /create-portal-session. Status:", response.status);
      }
    } catch (error) {
      console.error("Request failed:", error);
    }
  }

  async function showCheckout(productIndex = 0, email) {

    let params = { lookup_key: constants.stripeProducts[productIndex].lookup_key }
    if (email) {
      params.email = email
    } else {
      params.email = state.user?.email
    }

    try {
      const uri = `${constants.backendURL}/create-checkout-session`;
      const response = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          console.error("No URL returned from server");
        }
      } else {
        console.log("Error with /create-checkout-session");
      }
    } catch (error) {
      console.error("Checkout failed:", error);
    }
  }

  return (
    <>
      <div className="flex border-b w-full items-center">
        <div className="m-3 p-2 hover:bg-accent hover:text-accent-foreground rounded cursor-pointer font-medium text-xl">
          Settings
        </div>
        <div className="ml-auto mr-5 pt-1">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-4 gap-6">

        {/* PROFILE */}
        <div className="w-full  bg-accent p-6 rounded flex items-center justify-between">
          <div className="w-10 h-10 bg-app dark:text-black text-white flex justify-center items-center rounded-full "> <span className="uppercase">{state.user?.name?.split(' ').map(word => word[0]).join('') || "A"}</span></div>
          {/* NAME */}
          <div className="ml-4">
            <div className="text font-medium block mb-1 capitalize">{state.user?.name || "Test User"}</div>
            <div className="text-sm text-gray-500">{state.user?.email || "user@test.com"}</div>
          </div >
          {/* BUTTON */}
          <div className="ml-auto">
            <button className="bg-background  text-center border-foreground border  ml-2 px-3 py-2 rounded text-sm border cursor-pointer" onClick={() => {
              document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
              navigate('/');
              dispatch({ type: 'CLEAR_USER', payload: null });
            }} >Sign Out</button>
          </div>
        </div>

        {/* SUPPORT */}

        <div className="flex gap-6  w-full">
          <div className="bg-accent p-6 rounded flex-1">
            <div className="flex items-center">
              <div>
                <div className=" mb-2 font-medium">
                  Contact Support
                </div>
                <div className="text-sm text-gray-500">
                  How can we help you?
                </div>
              </div>
              <div className="ml-auto">
                <div onClick={() => { window.location.href = `mailto:${state.constants.companyEmail}`; }} className="bg-background text-center border-foreground border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer">Support</div>
              </div>
            </div>
          </div>
        </div>

        {/* BILLING */}
        <div className="flex gap-6 mb-10 w-full">
          <div className="bg-accent p-6 rounded flex-1">
            <div className="flex items-center">
              <div>
                <div className="mb-2 font-medium">
                  {state.user?.subscription || "Free"} Plan
                </div>
                <div className="text-sm text-gray-500">
                  Your current plan details
                </div>
              </div>
              <div className="ml-auto">
              {state.user?.stripeID ? (
                <div onClick={() => { showManage() }} className="bg-background border-foreground border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer text-center">Manage</div>
              ) : (
                <div onClick={() => { showCheckout() }} className="bg-app text-white border-app border ml-2 px-3 py-2 rounded text-sm whitespace-nowrap cursor-pointer">Subscribe</div>
              )}
              </div>
            </div>
          </div>
        </div>


        {/* LINKS */}
        <div className="my-10 text-center">
          <span onClick={() => { navigate('/terms') }} className="m-2   text-sm text-gray-500 cursor-pointer">Terms</span>
          <span onClick={() => { navigate('/privacy') }} className="m-2  text-sm text-gray-500 cursor-pointer">Privacy</span>
          <span onClick={() => { navigate('/eula') }} className="m-2  text-sm text-gray-500 cursor-pointer">Eula</span>
          <div className="m-2 block text-sm text-gray-500">v{state.constants.version}</div>
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