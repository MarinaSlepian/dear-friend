// ── Speech-to-text via MediaRecorder + OpenAI Whisper ────────────────────
// Replaces browser SpeechRecognition (which fails with `network` errors on
// production HTTPS due to Chrome routing audio through Google's servers).

import { getAudioContext } from './audioService.js';

export const isSpeechRecognitionSupported = () =>
  Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

let activeSession = null;

export async function startListening({ language, onResult, onError, onEnd, onSpeechStart }) {
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
  const SILENCE_MS       = 200;  // ms of quiet before phrase ends

  const vadInterval = setInterval(() => {
    if (!isActive) return;
    analyser.getByteFrequencyData(freqData);
    const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;

    if (avg > SPEECH_THRESHOLD) {
      if (!speaking) {
        startRecording();
        onSpeechStart?.();
      }
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

// ── TTS via OpenAI (shimmer voice) ────────────────────────────────────────

export function preloadVoices() {} // no-op: OpenAI TTS needs no preloading

let currentAbortController = null;
let currentAudioSource     = null;

export async function speak({ text, language, onEnd, onError }) {
  if (!text) { onEnd?.(); return; }
  stopSpeaking();

  const controller = new AbortController();
  currentAbortController = controller;

  try {
    const res = await fetch('/api/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, voice: 'shimmer' }),
      signal:  controller.signal,
    });

    if (controller.signal.aborted) return;
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();
    if (controller.signal.aborted) return;

    // Use the already-unlocked AudioContext so playback works on iOS too
    const audioCtx = getAudioContext();
    if (!audioCtx) throw new Error('AudioContext not ready');

    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    if (controller.signal.aborted) return;

    const source = audioCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(audioCtx.destination);
    currentAudioSource = source;

    source.onended = () => {
      if (currentAudioSource === source) currentAudioSource = null;
      onEnd?.();
    };

    source.start();
    console.log(`[TTS] playing "${text.slice(0, 60)}"`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[TTS] error:', err.message);
    onError?.(err.message);
    onEnd?.();
  }
}

export function stopSpeaking() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  if (currentAudioSource) {
    try { currentAudioSource.stop(); } catch {}
    currentAudioSource = null;
  }
}
