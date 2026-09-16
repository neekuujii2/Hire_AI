"""Async node functions for the WP-6 prep graph.

Every node takes ``(state, deps)`` and returns a partial ``PrepState`` dict with
only the key(s) it computes; LangGraph merges those into the running state. Deps
are injected into the graph via :func:`functools.partial` (see ``graph.py``), so
each compiled node presents the ``(state)`` signature LangGraph expects.

``fetch_cv`` is deliberately best-effort and offline-tolerant: it delegates to
:func:`deepinterview_agent.prep.cv_extract.extract_cv_text`, which parses an
uploaded PDF/DOCX (``data:`` URL or fetched ``http(s)`` URL) into real text and,
on any failure, falls back to the URL string itself as the document text. This
keeps the whole pipeline — and the existing ``POST /api/prep`` test that points
at an unreachable example.com — green without network access.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ..core.adapters.mock import build_mock
from ..core.logging import get_logger
from ..core.tracing import traced
from ..shared_models import (
    CandidateProfile,
    Citation,
    CompanyIntel,
    GapAnalysis,
    JobSpec,
    PlannedQuestion,
    QuestionPlan,
    RubricItem,
)
from .cv_extract import extract_cv_text
from .prompts import (
    company_research_prompts,
    cv_analysis_prompts,
    gap_matching_prompts,
    jd_analysis_prompts,
    language_name,
    question_planner_prompts,
)
from .state import PrepState

if TYPE_CHECKING:
    from ..core.deps import Deps

log = get_logger(__name__)


async def _mark(state: PrepState, deps: Deps, step: str) -> None:
    """Record that ``step`` finished, if running against a known session.

    Best-effort: a missing/closed session must never crash prep — the progress
    signal is for the UI only.
    """
    session_id = state.get("session_id")
    if not session_id:
        return
    try:
        await deps.repo.mark_progress(session_id, step)
    except Exception as exc:  # noqa: BLE001 - progress is advisory only
        log.warning("mark_progress(%s) failed (%s)", step, exc)


async def _warn(state: PrepState, deps: Deps, warnings: list[str]) -> None:
    """Attach input-quality/fallback warnings to the session (best-effort)."""
    session_id = state.get("session_id")
    if not session_id or not warnings:
        return
    try:
        await deps.repo.add_warnings(session_id, warnings)
    except Exception as exc:  # noqa: BLE001 - warnings are advisory only
        log.warning("add_warnings failed (%s)", exc)


@traced("prep.fetch_cv")
async def fetch_cv(state: PrepState, deps: Deps) -> PrepState:
    """Best-effort parse of the CV document into text; fall back to the URL string.

    Delegates to :func:`extract_cv_text`, which converts an uploaded PDF/DOCX
    (``data:`` URL or fetched ``http(s)`` URL) into plain text via markitdown
    (Gemini fallback for scanned/image PDFs). Any returned warnings are attached
    to the session via ``_warn``.

    Idempotent: if ``cv_text`` was already resolved (the caller pre-fetched it so
    it could validate inputs), this is a no-op — we never parse the CV twice. We
    check key *presence*, not truthiness: an unreadable document resolves to ``""``
    and must NOT trigger a re-parse (which would re-warn and re-bill Gemini).
    """
    if "cv_text" in state:
        return {}
    req = state["req"]
    try:
        cv_text, warnings = await extract_cv_text(req.cv_url, deps)
    except Exception as exc:  # noqa: BLE001 - best-effort: any failure -> raw fallback
        log.warning("fetch_cv: extraction failed, using cv_url as text (%s)", exc)
        return {"cv_text": req.cv_url}
    if warnings:
        await _warn(state, deps, warnings)
    return {"cv_text": cv_text}


@traced("prep.cv_analysis")
async def cv_analysis(state: PrepState, deps: Deps) -> PrepState:
    """Extract a ``CandidateProfile`` from the fetched CV text."""
    system, user = cv_analysis_prompts(state["cv_text"])
    try:
        candidate = await deps.llm.complete_json(
            system=system, user=user, schema=CandidateProfile
        )
    except Exception as exc:  # noqa: BLE001 - resilient: degrade, don't crash prep
        log.warning("cv_analysis failed, using minimal profile (%s)", exc)
        candidate = build_mock(CandidateProfile)
        await _warn(state, deps, ["Could not analyze the CV; used a minimal profile."])
    await _mark(state, deps, "cv_analysis")
    return {"candidate": candidate}


@traced("prep.jd_analysis")
async def jd_analysis(state: PrepState, deps: Deps) -> PrepState:
    """Extract a ``JobSpec`` from the job description text."""
    req = state["req"]
    system, user = jd_analysis_prompts(req.jd_text, req.company)
    try:
        job = await deps.llm.complete_json(system=system, user=user, schema=JobSpec)
    except Exception as exc:  # noqa: BLE001 - resilient: degrade, don't crash prep
        log.warning("jd_analysis failed, using minimal job spec (%s)", exc)
        job = build_mock(JobSpec)
        await _warn(
            state, deps, ["Could not analyze the job description; used a minimal spec."]
        )
    await _mark(state, deps, "jd_analysis")
    return {"job": job}


def _empty_company_intel(name: str) -> CompanyIntel:
    """A valid, empty ``CompanyIntel`` for a junk/unknown company (no fabrication)."""
    return CompanyIntel(
        name=name or "Unknown",
        summary="",
        industry=None,
        tech_stack=[],
        values=[],
        interview_process=[],
        recent_news=[],
        citations=[],
    )


@traced("prep.company_research")
async def company_research(state: PrepState, deps: Deps) -> PrepState:
    """Search the web for company interview intel and synthesize ``CompanyIntel``.

    If the company name was flagged junk (``company_ok`` is False) this skips all
    search + LLM work and returns an empty-but-valid intel, so we never fabricate
    company knowledge from a meaningless name or waste calls on it.
    """
    req = state["req"]
    company = req.company

    if not state.get("company_ok", True):
        log.info("company_research: skipping for junk company %r", company)
        await _mark(state, deps, "company_research")
        return {"company": _empty_company_intel(company)}

    primary = req.language_mode.primary

    queries: list[tuple[str, str]] = [(f"{company} interview process", "en")]
    if primary != "en":
        localized = f"{company} interview process {language_name(primary)}"
        queries.append((localized, primary))

    results = []
    for query, lang in queries:
        try:
            results.extend(await deps.search.search(query, lang=lang, max_results=4))
        except Exception as exc:  # noqa: BLE001 - search is best-effort
            log.warning("company_research: search failed for %r (%s)", query, exc)

    snippets = "\n".join(f"- {r.title}: {r.snippet}" for r in results) or "(no results)"
    system, user = company_research_prompts(company, snippets)
    try:
        intel = await deps.llm.complete_json(
            system=system, user=user, schema=CompanyIntel
        )
    except Exception as exc:  # noqa: BLE001 - resilient: degrade, don't crash prep
        log.warning("company_research failed, using minimal intel (%s)", exc)
        intel = _empty_company_intel(company)
        await _warn(
            state, deps, ["Could not research the company; proceeding without intel."]
        )

    citations = [
        Citation(title=r.title, url=r.url, snippet=r.snippet) for r in results
    ]
    intel = intel.model_copy(update={"citations": citations})
    await _mark(state, deps, "company_research")
    return {"company": intel}


@traced("prep.gap_matching")
async def gap_matching(state: PrepState, deps: Deps) -> PrepState:
    """Compare candidate vs job into a ``GapAnalysis`` (join of cv + jd)."""
    system, user = gap_matching_prompts(state["candidate"], state["job"])
    try:
        gap = await deps.llm.complete_json(
            system=system, user=user, schema=GapAnalysis
        )
    except Exception as exc:  # noqa: BLE001 - resilient: degrade, don't crash prep
        log.warning("gap_matching failed, using minimal analysis (%s)", exc)
        gap = build_mock(GapAnalysis)
        await _warn(state, deps, ["Could not compute the gap analysis; used a minimal one."])
    await _mark(state, deps, "gap_matching")
    return {"gap": gap}


# Body sections a pack contributes to the planner prompt, and the total budget.
# Bounded so a growing library can never blow up prep prompt size (golden rule:
# keep prompts compact).
_HINT_SECTIONS = frozenset({"round structure", "question bank", "signals", "pitfalls"})
_HINT_CHAR_BUDGET = 1500


def _extract_hint_sections(body_md: str) -> str:
    """Pull the planner-relevant ``##`` sections out of a pack body, in order."""
    sections: list[tuple[str, list[str]]] = []
    current: list[str] | None = None
    for line in body_md.splitlines():
        if line.startswith("## "):
            title = line[3:].strip()
            current = [] if title.lower() in _HINT_SECTIONS else None
            if current is not None:
                sections.append((title, current))
        elif current is not None:
            current.append(line)
    parts = [f"{title}:\n" + "\n".join(lines).strip() for title, lines in sections if lines]
    return "\n".join(p for p in parts if not p.endswith(":\n"))


def _skill_library_hint(
    company: str, role: str, level: str, skills_dir: str | None = None
) -> str:
    """Playbook context for the planner (WP-10 retrieval): provenance header
    plus the pack's question bank / signals / pitfalls, capped at
    ``_HINT_CHAR_BUDGET`` characters.

    Best-effort and additive: any failure (missing/un-parseable library, import
    error) returns an empty string so prep never depends on the skill store.
    """
    try:
        from ..skilllib import effective_confidence, find_relevant

        skills = find_relevant(skills_dir, company=company, role=role, level=level)
        if not skills:
            return ""
        blocks: list[str] = []
        for skill in skills:
            fm = skill.frontmatter
            header = (
                f"### {fm.company} · {fm.role} · {fm.level} "
                f"[{fm.status}; confidence {effective_confidence(fm):.2f} "
                f"from {fm.source_runs} run(s); verified {fm.last_verified}]"
            )
            extract = _extract_hint_sections(skill.body_md)
            blocks.append(f"{header}\n{extract}" if extract else header)
        hint = "\n\n".join(blocks)
        if len(hint) > _HINT_CHAR_BUDGET:
            hint = hint[:_HINT_CHAR_BUDGET].rsplit("\n", 1)[0] + "\n[truncated]"
        return hint
    except Exception:  # noqa: BLE001 - retrieval is strictly best-effort
        return ""


# --- HireAI org question-bank merge -------------------------------------------

_VALID_SECTIONS = frozenset({"intro", "behavioral", "technical", "coding", "wrap"})


def _custom_text_to_localized(text: Any) -> dict[str, str]:
    if isinstance(text, dict):
        en = text.get("en") or next((v for v in text.values() if v), "")
        out = {k: str(v) for k, v in text.items() if v}
        if "en" not in out:
            out["en"] = str(en)
        return out
    return {"en": str(text)}


def _rubric_items_for_custom(rubric: dict[str, Any] | None, fallback: str) -> list[RubricItem]:
    competencies = []
    if isinstance(rubric, dict):
        raw = rubric.get("competencies") or []
        if isinstance(raw, list):
            competencies = [c for c in raw if isinstance(c, dict) and c.get("name")]
    if not competencies:
        return [RubricItem(criterion=fallback, weight=1.0, description="Org custom question")]
    items: list[RubricItem] = []
    for comp in competencies:
        try:
            weight = float(comp.get("weight", 1.0))
        except (TypeError, ValueError):
            weight = 1.0
        items.append(
            RubricItem(
                criterion=str(comp.get("name")),
                weight=weight,
                description=str(comp.get("description") or "Org custom question"),
            )
        )
    return items


def _custom_to_planned(
    custom: dict[str, Any], index: int, rubric: dict[str, Any] | None
) -> PlannedQuestion:
    raw_section = str(custom.get("category") or custom.get("section") or "technical")
    section = raw_section if raw_section in _VALID_SECTIONS else "technical"
    try:
        difficulty = int(custom.get("difficulty", 3))
    except (TypeError, ValueError):
        difficulty = 3
    difficulty = max(1, min(5, difficulty))
    followups = custom.get("follow_ups", custom.get("followups", []))
    if isinstance(followups, str):
        followups = [followups]
    followups = [str(f) for f in (followups or [])] or ["Tell me more."]
    competencies = (
        rubric.get("competencies")
        if isinstance(rubric, dict) and isinstance(rubric.get("competencies"), list)
        else []
    )
    first_comp = (
        competencies[0].get("name")
        if competencies and isinstance(competencies[0], dict)
        else None
    )
    target = str(custom.get("target_competency") or first_comp or section)
    return PlannedQuestion(
        id=str(custom.get("id") or f"custom-{index}"),
        section=section,  # type: ignore[arg-type]
        text=_custom_text_to_localized(custom.get("text", "")),
        difficulty=difficulty,
        rubric=_rubric_items_for_custom(rubric, target),
        followups=followups,
        target_competency=target,
    )


def merge_question_plans(
    plan: QuestionPlan,
    *,
    custom_questions: list[dict[str, Any]] | None = None,
    rubric: dict[str, Any] | None = None,
    difficulty_ramp: list[int] | None = None,
) -> QuestionPlan:
    """Merge AI-generated questions with an org's custom question bank.

    Existing logic is preserved: AI questions are kept as-is. Custom questions
    are converted to :class:`PlannedQuestion` (org rubric weights applied) and
    merged in, then the combined list is sorted by difficulty so the interview
    respects a rising ``difficulty_ramp`` when provided, else rising difficulty.
    """
    customs = [_custom_to_planned(q, i, rubric) for i, q in enumerate(custom_questions or [])]
    merged = [*plan.questions, *customs]
    if difficulty_ramp:
        order = {level: pos for pos, level in enumerate(difficulty_ramp)}
        merged.sort(key=lambda q: (order.get(q.difficulty, 999), q.difficulty))
    else:
        merged.sort(key=lambda q: q.difficulty)
    sections_order = list(plan.sections_order)
    for q in merged:
        if q.section not in sections_order:
            sections_order.append(q.section)
    return plan.model_copy(update={"questions": merged, "sections_order": sections_order})


def _format_org_bank_for_prompt(question_bank: list[dict[str, Any]]) -> str:
    lines = []
    for q in question_bank:
        text = q.get("text", "")
        if isinstance(text, dict):
            text = text.get("en") or next(iter(text.values()), "")
        lines.append(
            f"- [{q.get('category') or q.get('section') or 'technical'}, "
            f"difficulty {q.get('difficulty', 3)}] {text}"
        )
    return "\n".join(lines)


@traced("prep.question_planner")
async def question_planner(state: PrepState, deps: Deps) -> PrepState:
    """Keystone: synthesize the full ``QuestionPlan`` from all upstream state."""
    req = state["req"]
    system, user = question_planner_prompts(
        candidate=state["candidate"],
        job=state["job"],
        company=state["company"],
        gap=state["gap"],
        language_mode=req.language_mode,
    )
    # HireAI: surface the org's custom questions + rubric so the LLM tailors
    # around them instead of duplicating them.
    question_bank = list(state.get("question_bank") or [])
    rubric_cfg = state.get("rubric") or {}
    if question_bank:
        user = f"{user}\n\nORG CUSTOM QUESTIONS (must be included verbatim):\n{_format_org_bank_for_prompt(question_bank)}"
    if rubric_cfg:
        user = f"{user}\n\nORG RUBRIC:\n{rubric_cfg}"
    # WP-10: inject any matching distilled playbook as extra planner context.
    hint = _skill_library_hint(
        company=state["company"].name,
        role=state["job"].title,
        level=state["job"].seniority,
    )
    if hint:
        user = (
            f"{user}\n\n"
            "PLAYBOOK REFERENCE (from the interview skill library — adapt to THIS "
            "candidate and JD; prefer reusing its strongest questions over "
            "inventing near-duplicates, and never copy questions that don't fit "
            "the gap analysis):\n"
            f"{hint}"
        )
    try:
        plan = await deps.llm.complete_json(
            system=system, user=user, schema=QuestionPlan
        )
    except Exception as exc:  # noqa: BLE001 - keystone must still emit a valid plan
        log.warning("question_planner failed, using minimal generic plan (%s)", exc)
        plan = build_mock(QuestionPlan)
        await _warn(
            state, deps, ["Could not tailor the question plan; used a generic one."]
        )
    # Pin the language mode to the request so the live loop routes voice correctly,
    # regardless of what the model echoed back.
    plan = plan.model_copy(update={"language_mode": req.language_mode})
    # HireAI: merge org custom questions, respecting the org difficulty ramp.
    ramp = None
    if isinstance(rubric_cfg, dict):
        raw_ramp = rubric_cfg.get("difficulty_ramp")
        if isinstance(raw_ramp, list) and all(isinstance(v, int) for v in raw_ramp):
            ramp = raw_ramp
    state_ramp = state.get("difficulty_ramp")  # type: ignore[typeddict-item]
    if ramp is None and isinstance(state_ramp, list):
        ramp = state_ramp
    if question_bank:
        plan = merge_question_plans(
            plan, custom_questions=question_bank, rubric=rubric_cfg, difficulty_ramp=ramp
        )
    await _mark(state, deps, "question_planner")
    return {"plan": plan}
