// Netlify serverless function — proxies audio to OpenAI Whisper.
// Endpoint: POST /api/transcribe  (mapped via netlify.toml redirect)

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

  const { audio, language } = body;
  if (!audio) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing audio field' }) };
  }

  const audioBuffer = Buffer.from(audio, 'base64');
  const blob = new Blob([audioBuffer], { type: 'audio/webm' });

  const form = new FormData();
  form.append('file', blob, 'audio.webm');
  form.append('model', 'whisper-1');
  if (language) form.append('language', language);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`Whisper API error ${response.status}:`, errText);
      return { statusCode: 502, body: JSON.stringify({ error: `Whisper error: ${errText.slice(0, 200)}` }) };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: data.text || '' }),
    };
  } catch (err) {
    console.error('Transcribe function exception:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
