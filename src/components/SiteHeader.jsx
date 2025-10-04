import { useLocation } from "react-router-dom";
import ThemeToggle from '@stevederico/skateboard-ui/ThemeToggle';
import constants from "../constants.json";

export default function SiteHeader({ title, usageInfo, onUpgradeClick }) {
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

  // Check if current page is Settings or Chat
  const isSettingsPage = location.pathname.includes('/settings');
  const isChatPage = location.pathname.includes('/chat');

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center justify-between gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="text-base font-medium">{getPageTitle()}</h1>
        <div className="flex items-center gap-2">
          {isChatPage && usageInfo && !usageInfo.isSubscriber && usageInfo.remaining >= 0 && (
            <button
              onClick={onUpgradeClick}
              className="cursor-pointer text-sm border border-border rounded-full px-3 py-1 hover:bg-accent"
            >
              {usageInfo.remaining} remaining
            </button>
          )}
          {isSettingsPage && (
            <ThemeToggle />
          )}
        </div>
      </div>
    </header>
  );
}
