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
    ContactImportResponse,
    ContactInput,
    CreateRunRequest,
    FeedbackRecord,
    FeedbackRequest,
    HealthResponse,
    ImportWarning,
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
                known_title=contact.known_title,
                service_purchased=contact.service_purchased,
                success_score=contact.success_score,
                repeat_client=contact.repeat_client,
                approx_deal_value=contact.approx_deal_value,
                why_successful=contact.why_successful,
                notes=contact.notes,
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


def build_import_response(contacts: list[KnownContact]) -> ContactImportResponse:
    imported = [ContactInput.model_validate(contact.compact()) for contact in contacts]
    warnings: list[ImportWarning] = []
    seen: dict[tuple[str, str], int] = {}
    ready = 0

    for index, contact in enumerate(imported):
        label = contact.name or f"Row {index + 2}"
        identity_ready = bool(contact.location or contact.website)
        success_ready = any(
            value is not None and value != ""
            for value in (
                contact.service_purchased,
                contact.success_score,
                contact.repeat_client,
                contact.approx_deal_value,
                contact.why_successful,
            )
        )
        if not identity_ready:
            warnings.append(
                ImportWarning(
                    contact_index=index,
                    contact_name=label,
                    message="Add a location or website to reduce identity mismatches.",
                )
            )
        elif contact.location and "," not in contact.location and not contact.website:
            warnings.append(
                ImportWarning(
                    contact_index=index,
                    contact_name=label,
                    message="Location should include a state, such as 'Joplin, MO'.",
                )
            )
            identity_ready = False
        if not success_ready:
            warnings.append(
                ImportWarning(
                    contact_index=index,
                    contact_name=label,
                    message="Add a service, success score, deal value, repeat status, or success reason.",
                )
            )

        key = (contact.name.casefold(), contact.company.casefold())
        duplicate = key in seen
        if duplicate:
            warnings.append(
                ImportWarning(
                    contact_index=index,
                    contact_name=label,
                    message=f"Possible duplicate of row {seen[key] + 2}.",
                )
            )
        else:
            seen[key] = index

        if identity_ready and success_ready and not duplicate:
            ready += 1

    return ContactImportResponse(
        contacts=imported,
        total=len(imported),
        ready=ready,
        needs_review=len(imported) - ready,
        warnings=warnings,
    )


@app.post("/api/contacts/import", response_model=ContactImportResponse)
async def import_contacts(
    workbook: Annotated[UploadFile, File(description="An .xlsx contact workbook")],
) -> ContactImportResponse:
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
        return build_import_response(contacts)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
