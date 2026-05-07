import { SYSTEM_PROMPT_RU, SYSTEM_PROMPT_HE } from '../constants/prompts.js';
import { buildMemoryContext } from './memoryService.js';
import { loadReminders, buildRemindersText } from './reminderService.js';
import { loadPersonalInfo, buildPersonalContext } from './personalInfoService.js';

export const MODELS = {
  fast:  'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-6',
};

export async function sendMessage({ messages, name, language, modelKey }) {
  const memoryContext   = buildMemoryContext(language);
  const reminders       = loadReminders();
  const remindersText   = buildRemindersText(reminders, language);
  const personalInfo    = loadPersonalInfo();
  const personalContext = buildPersonalContext(personalInfo, language);

  const systemPrompt = language === 'he'
    ? SYSTEM_PROMPT_HE(name, memoryContext, remindersText, personalContext)
    : SYSTEM_PROMPT_RU(name, memoryContext, remindersText, personalContext);

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
    // Read the error body so the real reason is visible in the browser console
    let detail = '';
    try { detail = (await res.json()).error; } catch { try { detail = await res.text(); } catch {} }
    console.error(`[aiService] HTTP ${res.status}:`, detail);
    throw new Error(`API_ERROR:${res.status}${detail ? ' — ' + detail : ''}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}
