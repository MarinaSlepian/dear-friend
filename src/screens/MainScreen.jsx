import { useState, useEffect, useRef, useCallback } from 'react';
import { COLORS, SIZES } from '../constants/theme.js';
import { STRINGS } from '../constants/strings.js';
import { sendMessage } from '../services/aiService.js';
import {
  isSpeechRecognitionSupported,
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
  IDLE:      'idle',
  GREETING:  'greeting',
  LISTENING: 'listening',
  THINKING:  'thinking',
  SPEAKING:  'speaking',
  FAREWELL:  'farewell',
};

export default function MainScreen({ name, language, modelKey, onOpenSettings }) {
  const [sessionState, setSessionState]   = useState(S.IDLE);
  const [errorMessage, setErrorMessage]   = useState('');
  const [noSpeechSupport, setNoSupport]   = useState(false);
  const [btnHovered, setBtnHovered]       = useState(false);

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
    updateState(S.LISTENING);
    startListening({
      language: langRef.current,
      onResult: handleTranscript,
      onError:  handleSpeechError,
      onEnd:    handleRecognitionEnd,
    });
  }, []);

  function handleSpeechError(error) {
    if (!sessionActiveRef.current) return;
    if (error === 'no-speech' || error === 'aborted') {
      // Restart silently
      if (sessionStateRef.current === S.LISTENING) setTimeout(beginListening, 400);
      return;
    }
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      showError(STRINGS[langRef.current].mic_denied);
      endSession();
      return;
    }
    // Other errors — restart
    if (sessionStateRef.current === S.LISTENING) setTimeout(beginListening, 600);
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
    processingRef.current = true;
    updateState(S.THINKING);
    stopListening();

    conversationRef.current.push({ role: 'user', content: text });

    try {
      const rawReply = await sendMessage({
        messages: conversationRef.current,
        name:     nameRef.current,
        language: langRef.current,
        modelKey: modelRef.current,
      });

      if (!sessionActiveRef.current) return;

      // Extract and handle reminder command (stripped from TTS)
      const reminderData = parseReminderFromResponse(rawReply);
      const cleanReply   = stripReminderMarker(rawReply);

      if (reminderData) await processReminderAction(reminderData);

      conversationRef.current.push({ role: 'assistant', content: cleanReply });
      processingRef.current = false;

      updateState(S.SPEAKING);
      speak({
        text:     cleanReply,
        language: langRef.current,
        onEnd:    () => { if (sessionActiveRef.current) beginListening(); },
        onError:  () => { if (sessionActiveRef.current) beginListening(); },
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
    const greeting = lang === 'ru'
      ? `Добрый день, ${n}! Как вы себя чувствуете сегодня, ${n}?`
      : `שלום ${n}! איך אתה מרגיש היום?`;

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
    } else if (sessionState === S.LISTENING || sessionState === S.SPEAKING || sessionState === S.THINKING) {
      endSession();
    }
    // GREETING and FAREWELL: ignore (button disabled)
  }

  // ── Derived display values ─────────────────────────────────────────────────

  const strings = STRINGS[language];
  const isDisabled = sessionState === S.GREETING || sessionState === S.FAREWELL;
  const isSpeaking = sessionState === S.SPEAKING || sessionState === S.GREETING || sessionState === S.FAREWELL;
  const isListening = sessionState === S.LISTENING;
  const isActive    = sessionState !== S.IDLE && sessionState !== S.FAREWELL;

  function getLabel() {
    switch (sessionState) {
      case S.LISTENING: return strings.btn_listening;
      case S.THINKING:  return strings.btn_thinking;
      case S.SPEAKING:
      case S.GREETING:  return strings.btn_speaking;
      case S.FAREWELL:  return strings.btn_farewell;
      default:          return strings.btn_idle;
    }
  }

  function getBtnColor() {
    if (isSpeaking)              return COLORS.buttonSpeaking;
    if (sessionState === S.THINKING) return COLORS.buttonThinking;
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
