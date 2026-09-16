"""Match score and feedback additions to ScoreCard."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MatchScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")
    technical_fit: float = 0.0
    communication: float = 0.0
    behavioral_depth: float = 0.0
    proctoring_confidence: float = 100.0
    cultural_fit: float = 0.0
    final_score: float = 0.0
    recommendation: str = "maybe"
    summary: str = ""


class CandidateFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    strengths: list[str] = Field(default_factory=list)
    improvement_areas: list[str] = Field(default_factory=list)
    overall_assessment: str = ""
    encouragement: str = ""
    full_text: str = ""
