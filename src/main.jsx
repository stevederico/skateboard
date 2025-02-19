import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import './assets/styles.css'
import DemoApp from './components/DemoApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
