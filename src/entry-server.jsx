import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import { ContextProvider } from './context.jsx';
import { StaticRouter } from 'react-router-dom/server';
import App from './App.jsx';

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
  
  // Use StaticRouter to match client-side BrowserRouter
  const html = renderToString(
    <StrictMode>
      <ContextProvider initialState={initialState}>
        <StaticRouter location={url}>
          <App ssrUrl={url} />
        </StaticRouter>
      </ContextProvider>
    </StrictMode>
  );
  
  return { html, initialState };
} 