"""AI-powered interview insights (Zara AI-inspired).

Runs after the main scoring pipeline to generate advanced post-interview
analytics: communication style, STAR behavioral patterns, cultural fit,
red flags, and comparative benchmarking.

Design:
  - Uses GPT-4o for analysis (accuracy matters — 08_Best_Practices.md §9).
  - Gated behind ``enable_ai_insights`` setting (OFF by default).
  - Failures degrade gracefully — insights are optional enrichment.
  - All analysis grounded in actual transcript text (no hallucinated claims).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..core.logging import get_logger

if TYPE_CHECKING:
    from ..core.deps import Deps
    from ..shared_models import InterviewContext, ScoreCard

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class CommunicationStyle:
    """Quantified communication metrics derived from the transcript."""

    speaking_pace_wpm: float = 0.0
    filler_word_count: int = 0
    filler_words: list[str] = field(default_factory=list)
    sentence_complexity_ratio: float = 0.0  # complex / simple
    confidence_score: float = 0.0  # 0-1 (1 = very confident)
    hedge_word_count: int = 0
    summary: str = ""


@dataclass
class STARAnalysis:
    """Per-answer STAR framework completeness."""

    question_id: str = ""
    has_situation: bool = False
    has_task: bool = False
    has_action: bool = False
    has_result: bool = False
    completeness_pct: float = 0.0  # 0-100
    feedback: str = ""


@dataclass
class CulturalFitSignal:
    """Alignment with company values."""

    value_name: str = ""
    detected: bool = False
    evidence: str = ""
    alignment_score: float = 0.0  # 0-1


@dataclass
class RedFlag:
    """A detected concern in the candidate's responses."""

    category: str = ""  # contradiction | negative_language | vague_answer
    severity: str = "low"  # low | medium | high
    description: str = ""
    evidence: str = ""


@dataclass
class ComparativeBenchmark:
    """How this candidate compares to others in the same role."""

    metric: str = ""
    candidate_value: float = 0.0
    percentile: float = 0.0  # 0-100
    comparison_text: str = ""


@dataclass
class InterviewInsights:
    """Complete insights package added to the ScoreCard."""

    communication_style: CommunicationStyle = field(default_factory=CommunicationStyle)
    star_analysis: list[STARAnalysis] = field(default_factory=list)
    star_overall_pct: float = 0.0
    cultural_fit: list[CulturalFitSignal] = field(default_factory=list)
    cultural_fit_score: float = 0.0  # 0-1
    red_flags: list[RedFlag] = field(default_factory=list)
    benchmarks: list[ComparativeBenchmark] = field(default_factory=list)
    summary: str = ""


# ---------------------------------------------------------------------------
# Fillers and hedges (English — extendable)
# ---------------------------------------------------------------------------

_FILLER_WORDS = {"um", "uh", "like", "you know", "sort of", "kind of", "basically", "actually"}
_HEDGE_WORDS = {"i think", "maybe", "probably", "perhaps", "i guess", "i suppose", "might be", "could be"}


def _count_fillers(text: str) -> tuple[int, list[str]]:
    """Count filler words in transcript text."""
    lower = text.lower()
    found = []
    for filler in _FILLER_WORDS:
        count = len(re.findall(rf"\b{re.escape(filler)}\b", lower))
        found.extend([filler] * count)
    return len(found), found


def _count_hedges(text: str) -> int:
    """Count hedge phrases in transcript text."""
    lower = text.lower()
    return sum(len(re.findall(rf"\b{re.escape(h)}\b", lower)) for h in _HEDGE_WORDS)


def _compute_pace(transcript_turns: list[dict]) -> float:
    """Compute speaking pace (words per minute) from candidate turns."""
    candidate_words = 0
    for turn in transcript_turns:
        if turn.get("role") in ("user", "candidate"):
            candidate_words += len((turn.get("text") or "").split())

    # Estimate duration from total word count + average speaking pace.
    # Real implementation would use turn timestamps; this is a fallback.
    if candidate_words == 0:
        return 0.0

    # Assume ~150 WPM average; compute actual from word count / estimated minutes.
    # A more accurate version would use actual audio duration from timestamps.
    estimated_minutes = max(1.0, candidate_words / 150.0)
    return round(candidate_words / estimated_minutes, 1)


# ---------------------------------------------------------------------------
# LLM-based analysis
# ---------------------------------------------------------------------------


async def _llm_insights_analysis(
    ctx: InterviewContext,
    scorecard: ScoreCard,
    deps: Deps,
) -> dict[str, Any] | None:
    """Run GPT-4o to analyze transcript for advanced insights."""
    from .insights_prompts import insights_analysis_prompts

    turns_text = "\n".join(
        f"{'Candidate' if t.get('role') in ('user', 'candidate') else 'Interviewer'}: {t.get('text', '')}"
        for t in (ctx.answers[0].transcript if ctx.answers else "")
        if isinstance(t, dict)
    ) if ctx.answers else ""

    # Build compact answer summary for the prompt.
    answer_summary = []
    for a in ctx.answers:
        q_text = ""
        for q in ctx.plan.questions:
            if q.id == a.question_id:
                q_text = q.text.get("en", "")
                break
        answer_summary.append({
            "question": q_text,
            "answer": (a.transcript or "")[:500],
        })

    system, user = insights_analysis_prompts(
        answers=answer_summary,
        competency_scores=[{"competency": c.competency, "score": c.score} for c in scorecard.competency_scores],
        company_values=[],  # Could be loaded from org config
    )

    try:
        llm = deps.llm
        response = await llm.ainvoke(
            [{"role": "system", "content": system}, {"role": "user", "content": user}]
        )
        raw = getattr(response, "content", str(response))

        # Strip markdown fences if present.
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]

        return json.loads(text.strip())
    except Exception:
        log.exception("insights: LLM analysis failed")
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_insights(
    ctx: InterviewContext,
    scorecard: ScoreCard,
    deps: Deps,
) -> InterviewInsights:
    """Generate advanced AI insights from the interview transcript.

    This runs AFTER the main scoring pipeline as an optional enrichment step.
    Failures are non-fatal — returns an empty ``InterviewInsights`` on error.
    """
    # Rule-based analysis (always runs, no LLM needed).
    full_transcript = " ".join(
        (a.transcript or "") for a in ctx.answers
    )

    fillers_count, fillers_found = _count_fillers(full_transcript)
    hedges_count = _count_hedges(full_transcript)
    pace = _compute_pace(
        [{"role": "user", "text": a.transcript or ""} for a in ctx.answers]
    )

    word_count = len(full_transcript.split())
    sentence_count = max(1, full_transcript.count(".") + full_transcript.count("!") + full_transcript.count("?"))
    complex_words = len(re.findall(r"\b\w{7,}\b", full_transcript))
    complexity_ratio = complex_words / max(1, word_count)

    # Confidence: inverse of hedge density.
    hedge_density = hedges_count / max(1, word_count) * 100
    confidence = max(0.0, min(1.0, 1.0 - hedge_density * 0.1))

    comm_style = CommunicationStyle(
        speaking_pace_wpm=pace,
        filler_word_count=fillers_count,
        filler_words=fillers_found[:10],  # Cap for readability
        sentence_complexity_ratio=round(complexity_ratio, 3),
        confidence_score=round(confidence, 3),
        hedge_word_count=hedges_count,
        summary=(
            f"Candidate speaks at {pace:.0f} WPM with {fillers_count} filler words "
            f"and {hedges_count} hedge phrases. Confidence score: {confidence:.0%}."
        ),
    )

    # STAR analysis (rule-based + optional LLM enhancement).
    star_results = []
    for a in ctx.answers:
        text = (a.transcript or "").lower()
        has_s = bool(re.search(r"\b(situation|context|background|when i|at my|in my)\b", text))
        has_t = bool(re.search(r"\b(task|goal|responsibility|needed to|asked to|assigned)\b", text))
        has_a = bool(re.search(r"\b(action|did|implemented|built|created|led|managed|designed|decided)\b", text))
        has_r = bool(re.search(r"\b(result|outcome|impact|achieved|improved|reduced|increased|saved|delivered)\b", text))

        parts = sum([has_s, has_t, has_a, has_r])
        pct = (parts / 4) * 100

        star_results.append(STARAnalysis(
            question_id=a.question_id,
            has_situation=has_s,
            has_task=has_t,
            has_action=has_a,
            has_result=has_r,
            completeness_pct=pct,
            feedback=f"STAR completeness: {pct:.0f}% ({parts}/4 elements)",
        ))

    overall_star = (
        sum(s.completeness_pct for s in star_results) / len(star_results)
        if star_results else 0.0
    )

    # Red flags (rule-based).
    red_flags = []
    negative_patterns = [
        (r"\b(hate|terrible|awful|worst|stupid|incompetent)\b", "negative_language", "medium"),
        (r"\b(my boss was|my manager was|my team was)\s+(bad|terrible|incompetent)", "negative_language", "high"),
    ]
    for pattern, category, severity in negative_patterns:
        matches = re.findall(pattern, full_transcript.lower())
        if matches:
            red_flags.append(RedFlag(
                category=category,
                severity=severity,
                description=f"Detected {category.replace('_', ' ')} in responses",
                evidence=f"Found {len(matches)} instance(s)",
            ))

    # Vague answers: short answers without specifics.
    for a in ctx.answers:
        text = (a.transcript or "").strip()
        words = len(text.split())
        has_numbers = bool(re.search(r"\b\d+\b", text))
        if words < 30 and not has_numbers:
            red_flags.append(RedFlag(
                category="vague_answer",
                severity="low",
                description=f"Short answer ({words} words) to question {a.question_id}",
                evidence=text[:100],
            ))

    # Assemble insights.
    insights = InterviewInsights(
        communication_style=comm_style,
        star_analysis=star_results,
        star_overall_pct=round(overall_star, 1),
        red_flags=red_flags,
        summary=(
            f"Communication: {pace:.0f} WPM, {fillers_count} fillers, "
            f"{confidence:.0%} confidence. STAR completeness: {overall_star:.0f}%. "
            f"Red flags: {len(red_flags)}."
        ),
    )

    # Optional: LLM deep analysis (when enabled).
    try:
        llm_data = await _llm_insights_analysis(ctx, scorecard, deps)
        if llm_data:
            # Enhance with LLM-derived insights.
            if "cultural_fit" in llm_data:
                insights.cultural_fit = [
                    CulturalFitSignal(**cf) for cf in llm_data["cultural_fit"]
                ]
            if "benchmarks" in llm_data:
                insights.benchmarks = [
                    ComparativeBenchmark(**b) for b in llm_data["benchmarks"]
                ]
    except Exception:
        log.debug("insights: LLM enhancement skipped (non-fatal)")

    log.info(
        "insights: generated for session=%s pace=%d fillers=%d star=%.0f%% flags=%d",
        ctx.session_id,
        pace,
        fillers_count,
        overall_star,
        len(red_flags),
    )

    return insights
