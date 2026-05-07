import { playAlarm } from './audioService.js';

const KEY = 'df_reminders';
let checkerInterval = null;

// ── Storage ────────────────────────────────────────────────────────────────

export function loadReminders() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function saveReminders(reminders) {
  localStorage.setItem(KEY, JSON.stringify(reminders));
}

export function addReminder(data) {
  const reminders = loadReminders();
  const reminder = {
    id: Date.now().toString(),
    text: data.text,
    hour: Number(data.hour) || 8,
    minute: Number(data.minute) || 0,
    daily: data.daily !== false,
  };
  reminders.push(reminder);
  saveReminders(reminders);
  return reminder;
}

export function deleteReminder(id) {
  saveReminders(loadReminders().filter(r => r.id !== id));
}

export function deleteReminderByIndex(index) {
  const reminders = loadReminders();
  if (index >= 0 && index < reminders.length) {
    deleteReminder(reminders[index].id);
  }
}

export function buildRemindersText(reminders, language) {
  if (!reminders?.length) return null;
  const isRu = language === 'ru';
  return reminders.map((r, i) => {
    const time = `${r.hour}:${String(r.minute).padStart(2, '0')}`;
    const daily = r.daily ? (isRu ? ', каждый день' : ', כל יום') : '';
    return `${i + 1}. ${r.text} — ${isRu ? 'в' : 'ב-'} ${time}${daily}`;
  }).join('\n');
}

// ── Response parsing ───────────────────────────────────────────────────────

export function parseReminderFromResponse(text) {
  try {
    const match = text.match(/\[REMINDER_DATA:([\s\S]*?)\]/);
    if (!match) return null;
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function stripReminderMarker(text) {
  return text.replace(/\[REMINDER_DATA:[\s\S]*?\]/, '').trim();
}

// ── Notifications ──────────────────────────────────────────────────────────

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function fireNotification(reminder, userName, language) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const isRu = language === 'ru';
  const title = isRu ? 'Дорогой Друг 💛' : 'חבר יקר 💛';
  const body = isRu
    ? `${userName}, напоминание: ${reminder.text}`
    : `${userName}, תזכורת: ${reminder.text}`;
  new Notification(title, { body, icon: '/favicon.svg' });
}

// ── Checker (runs every 30s) ───────────────────────────────────────────────

export function startReminderChecker(getUserName, getLanguage) {
  stopReminderChecker();
  checkerInterval = setInterval(() => {
    const now = new Date();
    if (now.getSeconds() > 29) return; // only fire in first half of the minute
    const reminders = loadReminders();
    reminders.forEach(r => {
      if (r.hour === now.getHours() && r.minute === now.getMinutes()) {
        playAlarm();
        fireNotification(r, getUserName(), getLanguage());
      }
    });
  }, 30_000);
}

export function stopReminderChecker() {
  if (checkerInterval) {
    clearInterval(checkerInterval);
    checkerInterval = null;
  }
}
