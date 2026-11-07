import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { handleApiRequest, handleMcpRequest } from './functions/_lib/router';

function speakstackDevServerPlugin() {
  return {
    name: 'vite-plugin-speakstack-dev-server',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlStr = req.url || '';
        if (!urlStr.startsWith('/api') && !urlStr.startsWith('/mcp')) {
          return next();
        }

        try {
          const parsedUrl = new URL(urlStr, 'http://localhost:5173');
          const pathname = parsedUrl.pathname;
          const method = req.method?.toUpperCase() || 'GET';

          const buffers: Buffer[] = [];
          for await (const chunk of req) {
            buffers.push(Buffer.from(chunk));
          }
          const rawBody = Buffer.concat(buffers).toString('utf-8');

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
            else if (Array.isArray(v)) headers.set(k, v.join(', '));
          }

          const webRequest = new Request(parsedUrl.href, {
            method,
            headers,
            body: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && rawBody.length > 0 ? rawBody : null
          });

          const context = {
            request: webRequest,
            env: process.env
          };

          let webResponse: Response;
          if (pathname.startsWith('/mcp')) {
            const parts = pathname.slice('/mcp'.length).split('/').filter(Boolean);
            const routeSecret = parts[0] || '';
            webResponse = await handleMcpRequest(webRequest, context, routeSecret);
          } else {
            webResponse = await handleApiRequest(webRequest, context);
          }

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((val, key) => {
            res.setHeader(key, val);
          });

          const responseBuffer = Buffer.from(await webResponse.arrayBuffer());
          res.end(responseBuffer);
        } catch (err: any) {
          console.error('[SpeakStack Dev Server Error]:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [preact(), speakstackDevServerPlugin()],
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  }
});
