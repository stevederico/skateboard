import { useNavigate } from 'react-router-dom';
import { getState } from '../context.jsx';

export default function SettingsView() {
  const navigate = useNavigate();
  const { state } = getState();

  const toggleDarkMode = () => {
    document.body.classList.toggle('dark');
  };

  return (
    <div className="flex flex-col">
      <div className="text-xl font-semibold my-3 mx-3">SettingsView</div>
      <div className="rounded px-3 border cursor-pointer m-1 flex-none self-center" onClick={toggleDarkMode}>
        Toggle Dark Mode
      </div>
      <div className="text-sm my-2 mx-3">Version: {state.constants.version}</div>
      <div className="rounded px-3 px-2 border cursor-pointer m-1 flex-none self-center" onClick={() => {
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        console.log("SIGNED OUT");
        navigate('/');
      }}> Sign Out</div>
    </div>
  );
}

