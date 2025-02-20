import { useNavigate } from 'react-router-dom';
import { getState } from '../../context.jsx';

export default function SettingsView() {
  const navigate = useNavigate();
  const { state } = getState();

  const toggleDarkMode = () => {
    document.body.classList.toggle('dark');
  };

  return (
    <>
      <div className="text-xl font-semibold mb-3">SettingsView</div>
      <div className="flex flex-col items-center justify-center">
        <div className="rounded px-3 border cursor-pointer m-1" onClick={toggleDarkMode}> Toggle Dark Mode</div>
        <div className="rounded px-3 px-2 border cursor-pointer m-1" onClick={() => {
          document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
          navigate('/');
        }}> Sign Out</div>
        <div className="text-sm my-2">{state.constants.version}</div>
      </div>
    </>

  );
}

