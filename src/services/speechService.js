// ── SpeechRecognition ─────────────────────────────────────────────────────

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// Pre-warm voice cache before any user interaction to avoid breaking the
// browser's user-gesture requirement when speak() awaits loadVoices().
export function preloadVoices() {
  if (window.speechSynthesis) loadVoices();
}

export const isSpeechRecognitionSupported = () => Boolean(SR);

let activeRecognition = null;

export function startListening({ language, onResult, onError, onEnd }) {
  if (!SR) { onError?.('not-supported'); return; }

  stopListening();

  const rec = new SR();
  rec.lang = language === 'he' ? 'he-IL' : 'ru-RU';
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = e => {
    const transcript = e.results[0]?.[0]?.transcript?.trim();
    if (transcript) onResult?.(transcript);
  };

  rec.onerror = e => {
    // Don't null activeRecognition here — onend always fires after onerror
    // and handleRecognitionEnd is the single place that restarts listening.
    // Nulling here + restarting in onerror causes a double-restart loop.
    onError?.(e.error);
  };

  rec.onend = () => {
    activeRecognition = null;
    onEnd?.();
  };

  activeRecognition = rec;
  try {
    rec.start();
  } catch (e) {
    activeRecognition = null;
    onError?.(e.message);
  }
}

export function stopListening() {
  if (activeRecognition) {
    try { activeRecognition.abort(); } catch {}
    activeRecognition = null;
  }
}

// ── SpeechSynthesis ───────────────────────────────────────────────────────

let voicesCache = null;

function loadVoices() {
  return new Promise(resolve => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { voicesCache = v; resolve(v); return; }
    const handler = () => {
      voicesCache = window.speechSynthesis.getVoices();
      resolve(voicesCache);
    };
    window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}

function pickVoice(voices, language) {
  const langCode   = language === 'he' ? 'he-IL' : 'ru-RU';
  const langPrefix = language === 'he' ? 'he'    : 'ru';

  // Narrow to voices for this language
  const pool = voices.filter(
    v => v.lang === langCode || v.lang.toLowerCase().startsWith(langPrefix)
  );
  if (pool.length === 0) return null;

  // 1. Google neural voices — best quality, available in Chrome
  //    e.g. "Google русский", "Google עברית"
  const google = pool.find(v => v.name.toLowerCase().includes('google'));
  if (google) return google;

  // 2. Any cloud/online voice (localService === false means it streams from the OS cloud)
  const online = pool.find(v => v.localService === false);
  if (online) return online;

  // 3. Known high-quality named voices
  const preferred = language === 'he'
    ? ['tamar', 'carmit', 'yoav', 'meital']          // macOS Hebrew neural voices
    : ['milena', 'irina', 'katya', 'svetlana', 'александра', 'алена'];  // macOS / Win
  const named = pool.find(v =>
    preferred.some(n => v.name.toLowerCase().includes(n))
  );
  if (named) return named;

  // 4. Exact language-code match
  const exact = pool.find(v => v.lang === langCode);
  if (exact) return exact;

  // 5. Any available voice for this language
  return pool[0];
}

export async function speak({ text, language, onEnd, onError }) {
  if (!text || !window.speechSynthesis) { onEnd?.(); return; }

  window.speechSynthesis.cancel();

  const voices = voicesCache ?? await loadVoices();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang   = language === 'he' ? 'he-IL' : 'ru-RU';
  utterance.rate   = 0.82;   // slightly slower = more relaxed, less robotic
  utterance.pitch  = 0.95;   // just below neutral — warmer, less clipped
  utterance.volume = 1.0;

  const voice = pickVoice(voices, language);
  if (voice) {
    utterance.voice = voice;
    console.log(`[TTS] voice: "${voice.name}" | lang: ${voice.lang} | local: ${voice.localService}`);
  } else {
    console.warn('[TTS] no matching voice found, using browser default');
  }

  // Chrome stops synthesis after ~15s — periodic resume() works around it
  const resumeTimer = setInterval(() => {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 8000);

  // Safety net: if onend never fires (known Chrome bug), unblock the session
  const wordCount = text.split(/\s+/).length;
  const fallbackMs = Math.max(15000, wordCount * 700);
  let ended = false;
  const fallbackTimer = setTimeout(() => {
    if (!ended) { ended = true; clearInterval(resumeTimer); onEnd?.(); }
  }, fallbackMs);

  utterance.onend = () => {
    if (ended) return;
    ended = true;
    clearInterval(resumeTimer);
    clearTimeout(fallbackTimer);
    onEnd?.();
  };
  utterance.onerror = e => {
    if (ended) return;
    ended = true;
    clearInterval(resumeTimer);
    clearTimeout(fallbackTimer);
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      onError?.(e.error);
    }
    // Always call onEnd so the session can continue
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
