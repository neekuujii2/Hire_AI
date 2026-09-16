"""Prompt builders for AI-powered interview insights analysis.

Returns ``(system, user)`` message tuples for GPT-4o to analyze interview
transcripts for communication style, STAR patterns, cultural fit, and
red flags.
"""

from __future__ import annotations

from typing import Any


def insights_analysis_prompts(
    answers: list[dict[str, str]],
    competency_scores: list[dict[str, Any]],
    company_values: list[str],
) -> tuple[str, str]:
    """Build system + user prompts for the insights LLM analysis.

    Args:
        answers: List of ``{question, answer}`` dicts (truncated to 500 chars each).
        competency_scores: List of ``{competency, score}`` dicts.
        company_values: Company values to check cultural fit against.

    Returns:
        ``(system_prompt, user_prompt)`` tuple.
    """
    system = (
        "You are an expert hiring analyst. Given an interview transcript and scores, "
        "produce a JSON object with advanced insights. Be factual and grounded in "
        "the actual transcript text — never fabricate claims.\n\n"
        "Return ONLY a JSON object with this structure:\n"
        "{\n"
        '  "cultural_fit": [\n'
        '    { "value_name": "...", "detected": true/false, "evidence": "...", "alignment_score": 0.0-1.0 }\n'
        "  ],\n"
        '  "benchmarks": [\n'
        '    { "metric": "...", "candidate_value": 0.0, "percentile": 0-100, "comparison_text": "..." }\n'
        "  ]\n"
        "}"
    )

    answers_text = "\n\n".join(
        f"Q{i+1}: {a['question']}\nA{i+1}: {a['answer']}"
        for i, a in enumerate(answers)
    )

    scores_text = "\n".join(
        f"  - {s['competency']}: {s['score']}/5"
        for s in competency_scores
    )

    values_text = ", ".join(company_values) if company_values else "Not specified"

    user = (
        f"Interview transcript:\n{answers_text}\n\n"
        f"Competency scores:\n{scores_text}\n\n"
        f"Company values: {values_text}\n\n"
        "Analyze this interview and return the JSON insights object."
    )

    return system, user
