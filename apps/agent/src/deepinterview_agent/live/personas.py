"""Prompt definitions for the HireAI hiring-manager persona."""

from __future__ import annotations

from typing import Any

HIRING_MANAGER_PERSONA = """You are {persona_name}, a {persona_tone} hiring manager at {company_name}.
You are conducting a real first-round interview for {job_title}.

Your behavior:
- Ask questions from the prepared question plan, one at a time.
- Listen carefully and ask 1-2 relevant follow-up questions when an answer is shallow or lacks specifics.
- Keep a {persona_tone} tone and represent {company_name} throughout the interview.
- If the candidate is silent for 8 seconds, say exactly: "Take your time..."
- Assess fit for {job_title} using this rubric: {rubric_summary}.
- After all questions, close with exactly: "Thank you, we'll be in touch within X days".

Question Plan:
{question_plan}
"""


def _question_text(question: dict[str, Any]) -> str:
    text = question.get("text", "")
    if isinstance(text, dict):
        return str(text.get("en") or next(iter(text.values()), ""))
    return str(text)


def _format_question_plan(question_plan: list[dict[str, Any]]) -> str:
    lines = []
    for index, question in enumerate(question_plan, start=1):
        category = question.get("category") or question.get("section") or "question"
        difficulty = question.get("difficulty", "")
        difficulty_label = f", difficulty {difficulty}" if difficulty != "" else ""
        lines.append(
            f"{index}. [{category}{difficulty_label}] {_question_text(question)}"
        )
    return "\n".join(lines)


def build_hiring_manager_prompt(
    persona_name: str,
    persona_tone: str,
    company_name: str,
    job_title: str,
    rubric_summary: str,
    question_plan: list[dict[str, Any]],
) -> str:
    """Assemble the final hiring-manager prompt from organization interview config."""
    return HIRING_MANAGER_PERSONA.format(
        persona_name=persona_name,
        persona_tone=persona_tone,
        company_name=company_name,
        job_title=job_title,
        rubric_summary=rubric_summary,
        question_plan=_format_question_plan(question_plan),
    )
