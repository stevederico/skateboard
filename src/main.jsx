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
import OtherView from './components/OtherView.jsx'

const ProtectedRoute = () => {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
};

function isAuthenticated() {
  try {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1];
    return Boolean(token);
  } catch (e) {
    return false;
  }
}

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, dispatch } = getState();

  useEffect(() => {
    document.title = constants.appName;

    const appStart = async () => {
      if (location.pathname.toLowerCase().includes('app')) {
        console.log('App Start in /app');
        const localUser = localStorage.getItem('user');
        if (localUser) {
          try {
            console.log('APP START - Fetching user');
            const data = await getCurrentUser();
            if (data) {
              dispatch({ type: 'SET_USER', payload: data });
            } else {
              navigate('/signin');
            }
          } catch (error) {
            console.error('Failed to fetch user:', error);
          }
        } else {
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
              <Route path="other" element={<OtherView />} />
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
