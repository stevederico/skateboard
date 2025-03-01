import { useNavigate } from 'react-router-dom';
import { getState } from '../../context.jsx';
import constants from "../../constants.json";


export default function SettingsView() {
  const navigate = useNavigate();
  const { state } = getState();

  const toggleDarkMode = () => {
    document.body.classList.toggle('dark');
  };

  return (
    <>
      <div className="text-xl font-semibold mb-3">Settings</div>

      <div className="flex flex-col items-center justify-center"> 

        <div className="w-full flex rounded bg-gray-300 dark:text-gray-700 p-4 my-4 items-center h-16"> 
          <div>Welcome</div>
          <div className="ml-auto">
            <div
              className="rounded px-3 py-1 border cursor-pointer m-1"
              onClick={() => {
                document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
                navigate('/');
              }}> Sign Out</div>
          </div>
        </div>

        <div className="w-full flex rounded bg-gray-300 dark:text-gray-700 p-4 my-4 items-center h-16"> 
          <div>Contact Us</div>
          <div className="ml-auto">
            <a
              href={`mailto:${state.constants.companyEmail}`}
              className="rounded px-3 py-2 border cursor-pointer m-1"
            >
              Get Support
            </a>
          </div>
        </div>


        <div className="w-full flex rounded bg-gray-300 dark:text-gray-700 p-4 my-4 items-center h-16"> 
          <div>Dark Mode</div>
          <div className="ml-auto">
            <div className="rounded px-3 border cursor-pointer m-1" onClick={toggleDarkMode}> Toggle</div>
          </div>
        </div>


        <div className="text-sm my-2">v{state.constants.version}</div> 
      </div>
    </>

  );
}
