"""AI Match Score computation (0-100).

Replaces the 0-5 overall score with a percentage-based "AI Match Score"
that's immediately actionable for recruiters. Modeled after micro1's
AI Match Score.

Score = weighted(
  competency_avg   * 0.40   Technical fit
  communication    * 0.20   How clearly they communicate
  star_completeness * 0.15  Behavioral depth
  proctoring_conf  * 0.10   Interview integrity
  cultural_fit     * 0.15   Values alignment
)

All components normalized to 0-100 before weighting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..shared_models import InterviewInsights, ScoreCard


@dataclass
class MatchScoreBreakdown:
    """Detailed breakdown of the AI Match Score."""

    technical_fit: float = 0.0  # 0-100, weighted 0.40
    communication: float = 0.0  # 0-100, weighted 0.20
    behavioral_depth: float = 0.0  # 0-100, weighted 0.15
    proctoring_confidence: float = 100.0  # 0-100, weighted 0.10
    cultural_fit: float = 0.0  # 0-100, weighted 0.15
    final_score: float = 0.0  # 0-100
    recommendation: str = ""  # strong_hire | hire | maybe | no_hire | strong_no_hire
    summary: str = ""


# Weight constants.
_W_TECHNICAL = 0.40
_W_COMMUNICATION = 0.20
_W_BEHAVIORAL = 0.15
_W_PROCTORING = 0.10
_W_CULTURAL = 0.15


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def compute_match_score(
    scorecard: ScoreCard,
    insights: InterviewInsights | None = None,
    proctoring_score: float | None = None,
) -> MatchScoreBreakdown:
    """Compute the AI Match Score (0-100) from interview results.

    Args:
        scorecard: The scored interview result.
        insights: Optional AI insights (STAR, communication, cultural fit).
        proctoring_score: Optional proctoring integrity score (0-100).

    Returns:
        MatchScoreBreakdown with the final score and all components.
    """
    # 1. Technical fit: competency scores averaged, normalized to 0-100.
    if scorecard.competency_scores:
        avg = sum(c.score for c in scorecard.competency_scores) / len(
            scorecard.competency_scores
        )
        technical_fit = _clamp(avg / 5.0 * 100)
    else:
        technical_fit = _clamp(scorecard.overall_score / 5.0 * 100)

    # 2. Communication: from insights or language report.
    communication = 50.0  # default mid-range
    if insights and insights.communication_style:
        cs = insights.communication_style
        # Combine confidence (0-1) + inverse filler density + pace sanity.
        conf_component = cs.confidence_score * 100
        pace_component = 100.0
        if cs.speaking_pace_wpm > 0:
            # Ideal pace: 120-180 WPM. Deviation penalizes.
            pace_diff = abs(cs.speaking_pace_wpm - 150) / 150
            pace_component = _clamp(100 - pace_diff * 50)
        fillers_penalty = min(30, cs.filler_word_count * 3)
        communication = _clamp(
            conf_component * 0.5 + pace_component * 0.3 + (100 - fillers_penalty) * 0.2
        )
    elif scorecard.language_report:
        lr = scorecard.language_report
        communication = _clamp(
            (lr.fluency_score / 5.0 * 50) + (lr.clarity_score / 5.0 * 50)
        )

    # 3. Behavioral depth: STAR completeness.
    behavioral = 50.0
    if insights and insights.star_analysis:
        behavioral = _clamp(insights.star_overall_pct)

    # 4. Proctoring confidence.
    proctoring = 100.0
    if proctoring_score is not None:
        proctoring = _clamp(proctoring_score)
    elif insights and insights.red_flags:
        # Each red flag reduces confidence.
        penalty = sum(
            15 if f.severity == "high" else 10 if f.severity == "medium" else 5
            for f in insights.red_flags
        )
        proctoring = _clamp(100 - penalty)

    # 5. Cultural fit.
    cultural = 50.0
    if insights and insights.cultural_fit:
        scores = [cf.alignment_score for cf in insights.cultural_fit if cf.detected]
        if scores:
            cultural = _clamp(sum(scores) / len(scores) * 100)

    # Weighted final.
    final = _clamp(
        technical_fit * _W_TECHNICAL
        + communication * _W_COMMUNICATION
        + behavioral * _W_BEHAVIORAL
        + proctoring * _W_PROCTORING
        + cultural * _W_CULTURAL
    )

    # Recommendation.
    if final >= 80:
        recommendation = "strong_hire"
    elif final >= 65:
        recommendation = "hire"
    elif final >= 45:
        recommendation = "maybe"
    elif final >= 30:
        recommendation = "no_hire"
    else:
        recommendation = "strong_no_hire"

    # Summary.
    rec_labels = {
        "strong_hire": "Strong Hire",
        "hire": "Hire",
        "maybe": "Maybe",
        "no_hire": "No Hire",
        "strong_no_hire": "Strong No Hire",
    }
    summary = (
        f"AI Match Score: {final:.0f}/100 — {rec_labels[recommendation]}. "
        f"Technical fit {technical_fit:.0f}%, communication {communication:.0f}%, "
        f"behavioral depth {behavioral:.0f}%, proctoring {proctoring:.0f}%, "
        f"cultural fit {cultural:.0f}%."
    )

    return MatchScoreBreakdown(
        technical_fit=round(technical_fit, 1),
        communication=round(communication, 1),
        behavioral_depth=round(behavioral, 1),
        proctoring_confidence=round(proctoring, 1),
        cultural_fit=round(cultural, 1),
        final_score=round(final, 1),
        recommendation=recommendation,
        summary=summary,
    )
