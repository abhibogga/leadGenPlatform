# Reverse Boolean Lab frontend

Next.js and TypeScript interface for the Reverse Boolean Lab platform.

Copy `.env.example` to `.env.local` only when the FastAPI service is not running
at the default `http://127.0.0.1:8000` address.

```powershell
pnpm install
pnpm dev
```

The OpenAI API key belongs only to the Python backend and must never be added to
the frontend environment.
