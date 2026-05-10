import { SYSTEM_PROMPT_RU, SYSTEM_PROMPT_HE } from '../constants/prompts.js';
import { buildMemoryContext } from './memoryService.js';
import { loadReminders, buildRemindersText } from './reminderService.js';
import { loadPersonalInfo, buildPersonalContext } from './personalInfoService.js';

export const MODELS = {
  fast:  'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-6',
};

// Split accumulated text into complete sentences, returning [sentences[], remainder].
// Handles .!?… followed by whitespace or end-of-string.
function extractSentences(text) {
  const sentences = [];
  let remaining = text;
  const re = /[.!?…]+(?=\s|$)/g;
  let match;
  let lastEnd = 0;

  while ((match = re.exec(remaining)) !== null) {
    const end = match.index + match[0].length;
    const sentence = remaining.slice(lastEnd, end).trim();
    if (sentence) sentences.push(sentence);
    lastEnd = end;
    // skip leading whitespace for next search
    while (lastEnd < remaining.length && remaining[lastEnd] === ' ') lastEnd++;
    re.lastIndex = lastEnd;
  }

  return [sentences, remaining.slice(lastEnd).trimStart()];
}

// onSentence(text) — called for each complete sentence as the stream arrives
// onComplete(fullText) — called once when the stream ends with the full response
export async function sendMessage({ messages, name, language, modelKey, onSentence, onComplete }) {
  const memoryContext   = buildMemoryContext(language);
  const reminders       = loadReminders();
  const remindersText   = buildRemindersText(reminders, language);
  const personalInfo    = loadPersonalInfo();
  const personalContext = buildPersonalContext(personalInfo, language);

  const now = new Date();
  const dateTimeStr = now.toLocaleString(language === 'he' ? 'he-IL' : 'ru-RU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const systemPrompt = (language === 'he'
    ? SYSTEM_PROMPT_HE(name, memoryContext, remindersText, personalContext)
    : SYSTEM_PROMPT_RU(name, memoryContext, remindersText, personalContext))
    + (language === 'he'
      ? `\n\nתאריך ושעה נוכחיים: ${dateTimeStr}`
      : `\n\nТЕКУЩАЯ ДАТА И ВРЕМЯ: ${dateTimeStr}`);

  const res = await fetch('/api/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      systemPrompt,
      model: MODELS[modelKey] || MODELS.fast,
    }),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error; } catch { try { detail = await res.text(); } catch {} }
    console.error(`[aiService] HTTP ${res.status}:`, detail);
    throw new Error(`API_ERROR:${res.status}${detail ? ' — ' + detail : ''}`);
  }

  // ── Parse Claude SSE stream ───────────────────────────────────────────────
  const reader    = res.body.getReader();
  const decoder   = new TextDecoder();
  let sseBuffer   = '';
  let textBuffer  = ''; // accumulates partial sentence
  let fullText    = '';
  let eventName   = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop(); // keep any incomplete line

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventName = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') { eventName = ''; continue; }

      try {
        const parsed = JSON.parse(data);
        if (eventName === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          const chunk = parsed.delta.text || '';
          fullText   += chunk;
          textBuffer += chunk;

          const [sentences, remainder] = extractSentences(textBuffer);
          textBuffer = remainder;
          for (const s of sentences) onSentence?.(s);
        }
      } catch {}

      eventName = '';
    }
  }

  // Flush any remaining text that didn't end with punctuation
  const tail = textBuffer.trim();
  if (tail) onSentence?.(tail);

  if (!fullText) throw new Error('Empty response from AI');
  onComplete?.(fullText);
}
