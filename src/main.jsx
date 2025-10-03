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
import { useEffect } from 'react';
import './assets/styles.css';
import Layout from '@stevederico/skateboard-ui/Layout';
import LandingView from '@stevederico/skateboard-ui/LandingView';
import TextView from '@stevederico/skateboard-ui/TextView';
import SignUpView from '@stevederico/skateboard-ui/SignUpView';
import SignInView from '@stevederico/skateboard-ui/SignInView';
import StripeView from '@stevederico/skateboard-ui/StripeView';
import SettingsView from '@stevederico/skateboard-ui/SettingsView';
import NotFound from '@stevederico/skateboard-ui/NotFound';
import { getCurrentUser } from '@stevederico/skateboard-ui/Utilities';
import { ContextProvider, getState } from './context.jsx';
import constants from './constants.json';

import HomeView from './components/HomeView.jsx'
import ChatView from './components/ChatView.jsx'



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

  useEffect(() => {
    document.title = constants.appName;
    const appStart = async () => {
      if (!location.pathname.toLowerCase().includes('app')) {
        return;
      }

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
      }
    };

    appStart();
  }, [location.pathname, navigate, dispatch]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/console" element={<Navigate to="/app" replace />} />
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="chat" element={<ChatView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="stripe" element={<StripeView />} />
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

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <ContextProvider>
    <Router>
      <App />
    </Router>
  </ContextProvider>
);
