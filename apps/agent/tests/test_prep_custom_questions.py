"""Tests for org question banks in the prep graph."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from deepinterview_agent.prep import nodes
from deepinterview_agent.prep.state import PrepState
from deepinterview_agent.shared_models import (
    GapAnalysis,
    LanguageMode,
    PlannedQuestion,
    QuestionPlan,
    RubricItem,
)


def _question(difficulty: int, question_id: str = "ai") -> PlannedQuestion:
    return PlannedQuestion(
        id=question_id,
        section="technical",
        text={"en": f"AI question at difficulty {difficulty}"},
        difficulty=difficulty,
        rubric=[RubricItem(criterion="Technical depth", weight=1.0, description="Strong answer")],
        followups=["Tell me more."],
        target_competency="Technical depth",
    )


def _plan() -> QuestionPlan:
    return QuestionPlan(
        sections_order=["intro", "technical", "wrap"],
        questions=[_question(2, "ai-easy"), _question(4, "ai-hard")],
        time_budget_min=15,
        language_mode=LanguageMode(primary="en", mixed=False),
    )


def test_prep_state_carries_hireai_org_context() -> None:
    annotations = PrepState.__annotations__
    assert annotations["company_name"] is str
    assert annotations["org_id"] is str
    assert annotations["question_bank"] == list[dict]
    assert annotations["rubric"] == dict
    assert annotations["persona_name"] is str
    assert annotations["persona_tone"] is str


def test_merge_question_plans_inserts_custom_questions_by_difficulty() -> None:
    custom = [
        {
            "id": "custom-easy",
            "text": "Describe a difficult stakeholder conversation.",
            "category": "behavioral",
            "difficulty": 1,
            "follow_ups": ["What was the outcome?"],
        },
        {
            "id": "custom-mid",
            "text": "How do you prioritize competing delivery risks?",
            "category": "technical",
            "difficulty": 3,
            "follow_ups": ["What trade-off did you make?"],
        },
    ]
    rubric = {"competencies": [{"name": "Communication", "weight": 1.0}]}

    merged = nodes.merge_question_plans(
        _plan(), custom_questions=custom, rubric=rubric, difficulty_ramp=[1, 2, 3, 4]
    )

    assert [question.difficulty for question in merged.questions] == [1, 2, 3, 4]
    assert [question.id for question in merged.questions] == [
        "custom-easy",
        "ai-easy",
        "custom-mid",
        "ai-hard",
    ]
    assert merged.questions[0].section == "behavioral"
    assert merged.questions[0].rubric[0].criterion == "Communication"


def test_question_planner_injects_and_merges_org_context() -> None:
    class RecordingLLM:
        def __init__(self) -> None:
            self.user = ""

        async def complete_json(self, *, system: str, user: str, schema: type):
            self.user = user
            return _plan()

    llm = RecordingLLM()
    deps = SimpleNamespace(llm=llm, repo=SimpleNamespace(mark_progress=lambda *args: None))
    state: PrepState = {
        "req": SimpleNamespace(language_mode=LanguageMode(primary="en", mixed=False)),
        "candidate": SimpleNamespace(headline="Engineer", years_experience=5, skills=["Python"]),
        "job": SimpleNamespace(title="Senior Engineer", seniority="senior"),
        "company": SimpleNamespace(
            name="Acme", values=[], interview_process=[], tech_stack=[]
        ),
        "gap": SimpleNamespace(
            strengths=[], gaps=[], probe_targets=[], missing_skills=[]
        ),
        "company_name": "Acme",
        "org_id": "org-1",
        "question_bank": [
            {
                "id": "custom",
                "text": "Custom org question",
                "category": "technical",
                "difficulty": 3,
                "follow_ups": ["Why?"],
            }
        ],
        "rubric": {"competencies": [{"name": "Ownership", "weight": 1.0}]},
        "persona_name": "Maya",
        "persona_tone": "professional",
    }

    result = asyncio.run(nodes.question_planner(state, deps))  # type: ignore[arg-type]
    plan = result["plan"]

    assert "Custom org question" in llm.user
    assert [question.id for question in plan.questions] == ["ai-easy", "custom", "ai-hard"]
    assert plan.questions[1].difficulty == 3
