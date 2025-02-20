import { useNavigate } from 'react-router-dom';

export default function SettingsView() {
  const navigate = useNavigate()
  const toggleDarkMode = () => {
    document.body.classList.toggle('dark');
};
  return (
    <div className="flex flex-col">
      <div className="text-xl font-semibold my-3 mx-3">SettingsView</div>
      <div className="rounded px-3 border cursor-pointer m-1 flex-none self-center" onClick={toggleDarkMode}>
        Toggle Dark Mode
      </div>
      <div className="rounded px-3 px-2 border cursor-pointer m-1 flex-none self-center" onClick={() => {
        document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
        navigate('/');
      }}> Sign Out</div>
    </div>
  )
}

