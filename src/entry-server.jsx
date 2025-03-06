import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';
import { ContextProvider } from './context.jsx';

// A simple mock for react-router
const MockRouter = ({ children }) => children;

export async function render(url) {
  // Create initial context state for SSR
  const initialState = {
    user: null
  };
  
  // Server rendering with a simplified approach
  const html = renderToString(
    <ContextProvider initialState={initialState}>
      {/* We'll only pre-render the shell without router */}
      {/* Client-side hydration will handle the actual routing */}
      <div data-ssr-path={url}>
        <MockRouter>
          <App />
        </MockRouter>
      </div>
    </ContextProvider>
  );
  
  return { html, initialState };
} 