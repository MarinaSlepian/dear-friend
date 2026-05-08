// ── Speech-to-text via MediaRecorder + OpenAI Whisper ────────────────────
// Replaces browser SpeechRecognition (which fails with `network` errors on
// production HTTPS due to Chrome routing audio through Google's servers).

export const isSpeechRecognitionSupported = () =>
  Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

let activeSession = null;

export async function startListening({ language, onResult, onError, onEnd }) {
  stopListening();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    onError?.('not-allowed');
    onEnd?.();
    return;
  }

  const langCode = language === 'he' ? 'he' : 'ru';
  const mimeType = getSupportedMimeType();

  const audioCtx = new AudioContext();
  const source   = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;
  source.connect(analyser);

  const freqData = new Uint8Array(analyser.frequencyBinCount);

  let isActive      = true;
  let speaking      = false;
  let silenceTimer  = null;
  let recorder      = null;
  let chunks        = [];

  function startRecording() {
    chunks   = [];
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      if (!isActive || chunks.length === 0) return;
      submitAudio(chunks, mimeType, langCode, onResult, onError, onEnd);
    };
    recorder.start(100);
    speaking = true;
  }

  function stopRecording() {
    speaking = false;
    clearTimeout(silenceTimer);
    if (recorder?.state === 'recording') recorder.stop();
  }

  const SPEECH_THRESHOLD = 15;  // out of 255 average frequency amplitude
  const SILENCE_MS       = 1500; // ms of quiet before phrase ends

  const vadInterval = setInterval(() => {
    if (!isActive) return;
    analyser.getByteFrequencyData(freqData);
    const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;

    if (avg > SPEECH_THRESHOLD) {
      if (!speaking) startRecording();
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        if (speaking && isActive) stopRecording();
      }, SILENCE_MS);
    }
  }, 80);

  activeSession = {
    stop() {
      isActive = false;
      clearInterval(vadInterval);
      clearTimeout(silenceTimer);
      try { if (recorder?.state === 'recording') recorder.stop(); } catch {}
      try { stream.getTracks().forEach(t => t.stop()); } catch {}
      try { audioCtx.close(); } catch {}
    },
  };
}

export function stopListening() {
  if (activeSession) {
    activeSession.stop();
    activeSession = null;
  }
}

async function submitAudio(chunks, mimeType, language, onResult, onError, onEnd) {
  const blob   = new Blob(chunks, { type: mimeType || 'audio/webm' });
  const base64 = await blobToBase64(blob);
  const audio  = base64.split(',')[1];

  try {
    const res = await fetch('/api/transcribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ audio, language }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const text = data.text?.trim();
    console.log('[STT] transcript:', text || '(empty)');
    if (text) onResult(text);
    // Empty result = background noise; VAD loop continues silently
  } catch (err) {
    console.error('[STT] error:', err.message);
    onError?.(err.message);
    onEnd?.();
  }
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ── SpeechSynthesis (TTS) ─────────────────────────────────────────────────

let voicesCache = null;

export function preloadVoices() {
  if (window.speechSynthesis) loadVoices();
}

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

  const pool = voices.filter(
    v => v.lang === langCode || v.lang.toLowerCase().startsWith(langPrefix)
  );
  if (pool.length === 0) return null;

  const google = pool.find(v => v.name.toLowerCase().includes('google'));
  if (google) return google;

  const online = pool.find(v => v.localService === false);
  if (online) return online;

  const preferred = language === 'he'
    ? ['tamar', 'carmit', 'yoav', 'meital']
    : ['milena', 'irina', 'katya', 'svetlana', 'александра', 'алена'];
  const named = pool.find(v => preferred.some(n => v.name.toLowerCase().includes(n)));
  if (named) return named;

  return pool.find(v => v.lang === langCode) ?? pool[0];
}

export async function speak({ text, language, onEnd, onError }) {
  if (!text || !window.speechSynthesis) { onEnd?.(); return; }

  window.speechSynthesis.cancel();

  const voices    = voicesCache ?? await loadVoices();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang   = language === 'he' ? 'he-IL' : 'ru-RU';
  utterance.rate   = 0.82;
  utterance.pitch  = 0.95;
  utterance.volume = 1.0;

  const voice = pickVoice(voices, language);
  if (voice) {
    utterance.voice = voice;
    console.log(`[TTS] voice: "${voice.name}" | lang: ${voice.lang} | local: ${voice.localService}`);
  } else {
    console.warn('[TTS] no matching voice found, using browser default');
  }

  const resumeTimer = setInterval(() => {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 8000);

  const wordCount  = text.split(/\s+/).length;
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
    if (e.error !== 'interrupted' && e.error !== 'canceled') onError?.(e.error);
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
