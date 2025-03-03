import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { ContextProvider } from './context.jsx';

// Simple SSR component that doesn't depend on external modules
const SSRShell = () => {
  return (
    <div className="ssr-shell">
    </div>
  );
};

export async function render(url) {
  // Create initial state that will be transferred to client
  const initialState = {
    url,
    serverRendered: true,
    timestamp: Date.now()
  };
  
  // Only render a minimal app shell for SSR to avoid router issues
  // The client will handle full routing after hydration
  const html = renderToString(
    <StrictMode>
      <ContextProvider initialState={initialState}>
        <div id="ssr-app">
          <SSRShell />
        </div>
      </ContextProvider>
    </StrictMode>
  );
  
  return { html, initialState };
} 