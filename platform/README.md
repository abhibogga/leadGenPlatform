# Reverse Boolean Lab platform

This folder is the web-platform layer around the existing `reverse_boolean.py`
engine. The original console application remains unchanged.

## Structure

- `frontend/` — Next.js and TypeScript working surface.
- `backend/` — FastAPI job API, SQLite run history, feedback storage, Excel import,
  and the adapter around the existing Python engine.
- `docker-compose.yml` — production-shaped two-container deployment.

The browser never receives the OpenAI API key. It submits a research job to
FastAPI and polls the durable run record. Research results and human validation
outcomes are stored in `backend/data/reverse_boolean.db`.

## Run locally

The backend reads the existing project-root `.env` file.

### macOS / Linux

From the **project root**, start these in separate terminals:

```bash
bash start_backend.sh
```

```bash
bash start_frontend.sh
```

Requires Python 3.11+ and Node.js 22+. The launchers install dependencies and
the backend creates `.env` if needed. Add your `OPENAI_API_KEY` to that file
and restart the backend before running research. See the root README for
Mac installation and Windows migration notes.

### Windows

Backend terminal:

```powershell
cd platform\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Frontend terminal:

```powershell
cd platform\frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000`. API documentation is available at
`http://127.0.0.1:8000/docs`.

## Run with Docker

From the `platform` directory:

```powershell
docker compose up --build
```

The SQLite database and response cache remain under `backend/data` through
container rebuilds.

## Current API

- `GET /health` — engine readiness without exposing secrets.
- `POST /api/contacts/import` — import the existing `.xlsx` contact format.
- `POST /api/runs` — enqueue an analysis.
- `GET /api/runs/{id}` — poll status and retrieve the final strategy.
- `GET /api/runs` — list persisted run summaries.
- `POST /api/runs/{id}/feedback` — record validation outcomes.

## Research-platform seam

`execute_run` in `backend/app/main.py` is the initial orchestrator boundary.
Today it calls the existing engine. Later it can enqueue explicit identity,
collection, extraction, entity-resolution, feature, scoring, and synthesis
stages without changing the frontend contract.

Hermes should consume stored runs and feedback as evaluation evidence. Proposed
rule or prompt changes should be tested against a versioned evaluation set before
promotion rather than editing production behavior directly.
