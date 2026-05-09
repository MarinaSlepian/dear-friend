import { useState, useEffect, useRef, useCallback } from 'react';
import { COLORS, SIZES } from '../constants/theme.js';
import { STRINGS } from '../constants/strings.js';
import { sendMessage } from '../services/aiService.js';
import {
  isSpeechRecognitionSupported,
  preloadVoices,
  startListening,
  stopListening,
  speak,
  stopSpeaking,
} from '../services/speechService.js';
import { saveConversation } from '../services/memoryService.js';
import { unlockAudio } from '../services/audioService.js';
import {
  parseReminderFromResponse,
  stripReminderMarker,
  addReminder,
  deleteReminderByIndex,
  requestNotificationPermission,
  startReminderChecker,
  stopReminderChecker,
} from '../services/reminderService.js';

// ── Session state machine ────────────────────────────────────────────────────
const S = {
  IDLE:       'idle',
  GREETING:   'greeting',
  LISTENING:  'listening',
  PROCESSING: 'processing', // VAD detected speech, waiting for Whisper
  THINKING:   'thinking',   // Whisper done, waiting for AI
  SPEAKING:   'speaking',
  FAREWELL:   'farewell',
};

const GREETING_QUESTIONS = {
  ru: [
    'Как вы себя чувствуете сегодня?',
    'Как вы поживаете?',
    'Что нового сегодня?',
    'Что вас беспокоит сегодня?',
    'Расскажите, как у вас дела?',
    'О чём вы думаете сегодня?',
    'Что вас радует сегодня?',
    'Как прошёл ваш день?',
    'Есть ли что-то, о чём хотите поговорить?',
  ],
  he: [
    'איך אתה מרגיש היום?',
    'מה שלומך היום?',
    'מה חדש אצלך?',
    'מה מטריד אותך היום?',
    'ספר לי, איך העניינים?',
    'על מה אתה חושב היום?',
    'מה משמח אותך היום?',
    'יש משהו שתרצה לשתף איתי?',
    'איך עבר עליך היום?',
  ],
};

function buildGreeting(name, lang) {
  const hour = new Date().getHours();
  const questions = GREETING_QUESTIONS[lang] ?? GREETING_QUESTIONS.ru;
  const question  = questions[Math.floor(Math.random() * questions.length)];

  if (lang === 'ru') {
    let salutation;
    if      (hour >= 4  && hour < 11) salutation = 'Доброе утро';
    else if (hour >= 11 && hour < 16) salutation = 'Добрый день';
    else if (hour >= 16 && hour < 22) salutation = 'Добрый вечер';
    else                              salutation = 'Доброй ночи';
    return `${salutation}, ${name}! ${question}`;
  } else {
    let salutation;
    if      (hour >= 4  && hour < 11) salutation = 'בוקר טוב';
    else if (hour >= 11 && hour < 16) salutation = 'צהריים טובים';
    else if (hour >= 16 && hour < 22) salutation = 'ערב טוב';
    else                              salutation = 'לילה טוב';
    return `${salutation}, ${name}! ${question}`;
  }
}

export default function MainScreen({ name, language, modelKey, onOpenSettings }) {
  const [sessionState, setSessionState]   = useState(S.IDLE);
  const [errorMessage, setErrorMessage]   = useState('');
  const [noSpeechSupport, setNoSupport]   = useState(false);
  const [btnHovered, setBtnHovered]       = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');

  // Refs hold latest values accessible inside callbacks without stale closure issues
  const sessionActiveRef  = useRef(false);
  const processingRef     = useRef(false);
  const sessionStateRef   = useRef(S.IDLE);
  const conversationRef   = useRef([]);
  const langRef           = useRef(language);
  const nameRef           = useRef(name);
  const modelRef          = useRef(modelKey);

  // Keep refs in sync
  useEffect(() => { langRef.current  = language;  }, [language]);
  useEffect(() => { nameRef.current  = name;       }, [name]);
  useEffect(() => { modelRef.current = modelKey;   }, [modelKey]);

  useEffect(() => {
    if (!isSpeechRecognitionSupported()) setNoSupport(true);
    preloadVoices();

    startReminderChecker(
      () => nameRef.current,
      () => langRef.current,
    );

    return () => {
      stopReminderChecker();
      stopSpeaking();
      stopListening();
    };
  }, []);

  function updateState(s) {
    sessionStateRef.current = s;
    setSessionState(s);
  }

  function showError(msg) {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 7000);
  }

  // ── Listening logic ────────────────────────────────────────────────────────

  const beginListening = useCallback(() => {
    if (!sessionActiveRef.current) return;
    console.log('[speech] startListening lang:', langRef.current);
    updateState(S.LISTENING);
    startListening({
      language:      langRef.current,
      onResult:      handleTranscript,
      onError:       handleSpeechError,
      onEnd:         handleRecognitionEnd,
      onSpeechStart: () => { if (sessionActiveRef.current) updateState(S.PROCESSING); },
    });
  }, []);

  function handleSpeechError(error) {
    if (!sessionActiveRef.current) return;
    console.log('[speech] error:', error);
    if (error === 'no-speech' || error === 'aborted') {
      // onend always fires after onerror — handleRecognitionEnd restarts listening.
      // Don't also restart here or we get a double-restart abort loop.
      return;
    }
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      showError(STRINGS[langRef.current].mic_denied);
      endSession();
      return;
    }
    // Other errors — let onend / handleRecognitionEnd restart
  }

  function handleRecognitionEnd() {
    // Auto-restart unless we've moved away from LISTENING (processing / speaking / ending)
    if (sessionActiveRef.current && !processingRef.current && sessionStateRef.current === S.LISTENING) {
      setTimeout(beginListening, 300);
    }
  }

  // ── Handle user speech ─────────────────────────────────────────────────────

  async function handleTranscript(text) {
    if (!sessionActiveRef.current) return;
    console.log('[speech] transcript:', text);
    setLastTranscript(text);
    setTimeout(() => setLastTranscript(''), 4000);
    processingRef.current = true;
    updateState(S.THINKING);
    stopListening();

    conversationRef.current.push({ role: 'user', content: text });

    // ── Streaming TTS queue ──────────────────────────────────────────────────
    // Sentences arrive from the stream one by one; we start speaking the first
    // one immediately so the user hears a response before Claude finishes.
    const sentenceQueue = [];
    let streamDone = false;
    let ttsBusy    = false;

    function speakNext() {
      if (ttsBusy || !sessionActiveRef.current) return;
      if (sentenceQueue.length === 0) {
        if (streamDone) { processingRef.current = false; beginListening(); }
        return;
      }
      ttsBusy = true;
      updateState(S.SPEAKING);
      const sentence = sentenceQueue.shift();
      speak({
        text:     sentence,
        language: langRef.current,
        onEnd:    () => { ttsBusy = false; speakNext(); },
        onError:  () => { ttsBusy = false; speakNext(); },
      });
    }

    try {
      await sendMessage({
        messages: conversationRef.current,
        name:     nameRef.current,
        language: langRef.current,
        modelKey: modelRef.current,

        onSentence: (sentence) => {
          if (!sessionActiveRef.current) return;
          const clean = stripReminderMarker(sentence).trim();
          if (clean) { sentenceQueue.push(clean); speakNext(); }
        },

        onComplete: (fullText) => {
          if (!sessionActiveRef.current) return;
          const reminderData = parseReminderFromResponse(fullText);
          const cleanReply   = stripReminderMarker(fullText);
          if (reminderData) processReminderAction(reminderData);
          conversationRef.current.push({ role: 'assistant', content: cleanReply });
          streamDone = true;
          speakNext(); // if TTS already finished, this starts listening
        },
      });

    } catch (err) {
      processingRef.current = false;
      if (!sessionActiveRef.current) return;
      console.error('AI error:', err);
      const lang = langRef.current;
      const msg = STRINGS[lang].api_error;
      showError(msg);
      updateState(S.SPEAKING);
      speak({ text: msg, language: lang, onEnd: () => { if (sessionActiveRef.current) beginListening(); } });
    }
  }

  async function processReminderAction(data) {
    try {
      if (data.action === 'set') {
        await requestNotificationPermission();
        addReminder(data);
      } else if (data.action === 'cancel') {
        deleteReminderByIndex(data.index ?? 0);
      }
    } catch (e) {
      console.warn('Reminder action error:', e);
    }
  }

  // ── Session start ──────────────────────────────────────────────────────────

  async function startSession() {
    setErrorMessage('');

    if (!navigator.onLine) {
      const msg = STRINGS[langRef.current].no_internet;
      showError(msg);
      speak({ text: msg, language: langRef.current });
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      showError(STRINGS[langRef.current].no_speech_support);
      return;
    }

    sessionActiveRef.current = true;
    processingRef.current    = false;
    conversationRef.current  = [];

    const lang = langRef.current;
    const n    = nameRef.current;
    const greeting = buildGreeting(n, lang);

    conversationRef.current.push({ role: 'assistant', content: greeting });
    updateState(S.GREETING);

    speak({
      text:     greeting,
      language: lang,
      onEnd:    () => { if (sessionActiveRef.current) beginListening(); },
    });
  }

  // ── Session end ────────────────────────────────────────────────────────────

  async function endSession() {
    sessionActiveRef.current = false;
    processingRef.current    = false;
    stopListening();
    stopSpeaking();

    if (conversationRef.current.length > 2) {
      saveConversation(conversationRef.current);
    }

    const lang = langRef.current;
    const n    = nameRef.current;
    const farewell = lang === 'ru'
      ? `До свидания, ${n}! Берегите себя. До следующего раза!`
      : `להתראות, ${n}! תשמור על עצמך. להתראות בפעם הבאה!`;

    updateState(S.FAREWELL);
    conversationRef.current = [];

    speak({
      text:     farewell,
      language: lang,
      onEnd:    () => updateState(S.IDLE),
    });
  }

  // ── Button press ───────────────────────────────────────────────────────────

  function handleButtonPress() {
    unlockAudio(); // satisfy browser's "user gesture required" policy for AudioContext
    if (sessionState === S.IDLE) {
      startSession();
    } else if (sessionState === S.LISTENING || sessionState === S.PROCESSING || sessionState === S.SPEAKING || sessionState === S.THINKING) {
      endSession();
    }
    // GREETING and FAREWELL: ignore (button disabled)
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const strings = STRINGS[language];
  const isDisabled  = sessionState === S.GREETING || sessionState === S.FAREWELL;
  const isSpeaking  = sessionState === S.SPEAKING || sessionState === S.GREETING || sessionState === S.FAREWELL;
  const isListening = sessionState === S.LISTENING;
  const isActive    = sessionState !== S.IDLE && sessionState !== S.FAREWELL;

  function getLabel() {
    switch (sessionState) {
      case S.LISTENING:   return strings.btn_listening;
      case S.PROCESSING:
      case S.THINKING:    return strings.btn_thinking;
      case S.SPEAKING:
      case S.GREETING:    return strings.btn_speaking;
      case S.FAREWELL:    return strings.btn_farewell;
      default:            return strings.btn_idle;
    }
  }

  function getBtnColor() {
    if (isSpeaking)              return COLORS.buttonSpeaking;
    if (sessionState === S.THINKING || sessionState === S.PROCESSING) return COLORS.buttonThinking;
    if (isActive)                return COLORS.buttonActive;
    return btnHovered ? COLORS.buttonHover : COLORS.buttonIdle;
  }

  return (
    <div style={styles.page}>
      {/* Gear icon */}
      <button
        style={styles.gearBtn}
        onClick={onOpenSettings}
        title="Settings"
        aria-label="Open settings"
      >
        ⚙️
      </button>

      {/* Centre */}
      <div style={styles.centre}>

        {/* Unsupported browser notice */}
        {noSpeechSupport && (
          <div style={styles.noticeBox}>
            <p style={styles.noticeText}>{strings.no_speech_support}</p>
          </div>
        )}

        {/* The big button */}
        <button
          onClick={handleButtonPress}
          disabled={isDisabled}
          onMouseEnter={() => setBtnHovered(true)}
          onMouseLeave={() => setBtnHovered(false)}
          className={isListening ? 'btn-pulse' : ''}
          style={{
            ...styles.mainBtn,
            backgroundColor: getBtnColor(),
            opacity:   isDisabled ? 0.85 : 1,
            cursor:    isDisabled ? 'default' : 'pointer',
            boxShadow: isActive
              ? '0 8px 40px rgba(196,99,74,0.45)'
              : btnHovered
              ? '0 12px 48px rgba(232,132,90,0.5)'
              : '0 8px 32px rgba(232,132,90,0.3)',
          }}
          aria-label={getLabel()}
        >
          {/* Icon area */}
          {isSpeaking
            ? <WaveBars />
            : <span style={styles.micIcon}>🎤</span>
          }

          {/* Label */}
          <span style={styles.btnLabel}>{getLabel()}</span>
        </button>

        {/* Hint text during active session */}
        {(isListening || sessionState === S.SPEAKING || sessionState === S.THINKING) && (
          <p style={styles.hint}>{strings.tap_to_end}</p>
        )}

        {/* Show recognized transcript briefly for debugging */}
        {lastTranscript ? (
          <p style={styles.transcript}>"{lastTranscript}"</p>
        ) : null}

        {/* Error message */}
        {errorMessage && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wave bars component ────────────────────────────────────────────────────

function WaveBars() {
  return (
    <div style={waveStyles.container}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="wave-bar" style={waveStyles.bar} />
      ))}
    </div>
  );
}

const waveStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 60,
    marginBottom: 12,
  },
  bar: {
    width: 10,
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: 5,
  },
};

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight:       '100vh',
    backgroundColor: COLORS.background,
    display:         'flex',
    flexDirection:   'column',
    position:        'relative',
  },
  gearBtn: {
    position:   'absolute',
    top:        20,
    right:      20,
    fontSize:   32,
    background: 'none',
    border:     'none',
    cursor:     'pointer',
    padding:    10,
    lineHeight: 1,
    zIndex:     10,
    minWidth:   52,
    minHeight:  52,
  },
  centre: {
    flex:           1,
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '80px 24px 40px',
    gap:            24,
  },
  mainBtn: {
    width:         220,
    height:        220,
    borderRadius:  '50%',
    border:        'none',
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    justifyContent:'center',
    padding:       24,
    transition:    'background-color 0.2s, box-shadow 0.2s',
    userSelect:    'none',
    WebkitUserSelect: 'none',
    flexShrink:    0,
  },
  micIcon: {
    fontSize:     72,
    lineHeight:   1,
    marginBottom: 10,
    display:      'block',
  },
  btnLabel: {
    fontSize:   SIZES.labelFont,
    fontWeight: 'bold',
    color:      COLORS.white,
    textAlign:  'center',
    lineHeight: 1.2,
  },
  hint: {
    fontSize:  SIZES.smallFont,
    color:     COLORS.textMuted,
    textAlign: 'center',
  },
  noticeBox: {
    backgroundColor: '#FFF8E8',
    border:          '2px solid #E8C870',
    borderRadius:    14,
    padding:         '16px 20px',
    maxWidth:        380,
    textAlign:       'center',
  },
  noticeText: {
    fontSize:   SIZES.mediumFont,
    color:      '#7A6020',
    lineHeight: 1.5,
  },
  transcript: {
    fontSize:   SIZES.smallFont,
    color:      COLORS.textMuted,
    textAlign:  'center',
    fontStyle:  'italic',
    maxWidth:   340,
  },
  errorBox: {
    backgroundColor: COLORS.errorBg,
    border:          `1px solid ${COLORS.errorBorder}`,
    borderRadius:    14,
    padding:         '16px 20px',
    maxWidth:        380,
    textAlign:       'center',
  },
  errorText: {
    fontSize:   SIZES.mediumFont,
    color:      COLORS.error,
    lineHeight: 1.5,
  },
};
