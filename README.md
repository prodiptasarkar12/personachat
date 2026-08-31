# PersonaChat

PersonaChat is a production-oriented MVP for creating AI chatbot personas from exported WhatsApp conversations. Each persona is an AI simulation that follows documented communication patterns and is transparent about not being the original person.

## Stack
- Node.js + Express
- Prisma + SQLite
- Vanilla HTML/CSS/JS
- OpenAI API through the backend

## Features
- User ID based access
- Unlimited persona records
- WhatsApp `.txt` import and multiline parsing
- Communication-style analysis
- Admin dashboard for personas, users and conversations
- Persistent conversations
- Responsive chat UI
- Protected admin API and AI rate limiting
- Source chat files are processed server-side and are not served publicly

## Setup
Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run dev
```

Open `http://localhost:3000` and use `/admin.html` for the admin panel.

Set `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env` before non-local use.

## OpenAI
Set `OPENAI_API_KEY` in `.env`. The key is used only by the backend and is never sent to browser code. `OPENAI_MODEL` defaults to `gpt-5-mini` and can be changed to a model available to your API account.

## WhatsApp import
Export a WhatsApp conversation without media and upload the `.txt` file from the admin Personas screen. The parser supports common date/time variations, 12/24-hour times, multiline messages and common system/media-omitted messages.

## Persona workflow
1. Sign in as admin.
2. Create a persona.
3. Import a WhatsApp `.txt` export.
4. Review/edit communication settings.
5. Activate the persona.
6. Users enter a User ID and select the active persona.

## Security and privacy
Imported conversations can contain sensitive information. Never commit `.env` or database files. Use HTTPS, a strong admin password/session secret, restrictive CORS, and appropriate production authentication. Imported chats are not used to train a global model. Source files are processed server-side and are not publicly served.

The application presents personas as AI simulations and does not claim that the AI is literally the person represented by a source chat.

## Production notes
For production, use HTTPS/reverse proxy, persistent database/backups, restrictive CORS, stronger admin authentication/CSRF controls as appropriate, and encrypted storage for any persistent source artifacts.
