import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import "./assets/bootstrap-icons/bootstrap-icons.min.css"
import Layout from '@/starter-components/Layout.jsx';
import MainView from './components/MainView.jsx'
import OtherView from './components/OtherView.jsx'
import LandingView from '@/starter-components/LandingView.jsx'
import TextView from '@/starter-components/TextView.jsx'
import SignUpView from '@/starter-components/SignUpView.jsx'
import SignInView from '@/starter-components/SignInView.jsx'
import SettingsView from '@/starter-components/SettingsView.jsx'
import NotFound from '@/starter-components/NotFound.jsx'
import { ContextProvider } from './context.jsx';
import constants from "./constants.json"

const c = { ...constants };
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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ContextProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/app" element={<ProtectedRoute />}>
              <Route index element={<Navigate to="main" replace />} />
              <Route path="main" element={<MainView />} />
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
      </Router>
    </ContextProvider>
  </StrictMode>,
);


