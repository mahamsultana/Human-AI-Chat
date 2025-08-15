# Human-AI-Chat

A minimal, production-ready starter to build a **human ↔ AI chat** app with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. Use it as a base to plug in your preferred LLM provider (OpenAI, xAI, Anthropic, etc.), add streaming responses, history persistence, and tool-calling.

> If you’re viewing this on GitHub: clone the repo and follow the steps below to run it locally.

---

## ✨ Features (starter)

* Next.js (App Router) + TypeScript
* Tailwind CSS styling
* Clean project structure, ready for components like ChatList and ChatInput
* Environment-variable driven config
* Linting with ESLint

> Roadmap ideas (optional): streaming responses, markdown rendering, chat history persistence (Postgres/Supabase/SQLite), authentication, tool-calling, file uploads (RAG), multi-model support.

---

## 🧱 Tech Stack

* **Framework:** Next.js (React)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **Tooling:** ESLint

---

## 📦 Getting Started

### Prerequisites

* **Node.js** v18+ (v20+ recommended)
* One of: **npm**, **pnpm**, **yarn**, or **bun**

### 1) Clone & install

```bash
git clone https://github.com/mahamsultana/Human-AI-Chat.git
cd Human-AI-Chat

# choose your package manager
npm install
# pnpm i
# yarn
# bun install
```

### 2) Configure environment variables

Create a `.env.local` in the project root:

```bash
cp .env.local.example .env.local  # if you add an example file later
```

Or create it manually with values like (adjust to your provider/setup):

```env
# DATABASE ENVIRONMENT VARIABLES
DATABASE_NAME=databasename
DATABASE_USERNAME=youpostgresusername
DATABASE_PASSWORD=youpostgrespassword
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432

# JWT
JWT_SECRET=you_jwt_secret

OPENROUTER_API_KEY=api_key

# Pusher (for real-time)
PUSHER_APP_ID=pusher_app_id
PUSHER_KEY=pusher_key
PUSHER_SECRET=pusher_secret
PUSHER_CLUSTER=pusher_cluster

# Next.js Public Variables
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_NAME=Chat App
NEXT_PUBLIC_PUSHER_KEY=public_pusher_key
NEXT_PUBLIC_PUSHER_CLUSTER=cluster
```

> You can keep the app running without AI keys at first; wire them up when you implement the API route.

### 3) Run the dev server

```bash
npm run dev
# or: pnpm dev / yarn dev / bun dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4) Build for production

```bash
npm run build
npm start
```

### 5) Lint

```bash
npm run lint
```

---

## 🗂️ Project Structure

```
Human-AI-Chat/
├─ public/               # static assets (favicons, images)
├─ src/
│  ├─ app/               # Next.js App Router (routes, layouts, API routes)
│  │  ├─ page.tsx        # home page
│  │  └─ api/            # (add your chat API handlers here, e.g., /api/chat)
│  ├─ components/        # UI components (ChatInput, Message, ChatList, etc.)
│  ├─ lib/               # helpers, clients, model wrappers
│  └─ styles/            # (optional) global styles
├─ .gitignore
├─ next.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
└─ package.json
```

> If `src/app/api` doesn’t exist yet, create it and add an endpoint like `POST /api/chat` to call your LLM.

---

## 💬 Example: simple chat API (drop-in)

Create `src/app/api/chat/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { messages } = await req.json();

  // TODO: call your LLM provider here (OpenAI, Anthropic, etc.)
  // const reply = await llm(messages);

  const reply = "Hello! Your AI backend isn't wired up yet. Add your provider call in /api/chat.";
  return NextResponse.json({ reply });
}
```

Then from your page or a client component, `fetch('/api/chat', { method: 'POST', body: JSON.stringify({ messages }) })`.

---

## 🧪 Suggested Next Steps

* **Wire up an LLM**: Add a provider client in `src/lib/ai.ts` and call it from `/api/chat`.
* **Streaming**: Use the Web Streams API or Server Actions for token streaming.
* **UI polish**: Create `ChatInput`, `MessageBubble`, and `ChatList` components.
* **Persistence**: Save conversations to a DB (Prisma + Postgres / Supabase / SQLite).
* **Auth**: Add Auth.js if you need user accounts.
* **RAG**: Support file uploads, embeddings, and retrieval for grounded answers.

---

## 🚀 Deployment

* **Vercel** (recommended for Next.js):

  * Set environment variables in the project settings.
  * `vercel` CLI or “Deploy” button from dashboard.
* Any Node-compatible host will work (`npm run build && npm start`).

---

## 🛠️ Troubleshooting

* **Node version issues**: ensure Node 18+ (`node -v`). Clear lockfile and reinstall if needed.
* **Tailwind classes not applying**: verify `content` paths in `tailwind.config.ts` include `./src/**/*.{ts,tsx}`.
* **Env not loaded**: make sure you used `.env.local` (not committed) and restarted the dev server.

---

## 📄 License

No license file is included yet. If you intend this to be open source, add a `LICENSE` (MIT is common for templates).

---

## 🙌 Contributions

Issues and PRs are welcome. For larger changes, open an issue to discuss direction first.

---

## 📝 Acknowledgements

* Next.js team and the React community
* Tailwind CSS

---

### Maintainer

**The Botss / Maham** – AI apps & agents. Feel free to reach out for feature ideas or integrations.
