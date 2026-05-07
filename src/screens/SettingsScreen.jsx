import { useState, useEffect } from 'react';
import { COLORS, SIZES } from '../constants/theme.js';
import { STRINGS } from '../constants/strings.js';
import { clearConversations } from '../services/memoryService.js';
import { loadReminders, deleteReminder } from '../services/reminderService.js';
import { loadPersonalInfo, savePersonalInfo } from '../services/personalInfoService.js';

export default function SettingsScreen({ name: initName, language: initLang, modelKey: initModel, onSave, onClose }) {
  const [name, setName]         = useState(initName);
  const [language, setLanguage] = useState(initLang);
  const [modelKey, setModel]    = useState(initModel);
  const [reminders, setReminders] = useState([]);
  const [saved, setSaved]       = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Personal info
  const [bdDay,   setBdDay]   = useState('');
  const [bdMonth, setBdMonth] = useState('');
  const [bdYear,  setBdYear]  = useState('');
  const [childrenNames,          setChildrenNames]          = useState('');
  const [grandchildrenNames,     setGrandchildrenNames]     = useState('');
  const [greatGrandchildrenNames,setGreatGrandchildrenNames]= useState('');

  const S = STRINGS[language];

  useEffect(() => {
    setReminders(loadReminders());
    const p = loadPersonalInfo();
    if (p.birthday) {
      setBdDay(p.birthday.day   ? String(p.birthday.day)   : '');
      setBdMonth(p.birthday.month ? String(p.birthday.month) : '');
      setBdYear(p.birthday.year  ? String(p.birthday.year)  : '');
    }
    setChildrenNames(p.childrenNames          || '');
    setGrandchildrenNames(p.grandchildrenNames     || '');
    setGreatGrandchildrenNames(p.greatGrandchildrenNames || '');
  }, []);

  function handleSave() {
    if (!name.trim()) return;

    // Save personal info to its own localStorage key
    savePersonalInfo({
      birthday: {
        day:   bdDay   ? parseInt(bdDay,   10) : null,
        month: bdMonth ? parseInt(bdMonth, 10) : null,
        year:  bdYear  ? parseInt(bdYear,  10) : null,
      },
      childrenNames:           childrenNames.trim(),
      grandchildrenNames:      grandchildrenNames.trim(),
      greatGrandchildrenNames: greatGrandchildrenNames.trim(),
    });

    onSave({ name: name.trim(), language, modelKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleDeleteReminder(id) {
    deleteReminder(id);
    setReminders(loadReminders());
  }

  function handleClearHistory() {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearConversations();
    setConfirmClear(false);
  }

  function formatTime(r) {
    return `${r.hour}:${String(r.minute).padStart(2, '0')}`;
  }

  return (
    <div style={styles.page}>
      <div style={styles.inner}>

        {/* Header */}
        <div style={styles.header}>
          <button style={styles.backBtn} onClick={onClose}>{S.back_btn}</button>
          <h1 style={styles.title}>{S.settings_title}</h1>
        </div>

        {/* Name */}
        <SectionLabel text={S.settings_name} />
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          style={styles.input}
          autoComplete="given-name"
        />

        {/* Language */}
        <SectionLabel text={S.settings_language} />
        <div style={styles.row}>
          <OptionBtn label="Русский" active={language === 'ru'} onClick={() => setLanguage('ru')} />
          <OptionBtn label="עברית"   active={language === 'he'} onClick={() => setLanguage('he')} />
        </div>

        {/* Model */}
        <SectionLabel text={S.settings_mode} />
        <ModelCard
          title={S.fast_mode}
          desc={S.fast_mode_desc}
          active={modelKey === 'fast'}
          onClick={() => setModel('fast')}
        />
        <ModelCard
          title={S.smart_mode}
          desc={S.smart_mode_desc}
          active={modelKey === 'smart'}
          onClick={() => setModel('smart')}
        />

        <Divider />

        {/* ── Personal Info ──────────────────────────────────────── */}
        <SectionLabel text={S.personal_title} />

        {/* Birthday */}
        <p style={styles.fieldLabel}>{S.personal_birthday}</p>
        <div style={styles.birthdayRow}>
          {/* Day */}
          <div style={styles.bdField}>
            <span style={styles.bdFieldLabel}>{S.personal_day}</span>
            <input
              type="number"
              min="1" max="31"
              value={bdDay}
              onChange={e => setBdDay(e.target.value)}
              placeholder="15"
              style={{ ...styles.bdInput, width: 64 }}
            />
          </div>
          {/* Month */}
          <div style={{ ...styles.bdField, flex: 2 }}>
            <span style={styles.bdFieldLabel}>{S.personal_month}</span>
            <select
              value={bdMonth}
              onChange={e => setBdMonth(e.target.value)}
              style={{ ...styles.bdInput, flex: 1 }}
            >
              <option value="">—</option>
              {S.months.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          {/* Year */}
          <div style={styles.bdField}>
            <span style={styles.bdFieldLabel}>{S.personal_year}</span>
            <input
              type="number"
              min="1900" max={new Date().getFullYear()}
              value={bdYear}
              onChange={e => setBdYear(e.target.value)}
              placeholder={S.personal_year_ph}
              style={{ ...styles.bdInput, width: 90 }}
            />
          </div>
        </div>

        {/* Children */}
        <p style={styles.fieldLabel}>{S.personal_children}</p>
        <input
          type="text"
          value={childrenNames}
          onChange={e => setChildrenNames(e.target.value)}
          placeholder={S.personal_children_ph}
          style={styles.input}
        />

        {/* Grandchildren */}
        <p style={styles.fieldLabel}>{S.personal_grandchildren}</p>
        <input
          type="text"
          value={grandchildrenNames}
          onChange={e => setGrandchildrenNames(e.target.value)}
          placeholder={S.personal_grandchildren_ph}
          style={styles.input}
        />

        {/* Great-grandchildren */}
        <p style={styles.fieldLabel}>{S.personal_great}</p>
        <input
          type="text"
          value={greatGrandchildrenNames}
          onChange={e => setGreatGrandchildrenNames(e.target.value)}
          placeholder={S.personal_great_ph}
          style={styles.input}
        />

        {/* Save */}
        <button style={{ ...styles.saveBtn, backgroundColor: saved ? COLORS.successGreen : COLORS.buttonIdle }} onClick={handleSave}>
          {saved ? S.saved_msg : S.save_btn}
        </button>

        <Divider />

        {/* Reminders */}
        <SectionLabel text={S.reminders_title} />
        {reminders.length === 0
          ? <p style={styles.emptyText}>{S.no_reminders}</p>
          : reminders.map(r => (
              <div key={r.id} style={styles.reminderRow}>
                <div style={styles.reminderInfo}>
                  <span style={styles.reminderText}>{r.text}</span>
                  <span style={styles.reminderMeta}>
                    {S.reminder_at} {formatTime(r)}{r.daily ? ` · ${S.reminder_daily}` : ''}
                  </span>
                </div>
                <button style={styles.deleteBtn} onClick={() => handleDeleteReminder(r.id)}>
                  {S.delete_btn}
                </button>
              </div>
            ))
        }

        <Divider />

        {/* Clear history */}
        {confirmClear
          ? (
            <div style={styles.confirmBox}>
              <p style={styles.confirmText}>{S.clear_confirm}</p>
              <div style={styles.row}>
                <button style={styles.confirmYes} onClick={handleClearHistory}>{S.clear_yes}</button>
                <button style={styles.confirmNo}  onClick={() => setConfirmClear(false)}>{S.clear_no}</button>
              </div>
            </div>
          )
          : (
            <button style={styles.clearBtn} onClick={handleClearHistory}>
              {S.clear_history}
            </button>
          )
        }

        {/* Chrome note */}
        <p style={styles.chromeNote}>{S.chrome_note}</p>

        <div style={{ height: 48 }} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SectionLabel({ text }) {
  return <p style={{ fontSize: SIZES.largeFont, fontWeight: '600', color: COLORS.text, margin: '20px 0 10px' }}>{text}</p>;
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: COLORS.divider, margin: '24px 0' }} />;
}

function OptionBtn({ label, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        fontSize: SIZES.largeFont,
        fontWeight: '600',
        padding: '14px 12px',
        borderRadius: 14,
        border: `2px solid ${active ? COLORS.buttonIdle : COLORS.inputBorder}`,
        backgroundColor: active ? COLORS.buttonIdle : hov ? '#FFE8D8' : COLORS.inputBg,
        color: active ? COLORS.white : COLORS.text,
        cursor: 'pointer',
        minHeight: 60,
        transition: 'all 0.15s',
        fontFamily: 'inherit',
      }}
    >{label}</button>
  );
}

function ModelCard({ title, desc, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '16px 18px',
        borderRadius: 14,
        border: `2px solid ${active ? COLORS.modelActiveBorder : COLORS.inputBorder}`,
        backgroundColor: active ? COLORS.modelActiveBg : COLORS.inputBg,
        marginBottom: 10,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <p style={{ fontSize: SIZES.mediumFont, fontWeight: 'bold', color: active ? COLORS.buttonIdle : COLORS.text }}>{title}</p>
      <p style={{ fontSize: SIZES.smallFont, color: COLORS.textLight, marginTop: 4 }}>{desc}</p>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: COLORS.settingsBg,
    padding: '0 0 48px',
  },
  inner: {
    maxWidth: 600,
    margin: '0 auto',
    padding: '0 24px',
  },
  header: {
    paddingTop: 24,
    marginBottom: 8,
  },
  backBtn: {
    fontSize: SIZES.mediumFont,
    fontWeight: '600',
    color: COLORS.buttonIdle,
    background: 'none',
    border: 'none',
    padding: '8px 0',
    cursor: 'pointer',
    display: 'block',
    marginBottom: 8,
    fontFamily: 'inherit',
  },
  title: {
    fontSize: SIZES.titleFont,
    fontWeight: 'bold',
    color: COLORS.text,
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
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: SIZES.mediumFont,
    fontWeight: '600',
    color: COLORS.text,
    margin: '16px 0 8px',
  },
  birthdayRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  bdField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
  },
  bdFieldLabel: {
    fontSize: SIZES.smallFont,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  bdInput: {
    fontSize: SIZES.largeFont,
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
    border: `2px solid ${COLORS.inputBorder}`,
    borderRadius: 12,
    padding: '12px 10px',
    outline: 'none',
    fontFamily: 'inherit',
    width: '100%',
  },
  row: {
    display: 'flex',
    gap: 14,
  },
  saveBtn: {
    width: '100%',
    marginTop: 24,
    fontSize: SIZES.largeFont,
    fontWeight: 'bold',
    color: COLORS.white,
    padding: '18px',
    borderRadius: 14,
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontFamily: 'inherit',
  },
  emptyText: {
    fontSize: SIZES.mediumFont,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '12px 0',
  },
  reminderRow: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: COLORS.reminderBg,
    borderRadius: 12,
    border: `1px solid ${COLORS.inputBorder}`,
    padding: '14px 16px',
    marginBottom: 10,
    gap: 12,
  },
  reminderInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  reminderText: {
    fontSize: SIZES.mediumFont,
    color: COLORS.text,
    fontWeight: '500',
  },
  reminderMeta: {
    fontSize: SIZES.smallFont,
    color: COLORS.textLight,
  },
  deleteBtn: {
    fontSize: SIZES.smallFont,
    fontWeight: '600',
    color: COLORS.error,
    backgroundColor: COLORS.errorBg,
    border: `1px solid ${COLORS.errorBorder}`,
    borderRadius: 8,
    padding: '8px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minHeight: 40,
    minWidth: 70,
    fontFamily: 'inherit',
  },
  clearBtn: {
    width: '100%',
    fontSize: SIZES.mediumFont,
    fontWeight: '600',
    color: COLORS.error,
    backgroundColor: 'transparent',
    border: `2px solid ${COLORS.error}`,
    borderRadius: 14,
    padding: '16px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmBox: {
    backgroundColor: COLORS.errorBg,
    border: `1px solid ${COLORS.errorBorder}`,
    borderRadius: 14,
    padding: '18px',
    marginBottom: 8,
  },
  confirmText: {
    fontSize: SIZES.mediumFont,
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  confirmYes: {
    flex: 1,
    fontSize: SIZES.mediumFont,
    fontWeight: 'bold',
    color: COLORS.white,
    backgroundColor: COLORS.error,
    border: 'none',
    borderRadius: 10,
    padding: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  confirmNo: {
    flex: 1,
    fontSize: SIZES.mediumFont,
    fontWeight: '600',
    color: COLORS.text,
    backgroundColor: COLORS.inputBg,
    border: `2px solid ${COLORS.inputBorder}`,
    borderRadius: 10,
    padding: '14px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chromeNote: {
    marginTop: 32,
    fontSize: SIZES.smallFont,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 1.5,
  },
};
