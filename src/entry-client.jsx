import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import { ContextProvider } from './context.jsx';
import './assets/styles.css';

// Get the server-rendered state
const initialState = window.__INITIAL_STATE__ || { user: null };

// Get the path from SSR if available
const ssrPathElement = document.querySelector('[data-ssr-path]');
const ssrPath = ssrPathElement ? ssrPathElement.getAttribute('data-ssr-path') : '/';

hydrateRoot(
  document.getElementById('root'),
  <StrictMode>
    <ContextProvider initialState={initialState}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ContextProvider>
  </StrictMode>
); 