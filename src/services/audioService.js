// Web Audio API alarm — no audio files needed.
// AudioContext must be unlocked by a user gesture first (browser policy).
// Call unlockAudio() on any button press; after that playAlarm() works from timers.

let ctx = null;

export function unlockAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {
    console.warn('[audio] AudioContext not available:', e);
  }
}

export function playAlarm() {
  if (!ctx) {
    // Try creating without a gesture — works on some browsers after prior interaction
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[audio] Cannot create AudioContext:', e);
      return;
    }
  }

  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(scheduleAlarm).catch(e => console.warn('[audio] resume failed:', e));
}

// Classic two-tone alarm: three pairs of high/low beeps
function scheduleAlarm() {
  if (!ctx) return;

  const BEEP_MS = 200;   // each tone duration
  const GAP_MS  = 80;    // silence between tones
  const STEP    = (BEEP_MS + GAP_MS) / 1000;

  // Pairs: [high, low, high, low, high, low]
  const tones = [880, 660, 880, 660, 880, 660];

  tones.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type            = 'square';   // square wave = harsh, attention-grabbing
    osc.frequency.value = freq;

    const t       = ctx.currentTime + i * STEP;
    const fadeIn  = 0.005;
    const fadeOut = 0.015;
    const onTime  = BEEP_MS / 1000;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.9, t + fadeIn);
    gain.gain.setValueAtTime(0.9, t + onTime - fadeOut);
    gain.gain.linearRampToValueAtTime(0, t + onTime);

    osc.start(t);
    osc.stop(t + onTime + 0.01);
  });
}
