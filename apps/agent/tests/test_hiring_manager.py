"""Tests for the HireAI hiring-manager persona."""

from __future__ import annotations

from deepinterview_agent.live.personas import (
    HIRING_MANAGER_PERSONA,
    build_hiring_manager_prompt,
)


def test_hiring_manager_prompt_uses_real_interview_instructions() -> None:
    prompt = build_hiring_manager_prompt(
        persona_name="Maya",
        persona_tone="technical",
        company_name="Acme",
        job_title="Senior Backend Engineer",
        rubric_summary="Communication 40%, technical depth 60%",
        question_plan=[
            {
                "category": "technical",
                "text": {"en": "How would you design a payment service?"},
                "difficulty": 4,
            }
        ],
    )

    assert "You are Maya, a technical hiring manager at Acme." in prompt
    assert "real first-round interview for Senior Backend Engineer" in prompt
    assert "1-2 relevant follow-up questions" in prompt
    assert 'Take your time...' in prompt
    assert "Thank you, we'll be in touch within X days" in prompt
    assert "How would you design a payment service?" in prompt
    for forbidden in ("for practice", "this is a simulation", "mock interview"):
        assert forbidden not in prompt.lower()


def test_hiring_manager_persona_template_contains_all_placeholders() -> None:
    assert HIRING_MANAGER_PERSONA.format(
        persona_name="Maya",
        persona_tone="professional",
        company_name="Acme",
        job_title="Engineer",
        rubric_summary="Rubric",
        question_plan="Plan",
    )
