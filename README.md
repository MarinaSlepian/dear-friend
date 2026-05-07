# Дорогой Друг / חבר יקר — Dear Friend (Web)

A voice companion web app for elderly people.  
One big button. Press it — the AI greets you and listens. Press again — goodbye.

Built with React + Vite, deployed on Netlify, powered by Anthropic Claude.

---

## Features

- 🗣 Voice conversation — no typing needed
- 🇷🇺 / 🇮🇱 Russian and Hebrew, with full RTL layout for Hebrew
- ⏰ Voice reminders via browser push notifications
- 🧠 Conversation memory across sessions (localStorage)
- 👴 Elderly-first design: 220px button, 28px+ text, warm colors
- 🔒 API key never touches the browser — lives in a Netlify serverless function

---

## Browser Compatibility

| Browser | Speech Input (mic) | Speech Output (TTS) |
|---------|-------------------|---------------------|
| **Google Chrome** | ✅ Full support | ✅ |
| Microsoft Edge | ✅ | ✅ |
| Safari (iOS/macOS) | ⚠️ Limited | ✅ |
| Firefox | ❌ | ✅ |

**Google Chrome is strongly recommended** — it has the best Web Speech API support.

---

## 1 — Local Setup

### Prerequisites
- Node.js 18+
- Netlify CLI (for function testing): `npm install -g netlify-cli`

### Install & run

```bash
cd DearFriendWeb
npm install
```

**Frontend only** (no AI calls — good for UI work):
```bash
npm run dev
# → http://localhost:5173
```

**Full local dev** (React + Netlify function + API):
```bash
# Create a .env file in the project root:
echo "DEAR_FRIEND_API_KEY=sk-ant-your-key-here" > .env

netlify dev
# → http://localhost:8888
```

`netlify dev` starts Vite AND the serverless function together, so `/api/chat` works locally.

---

## 2 — Get an Anthropic API Key

1. Go to **https://console.anthropic.com**
2. Sign up or log in
3. Navigate to **API Keys** → **Create Key**
4. Copy the key — it starts with `sk-ant-...`

---

## 3 — Deploy to Netlify

### A) Connect via GitHub (recommended)

1. Push this folder to a GitHub repository
2. Go to **https://app.netlify.com** → **Add new site** → **Import an existing project**
3. Select your GitHub repo
4. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Go to **Site configuration → Environment variables**
6. Add: `DEAR_FRIEND_API_KEY` = `sk-ant-your-key-here`
7. Click **Deploy site**

### B) Deploy via Netlify CLI

```bash
netlify login
netlify init        # link to a new or existing site
netlify env:set DEAR_FRIEND_API_KEY "sk-ant-your-key-here"
netlify deploy --build --prod
```

---

## 4 — Using the App

1. First visit → enter your name and choose Russian or Hebrew
2. Tap the **big button** → AI greets you and starts listening
3. **Speak naturally** — no need to tap between exchanges
4. Tap the button again → AI says goodbye, conversation is saved

### Voice Reminders

Say things like:
- *"Напомни мне принять таблетки в 8 утра"* (Russian)
- *"תזכיר לי לקחת תרופות בשמונה בבוקר"* (Hebrew)

The AI confirms and schedules a browser push notification.  
Allow notifications when prompted for this to work.

---

## 5 — Switching Between Fast Mode and Smart Mode

Open **Settings (⚙️)** in the top corner:

| Mode | Model | Description |
|------|-------|-------------|
| **Fast Mode** (Быстрый / מצב מהיר) | claude-haiku-4-5 | Quick, snappy replies |
| **Smart Mode** (Умный / מצב חכם) | claude-sonnet-4-6 | Richer, more thoughtful responses |

---

## Project Structure

```
DearFriendWeb/
├── index.html
├── vite.config.js
├── netlify.toml                   Build + redirect + dev config
├── package.json
├── functions/
│   └── chat.js                    Netlify function — Anthropic API (server-side)
└── src/
    ├── main.jsx                   Vite entry point
    ├── App.jsx                    Root — state, screen routing, RTL toggle
    ├── index.css                  CSS reset + keyframe animations
    ├── constants/
    │   ├── theme.js               Colors and font sizes
    │   ├── strings.js             All UI text in Russian and Hebrew
    │   └── prompts.js             AI system prompts (RU + HE)
    ├── services/
    │   ├── aiService.js           POST /api/chat, builds system prompt
    │   ├── speechService.js       Web Speech API: STT + TTS wrappers
    │   ├── memoryService.js       Conversation history (localStorage)
    │   └── reminderService.js     Reminders CRUD + notification scheduling
    └── screens/
        ├── OnboardingScreen.jsx   First-visit name + language setup
        ├── MainScreen.jsx         Session state machine, big button, animations
        └── SettingsScreen.jsx     All settings + reminders list
```

---

## Privacy

- All conversation history stays **in your browser** (localStorage).
- Your API key is an **environment variable on Netlify** — never sent to the browser.
- The only external service used is Anthropic's API (when you press the button).
- Use **Settings → Clear conversation history** to wipe everything.
