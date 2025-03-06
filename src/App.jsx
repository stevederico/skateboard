import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import Layout from '@/skateboard-ui/Layout.jsx';
import HomeView from './components/HomeView.jsx';
import OtherView from './components/OtherView.jsx';
import LandingView from '@/skateboard-ui/LandingView.jsx';
import TextView from '@/skateboard-ui/TextView.jsx';
import SignUpView from '@/skateboard-ui/SignUpView.jsx';
import SignInView from '@/skateboard-ui/SignInView.jsx';
import SuccessView from '@/skateboard-ui/StripeView.jsx';
import SettingsView from '@/skateboard-ui/SettingsView.jsx';
import NotFound from '@/skateboard-ui/NotFound.jsx';
import constants from "./constants.json";
import { getState } from './context.jsx';

const c = { ...constants };

// Simple auth check that works on both server and client
const ProtectedRoute = () => {
  // During SSR, we'll always redirect to login (real check happens on client)
  const isServer = typeof window === 'undefined';
  const isAuthenticated = isServer 
    ? false 
    : Boolean(document.cookie.split('; ').find(row => row.startsWith('token=')));

  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
};

// First check if we're in a browser or server environment
const isBrowser = typeof window !== 'undefined';

export default function App() {
  // If rendering on the server, render a placeholder 
  // React Router hooks can't be used outside Router context
  if (!isBrowser) {
    return <div id="ssr-placeholder">Loading...</div>;
  }
  
  // Below only runs in the browser
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="other" element={<OtherView />} />
          <Route path="settings" element={<SettingsView />} />
          <Route path="stripe" element={<SuccessView />} />
        </Route>
      </Route>
      <Route path="/" element={<LandingView />} />
      <Route path="/signin" element={<SignInView />} />
      <Route path="/signup" element={<SignUpView />} />
      <Route path="/terms" element={<TextView details={c.termsOfService} />} />
      <Route path="/privacy" element={<TextView details={c.privacyPolicy} />} />
      <Route path="/eula" element={<TextView details={c.EULA} />} />
      <Route path="/subs" element={<TextView details={c.subscriptionDetails}/>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
} 