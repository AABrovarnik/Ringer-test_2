import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;
  const RENDER_BACKEND_URL = 'https://dz-10-2-1.onrender.com/analyze';

  // GLOBAL LOGGER: See every request
  app.use((req, res, next) => {
    console.log(`[Incoming Request] ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Proxy Endpoint with unique name
  app.post('/proxy-analyze', upload.any(), async (req, res) => {
    console.log(`[Proxy] Handling analysis request at ${new Date().toISOString()}...`);
    
    const maxRetries = 10;
    let attempt = 0;

    const performRequest = async () => {
      attempt++;
      try {
        const formData = new FormData();
        
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
          const file = req.files[0] as Express.Multer.File;
          const blob = new Blob([file.buffer], { type: file.mimetype });
          formData.append('file', blob, file.originalname);
          console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Appending file: ${file.originalname} (${file.size} bytes)`);
        }

        if (req.body.text) {
          formData.append('text', req.body.text);
          console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Appending text: ${req.body.text.slice(0, 50)}...`);
        }
        
        if (req.body.criteria) {
          formData.append('criteria', req.body.criteria);
        }

        const key = process.env.UI_OPENAI_KEY;
        if (key) {
          formData.append('UI_OPENAI_KEY', key);
          formData.append('OPENAI_API_KEY', key);
        }

        console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Forwarding to Render: ${RENDER_BACKEND_URL}`);

        // Long timeout for audio analysis (5 minutes)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        const response = await fetch(RENDER_BACKEND_URL, {
          method: 'POST',
          body: formData,
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          redirect: 'follow',
          signal: controller.signal as any
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Status: ${response.status}, Type: ${contentType}`);

        if (contentType.includes('application/json')) {
          const data = await response.json();
          return { status: 'success', statusCode: response.status, data };
        } else {
          const text = await response.text();
          const isPlaceholder = text.includes('Starting Server') || text.includes('Render') || text.includes('Booting');
          
          // If we got HTML on an API route, it's almost certainly the server booting or an error
          if (attempt < maxRetries && (response.status >= 500 || isPlaceholder || response.status === 200)) {
             console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Received placeholder HTML. Waiting 6s for backend to wake up...`);
             await new Promise(r => setTimeout(r, 6000));
             return performRequest();
          }
          return { status: 'non-json', statusCode: response.status, text };
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          return { status: 'error', message: 'Request to Render backend timed out after 5 minutes.' };
        }
        if (attempt < maxRetries) {
          console.log(`[Proxy][Attempt ${attempt}/${maxRetries}] Network error. Retrying in 6s... Error: ${error.message}`);
          await new Promise(r => setTimeout(r, 6000));
          return performRequest();
        }
        throw error;
      }
    };

    try {
      const result = await performRequest();
      if (result.status === 'success') {
        res.status(result.statusCode).json(result.data);
      } else if (result.status === 'non-json') {
        console.error(`[Proxy Error] Non-JSON from Render after ${attempt} attempts. Body: ${result.text?.slice(0, 200)}`);
        res.status(result.statusCode).send(result.text);
      } else {
        res.status(504).json({ status: 'error', message: result.message });
      }
    } catch (error) {
      console.error('[Proxy Fatal Error]:', error);
      res.status(500).json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Internal server error during analyzer proxy' 
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
