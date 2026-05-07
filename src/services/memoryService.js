const KEY = 'df_conversations';

export function saveConversation(messages) {
  const existing = loadConversations();
  const session = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    messages: messages.filter(m => m.role === 'user' || m.role === 'assistant'),
  };
  const updated = [...existing, session].slice(-50);
  try {
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('saveConversation:', e);
  }
}

export function loadConversations() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearConversations() {
  localStorage.removeItem(KEY);
}

export function buildMemoryContext(language) {
  const conversations = loadConversations();
  if (conversations.length === 0) return null;

  const isRu = language === 'ru';
  const U    = isRu ? 'Пользователь' : 'המשתמש';
  const A    = isRu ? 'Ты'           : 'אתה';

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString(
      isRu ? 'ru-RU' : 'he-IL',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );
  }

  function renderMessage(m, maxLen) {
    const who  = m.role === 'user' ? U : A;
    const text = m.content.length > maxLen
      ? m.content.substring(0, maxLen) + '…'
      : m.content;
    return `${who}: ${text}`;
  }

  const sections = [];
  const recent   = conversations.slice(-5);

  recent.forEach((conv, idx) => {
    const isLast = idx === recent.length - 1;
    const label  = isRu ? 'Разговор' : 'שיחה';
    const date   = formatDate(conv.date);

    if (isLast) {
      // Show the full most-recent conversation so the AI has complete context
      const lines = conv.messages.map(m => renderMessage(m, 300));
      sections.push(`${label} ${date} [последний / אחרון]:\n${lines.join('\n')}`);
    } else {
      // Older sessions: first 6 messages condensed (enough to capture topics)
      const lines = conv.messages.slice(0, 6).map(m => renderMessage(m, 160));
      sections.push(`${label} ${date}:\n${lines.join('\n')}`);
    }
  });

  return sections.join('\n\n');
}
