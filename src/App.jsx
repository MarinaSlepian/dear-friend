import { useState, useEffect } from 'react';
import OnboardingScreen from './screens/OnboardingScreen.jsx';
import MainScreen       from './screens/MainScreen.jsx';
import SettingsScreen   from './screens/SettingsScreen.jsx';

export default function App() {
  const [screen,   setScreen]   = useState('loading');
  const [name,     setName]     = useState('');
  const [language, setLanguage] = useState('ru');
  const [modelKey, setModelKey] = useState('fast');

  // ── Bootstrap from localStorage ────────────────────────────────────────────
  useEffect(() => {
    const savedName  = localStorage.getItem('df_name');
    const savedLang  = localStorage.getItem('df_language') || 'ru';
    const savedModel = localStorage.getItem('df_model')    || 'fast';

    if (savedName) {
      setName(savedName);
      setLanguage(savedLang);
      setModelKey(savedModel);
      setScreen('main');
    } else {
      setScreen('onboarding');
    }
  }, []);

  // ── Sync document dir / lang with selected language ────────────────────────
  useEffect(() => {
    document.documentElement.dir  = language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = language === 'he' ? 'he'  : 'ru';
  }, [language]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleOnboardingComplete(newName, newLang) {
    localStorage.setItem('df_name',     newName);
    localStorage.setItem('df_language', newLang);
    localStorage.setItem('df_model',    'fast');
    setName(newName);
    setLanguage(newLang);
    setModelKey('fast');
    setScreen('main');
  }

  function handleSaveSettings({ name: n, language: l, modelKey: m }) {
    localStorage.setItem('df_name',     n);
    localStorage.setItem('df_language', l);
    localStorage.setItem('df_model',    m);
    setName(n);
    setLanguage(l);
    setModelKey(m);
    setScreen('main');
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (screen === 'loading')    return null;

  if (screen === 'onboarding') return (
    <OnboardingScreen onComplete={handleOnboardingComplete} />
  );

  if (screen === 'settings')   return (
    <SettingsScreen
      name={name}
      language={language}
      modelKey={modelKey}
      onSave={handleSaveSettings}
      onClose={() => setScreen('main')}
    />
  );

  return (
    <MainScreen
      name={name}
      language={language}
      modelKey={modelKey}
      onOpenSettings={() => setScreen('settings')}
    />
  );
}
