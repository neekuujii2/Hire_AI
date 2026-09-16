"""Auto-generated candidate feedback for rejected applicants.

Modeled after micro1/Zara's feedback system which achieves 75% automated
query resolution and 4.37/5 NPS. Generates personalized, constructive
feedback based on interview performance.

Design:
  - Uses GPT-4o for feedback generation (accuracy matters).
  - Generates 2-3 strengths + 2-3 improvement areas.
  - Never mentions soft skills (legal risk reduction).
  - Constructive, supportive tone.
  - Integrates with email queue for delivery.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING

from ..core.logging import get_logger

if TYPE_CHECKING:
    from ..core.deps import Deps
    from ..shared_models import InterviewContext, ScoreCard

log = get_logger(__name__)


@dataclass
class CandidateFeedback:
    """Structured feedback for a rejected candidate."""

    strengths: list[str]
    improvement_areas: list[str]
    overall_assessment: str
    encouragement: str
    full_text: str = ""


def _feedback_prompt(
    candidate_name: str,
    job_title: str,
    company_name: str,
    scorecard: ScoreCard,
    context: InterviewContext | None = None,
) -> tuple[str, str]:
    """Build system + user prompts for feedback generation."""
    system = (
        "You are an expert hiring coach generating personalized interview feedback "
        "for a candidate who was not selected. Your feedback must be:\n"
        "1. Specific and actionable (not generic)\n"
        "2. Constructive and supportive in tone\n"
        "3. Grounded in the actual interview performance\n"
        "4. Never mention soft skills or communication style (legal risk)\n"
        "5. Include 2-3 specific strengths and 2-3 improvement areas\n"
        "6. End with encouragement\n\n"
        "Return ONLY a JSON object:\n"
        "{\n"
        '  "strengths": ["specific strength 1", "specific strength 2"],\n'
        '  "improvement_areas": ["specific area 1", "specific area 2"],\n'
        '  "overall_assessment": "one paragraph summary",\n'
        '  "encouragement": "supportive closing message"\n'
        "}"
    )

    # Build compact competency summary.
    comp_lines = []
    for c in scorecard.competency_scores:
        comp_lines.append(f"  - {c.competency}: {c.score}/5 ({c.level}) — {c.evidence[:200]}")
    competencies = "\n".join(comp_lines) or "  (no competency data)"

    strengths = "\n".join(f"  - {s}" for s in scorecard.strengths) or "  (none identified)"
    weaknesses = "\n".join(f"  - {w}" for w in scorecard.weaknesses) or "  (none identified)"

    # Add answer summaries if available.
    answer_summary = ""
    if context and context.answers:
        parts = []
        for a in context.answers[:8]:  # Cap at 8 for prompt size.
            text = (a.transcript or "")[:300]
            parts.append(f"Q: {a.question_id}\nA: {text}")
        answer_summary = "\n\n".join(parts)

    user = (
        f"Candidate: {candidate_name}\n"
        f"Position: {job_title} at {company_name}\n"
        f"Overall Score: {scorecard.overall_score}/5\n"
        f"Coverage: {scorecard.coverage_pct:.0%} of questions answered\n\n"
        f"Competency Scores:\n{competencies}\n\n"
        f"Identified Strengths:\n{strengths}\n\n"
        f"Identified Weaknesses:\n{weaknesses}\n\n"
        f"Score Summary:\n{scorecard.summary}\n"
    )

    if answer_summary:
        user += f"\n\nSample Answers:\n{answer_summary}"

    user += "\n\nGenerate personalized feedback for this candidate."

    return system, user


async def generate_candidate_feedback(
    context: InterviewContext,
    scorecard: ScoreCard,
    deps: Deps,
) -> CandidateFeedback:
    """Generate personalized feedback for a rejected candidate.

    Returns structured feedback that can be sent via email or shown in the
    candidate portal. Falls back to a generic template on LLM failure.
    """
    system, user = _feedback_prompt(
        candidate_name=context.candidate.name,
        job_title=context.job.title,
        company_name=context.company.name,
        scorecard=scorecard,
        context=context,
    )

    try:
        llm = deps.llm
        response = await llm.ainvoke(
            [{"role": "system", "content": system}, {"role": "user", "content": user}]
        )
        raw = getattr(response, "content", str(response))

        # Strip markdown fences.
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]

        data = json.loads(text.strip())

        strengths = data.get("strengths", [])
        improvement_areas = data.get("improvement_areas", [])
        overall = data.get("overall_assessment", "")
        encouragement = data.get("encouragement", "")

        # Assemble full text.
        full_parts = []
        if overall:
            full_parts.append(overall)
        if strengths:
            full_parts.append("Strengths:\n" + "\n".join(f"• {s}" for s in strengths))
        if improvement_areas:
            full_parts.append(
                "Areas for Growth:\n" + "\n".join(f"• {a}" for a in improvement_areas)
            )
        if encouragement:
            full_parts.append(encouragement)

        return CandidateFeedback(
            strengths=strengths,
            improvement_areas=improvement_areas,
            overall_assessment=overall,
            encouragement=encouragement,
            full_text="\n\n".join(full_parts),
        )

    except Exception:
        log.exception("feedback: LLM generation failed; using template fallback")

    # Fallback template.
    strengths = [s for s in scorecard.strengths[:3]] or ["Your preparation for the interview"]
    improvements = [w for w in scorecard.weaknesses[:3]] or [
        "Review the job requirements more deeply"
    ]

    full = (
        f"Thank you for completing your interview for {context.job.title} at {context.company.name}.\n\n"
        f"After careful review, we've decided to move forward with other candidates. "
        f"This does not reflect on your overall abilities — hiring decisions are often "
        f"about specific fit for a particular role at a particular time.\n\n"
        f"Strengths we observed:\n" + "\n".join(f"• {s}" for s in strengths) + "\n\n"
        f"Areas that could strengthen future applications:\n"
        + "\n".join(f"• {a}" for a in improvements)
        + "\n\n"
        "We encourage you to apply for future roles that match your skills. "
        "Wishing you the best in your job search."
    )

    return CandidateFeedback(
        strengths=strengths,
        improvement_areas=improvements,
        overall_assessment=f"Thank you for interviewing for {context.job.title}.",
        encouragement="We wish you the best in your career journey.",
        full_text=full,
    )
