// Netlify serverless function — keeps DEAR_FRIEND_API_KEY out of the browser.
// Endpoint: POST /api/chat  (mapped via netlify.toml redirect)

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.DEAR_FRIEND_API_KEY;
  if (!apiKey) {
    console.error('DEAR_FRIEND_API_KEY environment variable is not set');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { messages, systemPrompt, model } = body;
  if (!messages || !systemPrompt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const VALID_MODELS = [
    'claude-haiku-4-5-20251001',
    'claude-sonnet-4-6',
  ];
  const resolvedModel = VALID_MODELS.includes(model) ? model : VALID_MODELS[0];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':  'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model:      resolvedModel,
        max_tokens: 512,
        system: [
          {
            type:          'text',
            text:          systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Anthropic API error ${response.status}:`, errText);
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'Upstream API error' }),
      };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;

    if (!text) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Empty response from AI' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    };

  } catch (err) {
    console.error('Chat function exception:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
