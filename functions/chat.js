// Netlify Function v2 — streams Claude SSE directly to the client so TTS
// can start on the first sentence while the rest of the response generates.

const VALID_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
];

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const apiKey = process.env.DEAR_FRIEND_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, systemPrompt, model } = body;
  if (!messages || !systemPrompt) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const resolvedModel = VALID_MODELS.includes(model) ? model : VALID_MODELS[0];

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
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error(`Anthropic API error ${upstream.status}:`, errText);
      return new Response(
        JSON.stringify({ error: 'Upstream API error' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Forward Claude's SSE stream directly to the browser
    return new Response(upstream.body, {
      headers: {
        'Content-Type':    'text/event-stream',
        'Cache-Control':   'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (err) {
    console.error('Chat function exception:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
