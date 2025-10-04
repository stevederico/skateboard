import { createRoot } from 'react-dom/client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { useEffect, useRef } from 'react';
import './assets/styles.css';
import LandingView from '@stevederico/skateboard-ui/LandingView';
import TextView from '@stevederico/skateboard-ui/TextView';
import SignUpView from '@stevederico/skateboard-ui/SignUpView';
import SignInView from '@stevederico/skateboard-ui/SignInView';
import PaymentView from '@stevederico/skateboard-ui/PaymentView';
import SettingsView from '@stevederico/skateboard-ui/SettingsView';
import NotFound from '@stevederico/skateboard-ui/NotFound';
import TabBar from '@stevederico/skateboard-ui/TabBar';
import { SidebarProvider, SidebarInset } from '@stevederico/skateboard-ui/shadcn/ui/sidebar';
import { getCurrentUser } from '@stevederico/skateboard-ui/Utilities';
import { ContextProvider, getState } from './context.jsx';
import constants from './constants.json';

import HomeView from './components/HomeView.jsx';
import ChatView from './components/ChatView.jsx';
import AppSidebar from './components/AppSidebar.jsx';
import SiteHeader from './components/SiteHeader.jsx';



const ProtectedRoute = () => {
  const auth = isAuthenticated();
  return auth ? <Outlet /> : <Navigate to="/signin" replace />;
};

function isAuthenticated() {
  // Check client-side noLogin flag first
  if (constants.noLogin === true) {
    return true;
  }
  // HttpOnly cookies can't be read by JavaScript
  // Server validates auth via cookie, so assume authenticated if CSRF token exists
  const appName = constants.appName || 'skateboard';
  const csrfKey = `${appName.toLowerCase().replace(/\s+/g, '-')}_csrf`;
  const csrfToken = localStorage.getItem(csrfKey);
  return Boolean(csrfToken);
}

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = getState();
  const fetchingRef = useRef(false);

  useEffect(() => {
    document.title = constants.appName;
  }, []);

  useEffect(() => {
    const isAppRoute = location.pathname.toLowerCase().includes('app');

    // Only fetch when entering app routes, not on every pathname change within app
    if (!isAppRoute) return;

    // Skip if we already have user data
    if (state.user && Object.keys(state.user).length > 0) return;

    // Skip if already fetching
    if (fetchingRef.current) return;

    const appStart = async () => {
      fetchingRef.current = true;
      // Always try to fetch user data regardless of noLogin // The server will allow the request through if noLogin is enabled on its side
      try {
        const data = await getCurrentUser();
        if (data) {
          dispatch({ type: 'SET_USER', payload: data });
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
        if (!constants.noLogin) {
          navigate('/signin');
        }
      } finally {
        fetchingRef.current = false;
      }
    };

    appStart();
  }, [location.pathname]);

  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        <Route path="/console" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="payment" element={<PaymentView />} />
        </Route>
      </Route>
      <Route path="/" element={<LandingView />} />
      <Route path="/signin" element={<SignInView />} />
      <Route path="/signup" element={<SignUpView />} />
      <Route
        path="/terms"
        element={<TextView details={constants.termsOfService} />}
      />
      <Route
        path="/privacy"
        element={<TextView details={constants.privacyPolicy} />}
      />
      <Route path="/eula" element={<TextView details={constants.EULA} />} />
      <Route
        path="/subs"
        element={<TextView details={constants.subscriptionDetails} />}
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const DashboardLayout = () => {
  useEffect(() => {
    const root = document.documentElement;
    let theme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (!theme) {
      theme = systemPrefersDark ? 'dark' : 'light';
    }

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, []);

  return (
    <SidebarProvider
      style={{
        "--sidebar-width": "calc(var(--spacing) * 72)",
      }}
    >
      {!constants.hideSidebar && <AppSidebar variant="inset" />}
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <Outlet />
        </div>
      </SidebarInset>
      <TabBar className="md:hidden" />
    </SidebarProvider>
  );
};

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ContextProvider>
    <Router>
      <App />
    </Router>
  </ContextProvider>
);
