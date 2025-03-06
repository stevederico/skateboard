import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createServer as createViteServer } from 'npm:vite@6.1.0';
import fs from 'node:fs';

// Create a simple dev server for SSR
const PORT = 3002;

// Create Vite dev server
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'custom',
  optimizeDeps: {
    include: ['react-router-dom']
  }
});

// Handle requests
async function handler(req) {
  const url = new URL(req.url);
  
  try {
    // 1. Read index.html
    let template = fs.readFileSync('./index.html', 'utf-8');
    
    // 2. Apply Vite HTML transforms
    template = await vite.transformIndexHtml(url.pathname, template);
    
    // For API or assets, let vite handle it
    if (url.pathname.startsWith('/api') || 
        url.pathname.includes('.') ||
        url.pathname.startsWith('/@')) {
      return new Response("Not found", { status: 404 });
    }
    
    // Try server rendering, but fall back to client-side rendering if it fails
    try {
      // 3. Load the server entry point
      const { render } = await vite.ssrLoadModule('/src/entry-server.jsx');
      
      // 4. Render app
      const { html: appHtml, initialState } = await render(url.pathname);
      
      // 5. Inject app and state
      const html = template
        .replace(`<div id="root"></div>`, `<div id="root">${appHtml}</div>`)
        .replace('<!--app-state-->', 
          `<script>window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};</script>`);
      
      // 6. Return response
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    } catch (e) {
      // If SSR fails, fall back to client-side rendering
      console.error("SSR failed, falling back to client-side rendering:", e);
      
      // Client-side only rendering
      const html = template
        .replace('<!--app-state-->', 
          `<script>window.__INITIAL_STATE__ = ${JSON.stringify({ user: null })};</script>`);
      
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      });
    }
  } catch (e) {
    console.error("Server error:", e);
    return new Response(`Server Error: ${e.message}`, { status: 500 });
  }
}

// Start server
console.log(`Server running at http://localhost:${PORT}`);
await serve(handler, { port: PORT }); 