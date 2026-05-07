import { useState } from 'react';
import { COLORS, SIZES } from '../constants/theme.js';
import { STRINGS } from '../constants/strings.js';

export default function OnboardingScreen({ onComplete }) {
  const [name, setName]         = useState('');
  const [language, setLanguage] = useState('ru');
  const [error, setError]       = useState('');

  const S = STRINGS[language];

  function handleContinue() {
    const trimmed = name.trim();
    if (!trimmed) { setError(S.name_required); return; }
    onComplete(trimmed, language);
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleContinue();
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>{S.welcome}</h1>
        <p style={styles.subtitle}>{S.welcome_sub}</p>

        {/* Name input */}
        <label style={styles.label}>{S.enter_name}</label>
        <input
          type="text"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={handleKey}
          placeholder={S.name_placeholder}
          autoFocus
          autoComplete="given-name"
          style={styles.input}
        />
        {error && <p style={styles.error}>{error}</p>}

        {/* Language selector */}
        <label style={{ ...styles.label, marginTop: 32 }}>{S.choose_language}</label>
        <div style={styles.langRow}>
          <LangButton
            label="Русский"
            active={language === 'ru'}
            onClick={() => setLanguage('ru')}
          />
          <LangButton
            label="עברית"
            active={language === 'he'}
            onClick={() => setLanguage('he')}
          />
        </div>

        {/* Continue */}
        <button style={styles.continueBtn} onClick={handleContinue}>
          {S.continue_btn}
        </button>
      </div>
    </div>
  );
}

function LangButton({ label, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.langBtn,
        backgroundColor: active ? COLORS.buttonIdle : hovered ? '#FFE8D8' : COLORS.inputBg,
        borderColor:     active ? COLORS.buttonIdle : COLORS.inputBorder,
        color:           active ? COLORS.white : COLORS.text,
      }}
    >
      {label}
    </button>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: COLORS.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: 540,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  title: {
    fontSize: SIZES.titleFont,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: SIZES.largeFont,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 40,
  },
  label: {
    fontSize: SIZES.largeFont,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
    display: 'block',
  },
  input: {
    width: '100%',
    fontSize: SIZES.largeFont,
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
    border: `2px solid ${COLORS.inputBorder}`,
    borderRadius: 14,
    padding: '14px 18px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  error: {
    fontSize: SIZES.smallFont,
    color: COLORS.error,
    marginTop: 6,
  },
  langRow: {
    display: 'flex',
    gap: 16,
  },
  langBtn: {
    flex: 1,
    fontSize: SIZES.largeFont,
    fontWeight: '600',
    padding: '16px 12px',
    borderRadius: 14,
    border: '2px solid',
    transition: 'background-color 0.15s, border-color 0.15s',
    minHeight: 64,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  continueBtn: {
    marginTop: 40,
    backgroundColor: COLORS.buttonIdle,
    color: COLORS.white,
    fontSize: SIZES.largeFont,
    fontWeight: 'bold',
    padding: '18px 24px',
    borderRadius: 16,
    border: 'none',
    width: '100%',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(232,132,90,0.35)',
    transition: 'background-color 0.15s',
    fontFamily: 'inherit',
  },
};
