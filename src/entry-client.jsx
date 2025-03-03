import { StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom';
import './assets/styles.css'
import App from './App';
import { ContextProvider } from './context.jsx';

// Get initial state from server or use empty object
const initialState = window.__INITIAL_STATE__ || {};
const ssrUrl = initialState.url || window.location.pathname;
console.log('Hydrating with initial state:', initialState);

// Get the root element
const root = document.getElementById('root');

// Hydrate the app
hydrateRoot(
  root,
  <StrictMode>
    <ContextProvider initialState={initialState}>
      <Router>
        <App ssrUrl={ssrUrl} />
      </Router>
    </ContextProvider>
  </StrictMode>
); 