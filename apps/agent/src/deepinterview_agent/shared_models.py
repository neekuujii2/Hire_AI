"""Pydantic v2 mirror of packages/shared (the Zod source of truth).

Every wire field is snake_case and must stay field-identical with the TypeScript
contracts in packages/shared/src. Datetimes are plain ISO-8601 UTC strings
(e.g. "2026-06-08T09:00:00Z"), NOT datetime objects. The MODELS registry at the
bottom mirrors the SCHEMAS registry in packages/shared/src/registry.ts.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

LANGUAGES = ("en", "vi", "es", "zh", "hi", "id", "pt", "fr", "de", "ja")
Language = Literal["en", "vi", "es", "zh", "hi", "id", "pt", "fr", "de", "ja"]
Section = Literal["intro", "behavioral", "technical", "coding", "wrap"]
Seniority = Literal["intern", "junior", "mid", "senior", "staff", "principal"]
MasteryLevel = Literal["weak", "developing", "solid", "strong"]


def _validate_localized_text(v: dict[str, str]) -> dict[str, str]:
    if not isinstance(v, dict):
        raise ValueError("LocalizedText must be an object")  # noqa: TRY004 - pydantic validators must raise ValueError
    if not v.get("en"):
        raise ValueError("LocalizedText must include a non-empty 'en' entry")
    for k in v:
        if k not in LANGUAGES:
            raise ValueError(f"LocalizedText contains an unsupported language key: {k}")
    return v


LocalizedText = Annotated[dict[str, str], AfterValidator(_validate_localized_text)]


# --- candidate ---------------------------------------------------------------


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    description: str
    tech: list[str]


class Education(BaseModel):
    model_config = ConfigDict(extra="forbid")
    institution: str
    degree: str
    field: str | None = None
    year: int | None = None


class CandidateProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    headline: str
    summary_120w: str
    years_experience: int
    seniority: Seniority
    skills: list[str]
    projects: list[Project]
    achievements: list[str]
    education: list[Education]
    spoken_languages: list[str]
    links: list[str] = Field(default_factory=list)


# --- job ---------------------------------------------------------------------


class JobSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    company_name: str
    location: str | None = None
    seniority: Seniority
    must_have: list[str]
    nice_to_have: list[str]
    responsibilities: list[str]
    tech_stack: list[str]
    raw_text: str


# --- company -----------------------------------------------------------------


class Citation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    url: str
    snippet: str | None = None


class CompanyIntel(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    summary: str
    industry: str | None = None
    tech_stack: list[str]
    values: list[str]
    interview_process: list[str]
    recent_news: list[str]
    citations: list[Citation]


# --- gap ---------------------------------------------------------------------


class GapAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    strengths: list[str]
    gaps: list[str]
    probe_targets: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    summary: str


# --- question ----------------------------------------------------------------


class RubricItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    criterion: str
    weight: float
    description: str


class PlannedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    section: Section
    text: LocalizedText
    difficulty: int
    rubric: list[RubricItem]
    followups: list[str]
    target_competency: str


class LanguageMode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary: Language
    mixed: bool


class QuestionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sections_order: list[Section]
    questions: list[PlannedQuestion]
    time_budget_min: int
    language_mode: LanguageMode


# --- answer ------------------------------------------------------------------


class AnswerRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    transcript: str
    started_at: str
    ended_at: str
    duration_sec: float | None = None
    followups_asked: list[str] = Field(default_factory=list)


# --- score -------------------------------------------------------------------


class CompetencyScore(BaseModel):
    model_config = ConfigDict(extra="forbid")
    competency: str
    score: float
    evidence: str
    level: MasteryLevel


class LanguageReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fluency_score: float
    filler_word_count: int
    clarity_score: float
    code_switching_notes: str
    pronunciation_notes: str
    summary: str


class ModelAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str
    answer: str


# --- insights (Phase 7 — AI-powered post-interview analytics) -----------------


class CommunicationStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    speaking_pace_wpm: float = 0.0
    filler_word_count: int = 0
    filler_words: list[str] = Field(default_factory=list)
    sentence_complexity_ratio: float = 0.0
    confidence_score: float = 0.0
    hedge_word_count: int = 0
    summary: str = ""


class STARAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_id: str = ""
    has_situation: bool = False
    has_task: bool = False
    has_action: bool = False
    has_result: bool = False
    completeness_pct: float = 0.0
    feedback: str = ""


class CulturalFitSignal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    value_name: str = ""
    detected: bool = False
    evidence: str = ""
    alignment_score: float = 0.0


class RedFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str = ""
    severity: str = "low"
    description: str = ""
    evidence: str = ""


class ComparativeBenchmark(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: str = ""
    candidate_value: float = 0.0
    percentile: float = 0.0
    comparison_text: str = ""


class InterviewInsights(BaseModel):
    model_config = ConfigDict(extra="forbid")
    communication_style: CommunicationStyle = Field(default_factory=CommunicationStyle)
    star_analysis: list[STARAnalysis] = Field(default_factory=list)
    star_overall_pct: float = 0.0
    cultural_fit: list[CulturalFitSignal] = Field(default_factory=list)
    cultural_fit_score: float = 0.0
    red_flags: list[RedFlag] = Field(default_factory=list)
    benchmarks: list[ComparativeBenchmark] = Field(default_factory=list)
    summary: str = ""


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


class ScoreCard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    overall_score: float
    competency_scores: list[CompetencyScore]
    strengths: list[str]
    weaknesses: list[str]
    weak_competencies: list[str]
    model_answers: list[ModelAnswer]
    next_steps: list[str]
    language_report: LanguageReport
    summary: str
    coverage_pct: float = 1.0
    # Phase 7: optional AI-powered insights (populated when enable_ai_insights is on).
    insights: InterviewInsights | None = None
    # P0: AI Match Score (0-100) + recommendation.
    match_score: MatchScoreBreakdown | None = None
    # P0: Auto-generated candidate feedback.
    candidate_feedback: CandidateFeedback | None = None


# --- coach (WP-4 study coach) ------------------------------------------------


MasteryState = Literal["unseen", "learning", "shaky", "mastered"]


class StudyModule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: str
    competency: str
    status: MasteryState
    est_min: int
    rationale: str


class StudyPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    modules: list[StudyModule]
    summary: str
    total_min: int


class CoachChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    query: str
    lang: Language


class CoachReply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str
    citations: list[Citation]
    follow_ups: list[str]


# --- interview context -------------------------------------------------------


class InterviewContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    candidate: CandidateProfile
    job: JobSpec
    company: CompanyIntel
    gap: GapAnalysis
    plan: QuestionPlan
    cursor: int = 0
    answers: list[AnswerRecord] = Field(default_factory=list)
    scorecard: ScoreCard | None = None


# --- room --------------------------------------------------------------------


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    identity: str
    name: str | None = None


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: str
    url: str
    room: str


class RoomMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str


# --- api ---------------------------------------------------------------------


class PrepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cv_url: str
    jd_text: str
    company: str
    language_mode: LanguageMode
    # Owning user (Supabase auth uid). Optional so the offline/dev path (no auth)
    # still validates; when present it is stamped on the `sessions` row so the
    # report's RLS read (auth.uid() = user_id) can see the row. Mirrors api.ts.
    user_id: str | None = None


class PrepResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str


class ScoreRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str


class ScoreResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    scorecard: ScoreCard


class KbIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Knowledge-store PARTITION key (the session_id in the OSS auth-free flow),
    # NOT a user id. Mirrors api.ts.
    store_key: str
    files: list[str]


class KbIngestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    track_id: str


class KbQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # Knowledge-store partition key (the session_id in the OSS flow). Mirrors api.ts.
    store_key: str
    query: str
    lang: Language


class KbQueryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str
    citations: list[Citation]


# --- registry (mirrors packages/shared/src/registry.ts SCHEMAS) --------------

MODELS: dict[str, type[BaseModel]] = {
    "Project": Project,
    "Education": Education,
    "CandidateProfile": CandidateProfile,
    "JobSpec": JobSpec,
    "Citation": Citation,
    "CompanyIntel": CompanyIntel,
    "GapAnalysis": GapAnalysis,
    "RubricItem": RubricItem,
    "PlannedQuestion": PlannedQuestion,
    "LanguageMode": LanguageMode,
    "QuestionPlan": QuestionPlan,
    "AnswerRecord": AnswerRecord,
    "CompetencyScore": CompetencyScore,
    "LanguageReport": LanguageReport,
    "ModelAnswer": ModelAnswer,
    "ScoreCard": ScoreCard,
    "StudyModule": StudyModule,
    "StudyPlan": StudyPlan,
    "CoachChatRequest": CoachChatRequest,
    "CoachReply": CoachReply,
    "InterviewContext": InterviewContext,
    "TokenRequest": TokenRequest,
    "TokenResponse": TokenResponse,
    "RoomMetadata": RoomMetadata,
    "PrepRequest": PrepRequest,
    "PrepResponse": PrepResponse,
    "ScoreRequest": ScoreRequest,
    "ScoreResponse": ScoreResponse,
    "KbIngestRequest": KbIngestRequest,
    "KbIngestResponse": KbIngestResponse,
    "KbQueryRequest": KbQueryRequest,
    "KbQueryResponse": KbQueryResponse,
}
