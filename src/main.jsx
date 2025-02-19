import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import "./assets/bootstrap-icons/bootstrap-icons.min.css"
import DemoApp from './components/DemoApp.jsx'
import NotFound from './components/NotFound.jsx'

import { ContextProvider } from './context.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<DemoApp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </ContextProvider>
  </StrictMode>,
);
