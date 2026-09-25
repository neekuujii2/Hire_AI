"""AI resume screening endpoint for the careers portal.

POST /agent/screen — evaluates a candidate's CV against a job description.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.config import get_settings
from ..core.logging import get_logger

router = APIRouter(prefix="/agent", tags=["screening"])
log = get_logger(__name__)


class ScreeningRequest(BaseModel):
    cv_text: str = ""
    cv_url: str = ""
    job_title: str
    job_description: str
    requirements: str
    skills_required: list[str] = Field(default_factory=list)
    org_id: str


class ScreeningResult(BaseModel):
    overall_score: int = Field(ge=0, le=100)
    skills_match_score: int = Field(ge=0, le=100)
    experience_match_score: int = Field(ge=0, le=100)
    education_match_score: int = Field(ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    total_experience_years: float | None = None
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommendation: str
    summary: str


SCREENING_PROMPT = """You are an expert recruiter screening a candidate's resume against a job description.

JOB: {job_title}
REQUIREMENTS: {requirements}
REQUIRED SKILLS: {skills_required}
JOB DESCRIPTION: {job_description}

CANDIDATE RESUME:
{cv_text}

Evaluate this candidate and respond ONLY with valid JSON (no markdown, no explanation):
{{
  "overall_score": <0-100>,
  "skills_match_score": <0-100>,
  "experience_match_score": <0-100>,
  "education_match_score": <0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "total_experience_years": <number or null>,
  "strengths": ["3-5 short bullet points"],
  "concerns": ["2-3 short bullet points or empty array"],
  "recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "summary": "2-3 sentence summary of fit"
}}

Be accurate and fair. Score 70+ = good fit. Score below 50 = poor fit."""


def _extract_json(text: str) -> str:
    """Extract JSON from a possibly-markdown-wrapped LLM response."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text


def _parse_response(text: str) -> ScreeningResult:
    """Parse the LLM response into a structured ScreeningResult."""
    json_str = _extract_json(text)
    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        # Try to find a JSON object in the text
        match = re.search(r"\{[\s\S]*\}", text)
        if match:
            data = json.loads(match.group())
        else:
            raise
    return ScreeningResult(**data)


@router.post("/screen", response_model=ScreeningResult)
async def screen_candidate(request: ScreeningRequest) -> ScreeningResult:
    """Screen a candidate's CV against a job description using GPT-4o."""
    settings = get_settings()

    # If cv_text is empty but we have a URL, try to fetch/parse it
    cv_text = request.cv_text
    if not cv_text and request.cv_url:
        try:
            from ..prep.cv_extract import extract_cv_text
            from ..core.deps import get_deps
            deps = get_deps()
            cv_text, _ = await extract_cv_text(request.cv_url, deps)
        except Exception as exc:
            log.warning("CV extraction failed: %s", exc)

    prompt = SCREENING_PROMPT.format(
        job_title=request.job_title,
        requirements=request.requirements,
        skills_required=request.skills_required,
        job_description=request.job_description,
        cv_text=cv_text or "[No CV text available]",
    )

    try:
        from ..core.adapters.llm import get_llm
        adapter = get_llm(settings)
        response = await adapter.complete_text(
            system="You are an expert recruiter. Respond ONLY with valid JSON.",
            user=prompt,
        )
    except Exception as exc:
        log.error("Screening LLM call failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI screening failed")

    try:
        return _parse_response(response)
    except Exception as exc:
        log.error("Failed to parse screening response: %s\nResponse: %s", exc, response)
        raise HTTPException(status_code=502, detail="Invalid AI response format")