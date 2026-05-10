// Netlify serverless function — proxies text to OpenAI TTS.
// Endpoint: POST /api/tts  (mapped via netlify.toml redirect)

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.DEAR_FRIEND_OPENAI_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'DEAR_FRIEND_OPENAI_KEY not set' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { text, voice = 'shimmer' } = body;
  if (!text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text field' }) };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`TTS API error ${response.status}:`, errText);
      return { statusCode: 502, body: JSON.stringify({ error: `TTS error: ${errText.slice(0, 200)}` }) };
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'audio/mpeg' },
      body: audioBuffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error('TTS function exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
