import { useNavigate } from 'react-router-dom';
import { getState } from '@/context.jsx';



export default function SettingsView() {
  const navigate = useNavigate();
  const { state } = getState();

  const toggleDarkMode = () => {
    document.body.classList.toggle('dark');
  };

  return (
    <>
      <div className="flex border-b w-full">
        <div className="m-3 p-2 text-sm hover:bg-accent hover:text-accent-foreground rounded cursor-pointer font-medium">
          Settings
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-4">

        <div className="w-full flex rounded bg-accent  p-4 my-4 items-center h-16">
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

        <div className="w-full flex rounded bg-accent  p-4 my-4 items-center h-16">
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


        <div className="w-full flex rounded bg-accent  p-4 my-4 items-center h-16">
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
