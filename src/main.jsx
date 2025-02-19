import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import "./assets/bootstrap-icons/bootstrap-icons.min.css"
import Layout from './components/Layout.jsx';
import MainView from './components/MainView.jsx'
import OtherView from './components/OtherView.jsx'
import LandingView from './components/LandingView.jsx'
import NotFound from './components/NotFound.jsx'
import { ContextProvider } from './context.jsx';
import { getState } from './context.jsx'

const ProtectedRoute = () => {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }
  return <Outlet />;
};


function isAuthenticated(){
  const { state } = getState(); // Destructure state and dispatch from the context
  return Boolean(localStorage.getItem(`${state.constants.appURL}_TOKEN`));
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
              <Route path="settings" element={<NotFound />} />
            </Route>
          </Route>
          <Route path="/" element={<LandingView />} />
          <Route path="*" element={<NotFound />} />





        </Routes>
      </Router>
    </ContextProvider>
  </StrictMode>,
);


