from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ContactInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=500)
    known_title: str | None = Field(default=None, max_length=200)
    service_purchased: str | None = Field(default=None, max_length=500)
    success_score: int | None = Field(default=None, ge=1, le=5)
    repeat_client: bool | None = None
    approx_deal_value: float | None = Field(default=None, ge=0)
    why_successful: str | None = Field(default=None, max_length=2_000)
    notes: str | None = Field(default=None, max_length=2_000)

    @field_validator("name", "company")
    @classmethod
    def required_text_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator(
        "location",
        "website",
        "known_title",
        "service_purchased",
        "why_successful",
        "notes",
    )
    @classmethod
    def optional_text_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None


class ImportWarning(BaseModel):
    contact_index: int = Field(ge=0)
    contact_name: str
    message: str


class ContactImportResponse(BaseModel):
    contacts: list[ContactInput]
    total: int = Field(ge=0)
    ready: int = Field(ge=0)
    needs_review: int = Field(ge=0)
    warnings: list[ImportWarning]


class CreateRunRequest(BaseModel):
    contacts: list[ContactInput] = Field(min_length=1, max_length=50)
    agency_context: str = Field(default="", max_length=10_000)
    refresh: bool = False
    use_web: bool = True
    search_context_size: Literal["low", "medium", "high"] = "low"


class RunAccepted(BaseModel):
    id: str
    status: Literal["queued"]


class RunRecord(BaseModel):
    id: str
    created_at: str
    updated_at: str
    status: Literal["queued", "running", "completed", "failed"]
    stage: str
    progress: int = Field(ge=0, le=100)
    request: dict[str, Any]
    result: dict[str, Any] | None = None
    error: str | None = None


class RunSummary(BaseModel):
    id: str
    created_at: str
    updated_at: str
    status: str
    stage: str
    progress: int
    contact_count: int
    summary: str | None = None


class FeedbackRequest(BaseModel):
    outcome: Literal["found", "not_found", "partial", "not_tested"]
    contact_index: int | None = Field(default=None, ge=0)
    notes: str = Field(default="", max_length=5_000)


class FeedbackRecord(FeedbackRequest):
    id: str
    run_id: str
    created_at: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    engine: Literal["contact-reverse-search"]
    api_key_configured: bool
    model: str
