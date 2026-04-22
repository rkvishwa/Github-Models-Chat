# GitHub Models Chat App

A simple AI chat app using the GitHub Models REST API.

## Requirements

- Node.js 18+
- A GitHub token with `models:read`

## Setup

1. Copy `.env.example` to `.env`.
2. Set your real token in `.env`:

```env
GITHUB_TOKEN=your_real_token
GITHUB_ORG=your-org-login
GITHUB_MODEL=openai/gpt-5-chat
PORT=3000
```

If you are using an organization grant, set `GITHUB_ORG` so requests are attributed to that org.

3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm start
```

5. Open:

http://localhost:3000

## How it works

- The browser sends chat history to `/api/chat`.
- The server reads `GITHUB_TOKEN` from `.env`.
- The server calls `https://models.github.ai/inference/chat/completions` by default.
- If `GITHUB_ORG` is set, it calls `https://models.github.ai/orgs/{org}/inference/chat/completions`.

## Notes

- Keep `.env` private. It is ignored by `.gitignore`.
- You can change the default model via `GITHUB_MODEL`.
- If you see a 403 budget message on `openai/gpt-4.1`, switch to `openai/gpt-5-chat`.
- If your token comes from an org grant, set `GITHUB_ORG` to that org login.
