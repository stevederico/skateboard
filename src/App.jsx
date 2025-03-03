import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from '@/starter-components/Layout.jsx';
import HomeView from './components/HomeView.jsx'
import OtherView from './components/OtherView.jsx'
import LandingView from '@/starter-components/LandingView.jsx'
import TextView from '@/starter-components/TextView.jsx'
import SignUpView from '@/starter-components/SignUpView.jsx'
import SignInView from '@/starter-components/SignInView.jsx'
import SettingsView from '@/starter-components/SettingsView.jsx'
import NotFound from '@/starter-components/NotFound.jsx'
import constants from "./constants.json"

const c = { ...constants };

const ProtectedRoute = () => {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
};

function isAuthenticated() {
  // For SSR, avoid accessing document directly
  try {
    if (typeof window === 'undefined') return false;
    
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1];
    return Boolean(token);
  } catch (e) {
    return false;
  }
}

export default function App({ ssrUrl }) {
  // If server-side rendering and not on landing page, render a simple view
  // that will be replaced on client hydration to avoid router errors
  if (ssrUrl && ssrUrl !== '/' && typeof window === 'undefined') {
    return <div className="ssr-placeholder">Loading...</div>;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomeView />} />
          <Route path="other" element={<OtherView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Route>
      <Route path="/" element={<LandingView />} />
      <Route path="/signin" element={<SignInView />} />
      <Route path="/signup" element={<SignUpView />} />
      <Route path="/terms" element={<TextView details={c.terms_of_service} />} />
      <Route path="/privacy" element={<TextView details={c.privacyPolicy} />} />
      <Route path="/eula" element={<TextView details={c.EULA} />} />
      <Route path="/subs" element={<TextView details={c.subscriptionDetails}/>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
} 