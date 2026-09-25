"""Structured CV parser: PDF/DOCX → raw text → GPT-4o-mini structured JSON.

Reuses the existing ``extract_cv_text`` for document → text extraction
(markitdown + Gemini fallback), then runs GPT-4o-mini to produce a
structured profile (personal info, skills, experience, education, etc.).
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.config import get_settings
from ..core.logging import get_logger

router = APIRouter(prefix="/agent", tags=["cv-parser"])
log = get_logger(__name__)


class ParseCVRequest(BaseModel):
    cv_url: str = ""
    cv_text: str = ""
    candidate_id: str = ""


class StructuredCV(BaseModel):
    personal: dict[str, Any] = Field(default_factory=dict)
    total_experience_years: float | None = None
    skills: list[str] = Field(default_factory=list)
    experience: list[dict[str, Any]] = Field(default_factory=list)
    education: list[dict[str, Any]] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=list)


PARSE_PROMPT = """Extract structured information from this resume. Respond ONLY with valid JSON.

{
  "personal": {
    "name": "string or null",
    "email": "string or null",
    "phone": "string or null",
    "location": "string or null",
    "linkedin_url": "string or null",
    "portfolio_url": "string or null"
  },
  "total_experience_years": <number calculated from work history>,
  "skills": ["skill1", "skill2", ...],
  "experience": [
    {
      "company": "string",
      "title": "string",
      "start_date": "YYYY-MM or 'Present'",
      "end_date": "YYYY-MM or 'Present'",
      "duration_months": number,
      "location": "string or null",
      "description": "string — bullet points as \\n separated text"
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string",
      "graduation_year": number or null,
      "gpa": "string or null"
    }
  ],
  "certifications": ["cert1", "cert2"],
  "languages": ["English", "Hindi"]
}

Resume:
{cv_text}"""


def _extract_json(text: str) -> str:
    """Extract JSON from a possibly-markdown-wrapped LLM response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text


def _parse_response(text: str) -> StructuredCV:
    """Parse the LLM response into a structured StructuredCV."""
    json_str = _extract_json(text)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            data = json.loads(match.group())
        else:
            raise
    return StructuredCV(**data)


@router.post("/parse-cv", response_model=StructuredCV)
async def parse_cv(request: ParseCVRequest) -> StructuredCV:
    """Parse a CV into structured data using GPT-4o-mini."""
    settings = get_settings()

    # Step 1: Get raw text
    cv_text = request.cv_text
    if not cv_text and request.cv_url:
        try:
            from ..prep.cv_extract import extract_cv_text
            from ..core.deps import get_deps
            deps = get_deps()
            cv_text, _ = await extract_cv_text(request.cv_url, deps)
        except Exception as exc:
            log.warning("CV text extraction failed: %s", exc)
            raise HTTPException(status_code=502, detail="CV text extraction failed")

    if not cv_text or len(cv_text.strip()) < 30:
        raise HTTPException(status_code=400, detail="Could not extract text from CV")

    # Step 2: Parse structured data with GPT-4o-mini
    prompt = PARSE_PROMPT.format(cv_text=cv_text[:8000])

    try:
        from ..core.adapters.llm import get_llm
        adapter = get_llm(settings)
        response = await adapter.complete_text(
            system="You are a resume parser. Respond ONLY with valid JSON.",
            user=prompt,
        )
    except Exception as exc:
        log.error("CV parsing LLM call failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI parsing failed")

    try:
        return _parse_response(response)
    except Exception as exc:
        log.error("Failed to parse CV response: %s\nResponse: %s", exc, response)
        raise HTTPException(status_code=502, detail="Invalid AI response format")