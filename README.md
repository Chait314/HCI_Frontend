## Study Planner Frontend

This is a Next.js frontend for the study planner app. Chat requests now go through a server route (`/api/chat`) that calls GitHub Models using environment variables.

## Setup .env.local

1. Create your local env file from the example:

```bash
cp .env.example .env.local
```

2. Open `.env.local` and paste your GitHub token:

```env
GITHUB_MODELS_API_KEY=PASTE_YOUR_GITHUB_TOKEN_HERE
```

3. Keep or adjust these values:

```env
GITHUB_MODELS_API_URL=https://models.github.ai/inference/chat/completions
GITHUB_MODELS_MODEL=openai/gpt-4.1
GITHUB_API_VERSION=2026-03-10
```

Notes:

- `.env.local` is ignored by git.
- Do not put tokens in frontend files.

## Run

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000.

## Chat Request Flow

1. Frontend sends `POST /api/chat`.
2. `app/api/chat/route.ts` forwards to GitHub Models.
3. Response is returned to UI as `{ reply: string }`.
