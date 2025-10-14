import { createRoot } from 'react-dom/client';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
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
import SignOutView from '@stevederico/skateboard-ui/SignOutView';
import PaymentView from '@stevederico/skateboard-ui/PaymentView';
import SettingsView from '@stevederico/skateboard-ui/SettingsView';
import NotFound from '@stevederico/skateboard-ui/NotFound';
import ProtectedRoute from '@stevederico/skateboard-ui/ProtectedRoute';
import { useAppSetup, isAuthenticated, getCSRFToken, getAppKey } from '@stevederico/skateboard-ui/Utilities';
import { ContextProvider, getState } from './context.jsx';
import constants from './constants.json';

import HomeView from './components/HomeView.jsx'
import ChatView from './components/ChatView.jsx'

const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { dispatch } = getState();

  useEffect(() => {
    document.title = constants.appName;
  }, []);

  useAppSetup(location, navigate, dispatch);

  return (
    <Routes>
      <Route element={<Layout />}>
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
      <Route path="/signout" element={<SignOutView />} />
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
