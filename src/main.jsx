import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import "./assets/bootstrap-icons/bootstrap-icons.min.css"
import Layout from './components/Layout.jsx';
import MainView from './components/MainView.jsx'
import OtherView from './components/OtherView.jsx'
import LandingView from './components/LandingView.jsx'
import TextView from './components/TextView.jsx'
import SignUpView from './components/SignUpView.jsx'
import SignInView from './components/SignInView.jsx'
import SettingsView from './components/SettingsView.jsx'
import NotFound from './components/NotFound.jsx'
import { ContextProvider } from './context.jsx';

const ProtectedRoute = () => {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
};

function isAuthenticated() {
  const token = document.cookie.split('; ').find(row => row.startsWith('token='))?.split('=')[1] || null;
  console.log("TOKEN: ", token)
  return Boolean(token);
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
          <Route path="/terms" element={<TextView />} />
          <Route path="/privacy" element={<TextView />} />
          <Route path="/eula" element={<TextView />} />
          <Route path="/subs" element={<TextView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </ContextProvider>
  </StrictMode>,
);


