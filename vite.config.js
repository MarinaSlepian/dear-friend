import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const VALID_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
];

export default defineConfig(({ mode }) => {
  // loadEnv with '' prefix loads ALL vars from .env (including DEAR_FRIEND_API_KEY)
  // into process.env so the dev middleware can use them server-side.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      devApiPlugin(env),
      devTranscribePlugin(env),
      devTtsPlugin(env),
    ],
  };
});

// ── Dev-only plugin: handles POST /api/transcribe locally ───────────────────
function devTranscribePlugin(env) {
  return {
    name: 'dev-transcribe',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/transcribe', async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const apiKey = env.DEAR_FRIEND_OPENAI_KEY;
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DEAR_FRIEND_OPENAI_KEY not set in .env' }));
          return;
        }

        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
          const { audio, language } = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          const audioBuffer = Buffer.from(audio, 'base64');
          const blob = new Blob([audioBuffer], { type: 'audio/webm' });
          const form = new FormData();
          form.append('file', blob, 'audio.webm');
          form.append('model', 'whisper-1');
          if (language) form.append('language', language);

          const upstream = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form,
          });
          const data = await upstream.json();
          console.log(`[dev-transcribe] ✓ "${data.text?.slice(0, 60)}"`);
          res.writeHead(upstream.ok ? 200 : 502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(upstream.ok ? { text: data.text || '' } : { error: data.error?.message }));
        });
      });
    },
  };
}

// ── Dev-only plugin: handles POST /api/tts locally ──────────────────────────
function devTtsPlugin(env) {
  return {
    name: 'dev-tts',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

        const apiKey = env.DEAR_FRIEND_OPENAI_KEY;
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DEAR_FRIEND_OPENAI_KEY not set in .env' }));
          return;
        }

        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', async () => {
          const { text, voice = 'shimmer' } = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

          try {
            const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ model: 'tts-1', input: text, voice, response_format: 'mp3' }),
            });

            if (!upstream.ok) {
              const errText = await upstream.text().catch(() => '');
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: errText.slice(0, 200) }));
              return;
            }

            res.writeHead(200, { 'Content-Type': 'audio/mpeg' });
            const reader = upstream.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
            console.log(`[dev-tts] ✓ "${text.slice(0, 60)}"`);
          } catch (e) {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: e.message }));
            }
          }
        });
      });
    },
  };
}

// ── Dev-only plugin: handles POST /api/chat locally ─────────────────────────
// In production this route is handled by functions/chat.js via netlify.toml redirect.
function devApiPlugin(env) {
  return {
    name: 'dev-api',
    apply: 'serve', // only active during `vite dev`, not during build

    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405);
          res.end('Method Not Allowed');
          return;
        }

        const apiKey = env.DEAR_FRIEND_API_KEY;
        if (!apiKey) {
          console.error('\n[dev-api] ❌  DEAR_FRIEND_API_KEY is not set.');
          console.error('[dev-api]    Create a .env file in the project root:');
          console.error('[dev-api]    DEAR_FRIEND_API_KEY=sk-ant-...\n');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'DEAR_FRIEND_API_KEY not set in .env file' }));
          return;
        }

        // Collect body as Buffers to handle any encoding correctly
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('error', err => {
          console.error('[dev-api] request stream error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
        req.on('end', async () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');

          let parsed;
          try {
            parsed = JSON.parse(rawBody);
          } catch (parseErr) {
            console.error('[dev-api] JSON parse failed. Raw body was:', rawBody.slice(0, 200));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body: ' + parseErr.message }));
            return;
          }

          const { messages, systemPrompt, model } = parsed;
          if (!messages || !systemPrompt) {
            console.error('[dev-api] Missing fields. Keys received:', Object.keys(parsed));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Request missing messages or systemPrompt' }));
            return;
          }

          const resolvedModel = VALID_MODELS.includes(model) ? model : VALID_MODELS[0];
          console.log(`[dev-api] → ${resolvedModel} | messages: ${messages.length}`);

          try {
            const upstream = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type':      'application/json',
                'x-api-key':         apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-beta':    'prompt-caching-2024-07-31',
              },
              body: JSON.stringify({
                model:      resolvedModel,
                max_tokens: 512,
                stream:     true,
                system: [{
                  type:          'text',
                  text:          systemPrompt,
                  cache_control: { type: 'ephemeral' },
                }],
                messages,
              }),
            });

            if (!upstream.ok) {
              const errText = await upstream.text().catch(() => '');
              console.error(`[dev-api] Anthropic ${upstream.status}:`, errText);
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Anthropic ${upstream.status}: ${errText.slice(0, 200)}` }));
              return;
            }

            // Stream SSE directly to the browser
            res.writeHead(200, {
              'Content-Type':    'text/event-stream',
              'Cache-Control':   'no-cache',
              'Connection':      'keep-alive',
              'X-Accel-Buffering': 'no',
            });
            const reader = upstream.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
            res.end();
            console.log('[dev-api] ✓ stream complete');

          } catch (e) {
            console.error('[dev-api] fetch/parse exception:', e.name, e.message);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `${e.name}: ${e.message}` }));
            }
          }
        });
      });
    },
  };
}
