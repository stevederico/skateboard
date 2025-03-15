import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import Layout from '@/skateboard-ui/Layout.jsx';
import LandingView from '@/skateboard-ui/LandingView.jsx'
import TextView from '@/skateboard-ui/TextView.jsx'
import SignUpView from '@/skateboard-ui/SignUpView.jsx'
import SignInView from '@/skateboard-ui/SignInView.jsx'
import StripeView from '@/skateboard-ui/StripeView.jsx'
import SettingsView from '@/skateboard-ui/SettingsView.jsx'
import NotFound from '@/skateboard-ui/NotFound.jsx'
import { ContextProvider } from './context.jsx';
import constants from "./constants.json"
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

createRoot(document.getElementById('root')).render(

    <ContextProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
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
          <Route path="/terms" element={<TextView details={constants.termsOfService} />} />
          <Route path="/privacy" element={<TextView details={constants.privacyPolicy} />} />
          <Route path="/eula" element={<TextView details={constants.EULA} />} />
          <Route path="/subs" element={<TextView details={constants.subscriptionDetails}/>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </ContextProvider>

);


