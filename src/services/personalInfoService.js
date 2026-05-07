const KEY = 'df_personal';

// ── Storage ────────────────────────────────────────────────────────────────

export function loadPersonalInfo() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
  } catch {
    return {};
  }
}

export function savePersonalInfo(info) {
  localStorage.setItem(KEY, JSON.stringify(info));
}

// ── Birthday helpers ───────────────────────────────────────────────────────

export function calculateAge({ day, month, year }) {
  if (!year || !month || !day) return null;
  const today = new Date();
  let age = today.getFullYear() - year;
  if (
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day)
  ) age--;
  return age > 0 ? age : null;
}

export function isTodayBirthday({ day, month } = {}) {
  if (!day || !month) return false;
  const today = new Date();
  return today.getDate() === day && today.getMonth() + 1 === month;
}

export function daysUntilBirthday({ day, month } = {}) {
  if (!day || !month) return null;
  const today = new Date();
  const year  = today.getFullYear();
  let next    = new Date(year, month - 1, day);
  if (next <= today) next = new Date(year + 1, month - 1, day);
  return Math.ceil((next - today) / 86_400_000);
}

// ── Build context string injected into system prompt ──────────────────────

const RU_MONTHS = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];
const HE_MONTHS = [
  'בינואר','בפברואר','במרץ','באפריל','במאי','ביוני',
  'ביולי','באוגוסט','בספטמבר','באוקטובר','בנובמבר','בדצמבר',
];

export function buildPersonalContext(info, language) {
  if (!info || !Object.keys(info).length) return null;
  const isRu = language === 'ru';
  const lines = [];

  // Birthday
  const bd = info.birthday;
  if (bd?.year && bd?.month && bd?.day) {
    const monthName = (isRu ? RU_MONTHS : HE_MONTHS)[bd.month - 1];
    const age = calculateAge(bd);
    const ageStr = age ? (isRu ? `, ${age} ${russianYears(age)}` : `, בת/בן ${age}`) : '';
    lines.push((isRu ? `День рождения: ${bd.day} ${monthName} ${bd.year}` : `יום הולדת: ${bd.day} ${monthName} ${bd.year}`) + ageStr);

    if (isTodayBirthday(bd)) {
      lines.push(isRu
        ? '🎂 СЕГОДНЯ ДЕНЬ РОЖДЕНИЯ! Обязательно тепло поздравь в начале разговора!'
        : '🎂 היום יום ההולדת! חובה לאחל בחום בתחילת השיחה!');
    } else {
      const days = daysUntilBirthday(bd);
      if (days !== null && days <= 7) {
        lines.push(isRu
          ? `День рождения через ${days} ${russianDays(days)} — упомяни об этом тепло.`
          : `יום הולדת בעוד ${days} ימים — אפשר להזכיר בחום.`);
      }
    }
  }

  if (info.childrenNames?.trim())
    lines.push((isRu ? 'Дети: ' : 'ילדים: ') + info.childrenNames.trim());

  if (info.grandchildrenNames?.trim())
    lines.push((isRu ? 'Внуки: ' : 'נכדים: ') + info.grandchildrenNames.trim());

  if (info.greatGrandchildrenNames?.trim())
    lines.push((isRu ? 'Правнуки: ' : 'נינים: ') + info.greatGrandchildrenNames.trim());

  if (!lines.length) return null;

  const header = isRu
    ? 'СВЕДЕНИЯ О ПОЛЬЗОВАТЕЛЕ И ЕГО СЕМЬЕ:'
    : 'פרטים על המשתמש ומשפחתו:';
  const footer = isRu
    ? 'Используй эти данные естественно: спрашивай о детях и внуках по именам, поздравляй с днём рождения, упоминай возраст с теплотой.'
    : 'השתמשי במידע בצורה טבעית: שאלי על הילדים והנכדים בשמם, אחלי יום הולדת שמח, הזכירי את הגיל בחום.';

  return [header, ...lines, footer].join('\n');
}

// ── Russian grammatical helpers ────────────────────────────────────────────

function russianYears(n) {
  const last2 = n % 100;
  const last1 = n % 10;
  if (last2 >= 11 && last2 <= 14) return 'лет';
  if (last1 === 1) return 'год';
  if (last1 >= 2 && last1 <= 4) return 'года';
  return 'лет';
}

function russianDays(n) {
  const last2 = n % 100;
  const last1 = n % 10;
  if (last2 >= 11 && last2 <= 14) return 'дней';
  if (last1 === 1) return 'день';
  if (last1 >= 2 && last1 <= 4) return 'дня';
  return 'дней';
}
