import { useLocation } from "react-router-dom";
import ThemeToggle from '@stevederico/skateboard-ui/ThemeToggle';
import constants from "../constants.json";

export default function SiteHeader({ title }) {
  const location = useLocation();

  // Get page title from location
  const getPageTitle = () => {
    if (title) return title;

    const path = location.pathname.split('/').filter(Boolean).pop();
    if (path === 'dashboard') return 'Dashboard';
    if (path === 'chat') return 'Chat';
    if (path === 'settings') return 'Settings';
    if (path === 'payment') return 'Payment';

    return constants.appName;
  };

  // Check if current page is Settings
  const isSettingsPage = location.pathname.includes('/settings');

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="text-base font-medium">{getPageTitle()}</h1>
        {isSettingsPage && (
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        )}
      </div>
    </header>
  );
}
