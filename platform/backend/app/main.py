from __future__ import annotations

import os
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    CreateRunRequest,
    FeedbackRecord,
    FeedbackRequest,
    HealthResponse,
    RunAccepted,
    RunRecord,
    RunSummary,
)
from .storage import RunStore


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(
    os.getenv("REVERSE_BOOLEAN_ROOT", str(Path(__file__).resolve().parents[3]))
).resolve()
load_dotenv(PROJECT_ROOT / ".env")

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from reverse_boolean import (  # noqa: E402
    DEFAULT_MODEL,
    ContactReverseSearchEngine,
    KnownContact,
    load_excel_contacts,
)


app = FastAPI(
    title="Reverse Boolean Lab API",
    version="0.1.0",
    description="Research job API around the contact-centric reverse search engine.",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "API_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

store = RunStore(BACKEND_DIR / "data" / "reverse_boolean.db")
workers = ThreadPoolExecutor(
    max_workers=max(1, int(os.getenv("RESEARCH_WORKERS", "2"))),
    thread_name_prefix="research",
)


def execute_run(run_id: str, request: CreateRunRequest) -> None:
    try:
        store.update_run(
            run_id,
            status="running",
            stage="Resolving identities and collecting public evidence",
            progress=30,
        )
        contacts = [
            KnownContact(
                name=contact.name,
                company=contact.company,
                location=contact.location,
                website=contact.website,
            )
            for contact in request.contacts
        ]
        engine = ContactReverseSearchEngine(
            model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
            use_web=request.use_web,
            search_context_size=request.search_context_size,
            cache_dir=BACKEND_DIR / "data" / "cache",
        )
        result = engine.generate(
            contacts,
            agency_context=request.agency_context,
            refresh=request.refresh,
        )
        store.update_run(
            run_id,
            status="completed",
            stage="Strategy ready for human validation",
            progress=100,
            result=result,
        )
    except Exception as exc:  # The error is persisted so the client can recover cleanly.
        store.update_run(
            run_id,
            status="failed",
            stage="Research stopped",
            progress=100,
            error=str(exc),
        )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        engine="contact-reverse-search",
        api_key_configured=bool(os.getenv("OPENAI_API_KEY")),
        model=os.getenv("OPENAI_MODEL", DEFAULT_MODEL),
    )


@app.post("/api/runs", response_model=RunAccepted, status_code=status.HTTP_202_ACCEPTED)
def create_run(request: CreateRunRequest) -> RunAccepted:
    record = store.create_run(request.model_dump())
    workers.submit(execute_run, record["id"], request)
    return RunAccepted(id=record["id"], status="queued")


@app.get("/api/runs", response_model=list[RunSummary])
def list_runs(limit: int = 20) -> list[RunSummary]:
    limit = min(max(limit, 1), 100)
    return [RunSummary.model_validate(item) for item in store.list_runs(limit)]


@app.get("/api/runs/{run_id}", response_model=RunRecord)
def get_run(run_id: str) -> RunRecord:
    try:
        return RunRecord.model_validate(store.get_run(run_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc


@app.post(
    "/api/runs/{run_id}/feedback",
    response_model=FeedbackRecord,
    status_code=status.HTTP_201_CREATED,
)
def create_feedback(run_id: str, request: FeedbackRequest) -> FeedbackRecord:
    try:
        record = store.create_feedback(
            run_id,
            outcome=request.outcome,
            contact_index=request.contact_index,
            notes=request.notes,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Run not found") from exc
    return FeedbackRecord.model_validate(record)


@app.post("/api/contacts/import", response_model=list[dict[str, str]])
async def import_contacts(
    workbook: Annotated[UploadFile, File(description="An .xlsx contact workbook")],
) -> list[dict[str, str]]:
    if not workbook.filename or not workbook.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Upload an .xlsx workbook")

    contents = await workbook.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Workbook must be smaller than 10 MB")

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as handle:
            handle.write(contents)
            temp_path = Path(handle.name)
        contacts = load_excel_contacts(temp_path)
        return [contact.compact() for contact in contacts]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
