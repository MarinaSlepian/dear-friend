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
    ],
  };
});

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

            const data = await upstream.json();
            const text = data.content?.[0]?.text;
            console.log(`[dev-api] ✓ reply (${text?.length ?? 0} chars)`);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ text }));

          } catch (e) {
            console.error('[dev-api] fetch/parse exception:', e.name, e.message);
            console.error(e.stack);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `${e.name}: ${e.message}` }));
          }
        });
      });
    },
  };
}
