"""Parallel follow-up question generator for the live interview loop.

Pre-generates likely follow-up questions while the candidate is speaking
(STT phase), so the LLM has a head start when the turn ends.

Design:
  - Runs on GPT-4o-mini (80% cheaper, fast enough — 08_Best_Practices.md §9).
  - Generates 2-3 candidate follow-ups per current question.
  - Uses the ``InterviewContext`` blackboard (no extra DB calls).
  - Fire-and-forget: if it fails, the interviewer falls back to the normal
    single-shot LLM call (no latency regression).

Usage::

    gen = FollowUpGenerator(llm_factory, userdata)
    gen.start()  # attaches to transcript events
    # ... later ...
    followups = await gen.get_followups()
    if followups:
        # Use pre-generated follow-up instead of normal LLM call
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any, Protocol

from ..core.logging import get_logger

if TYPE_CHECKING:
    from .state import InterviewUserdata

log = get_logger(__name__)


class LLMFactory(Protocol):
    """Callable that returns a configured LLM instance."""

    def __call__(self, model: str | None = None) -> Any: ...


class FollowUpGenerator:
    """Background pre-generation of follow-up questions.

    Args:
        llm_factory: Factory that returns an LLM (model-agnostic).
        userdata: The shared interview state (read-only access to context).
        max_followups: Maximum follow-ups to generate per question.
    """

    def __init__(
        self,
        llm_factory: LLMFactory,
        userdata: InterviewUserdata,
        *,
        max_followups: int = 3,
    ) -> None:
        self._llm_factory = llm_factory
        self._userdata = userdata
        self._max_followups = max_followups
        self._pending: asyncio.Task[list[str]] | None = None
        self._cache: list[str] = []
        self._started = False

    def start(self) -> None:
        """Start pre-generating follow-ups in the background."""
        if self._started:
            return
        self._started = True
        # Kick off initial generation for the first question.
        self._trigger_generation()

    def stop(self) -> None:
        """Cancel any in-flight generation."""
        if self._pending and not self._pending.done():
            self._pending.cancel()
        self._started = False

    def on_new_question(self) -> None:
        """Called when the interviewer advances to a new question.

        Triggers background generation of follow-ups for the new question.
        """
        if not self._started:
            return
        # Cancel any pending generation from the previous question.
        if self._pending and not self._pending.done():
            self._pending.cancel()
        self._cache = []
        self._trigger_generation()

    async def get_followups(self) -> list[str]:
        """Return pre-generated follow-ups, or empty list if not ready.

        Non-blocking: returns immediately with whatever is cached.
        """
        if self._pending and not self._pending.done():
            try:
                self._cache = await asyncio.wait_for(self._pending, timeout=0.1)
            except (TimeoutError, asyncio.CancelledError):
                pass
        return list(self._cache)

    def _trigger_generation(self) -> None:
        """Launch background generation (fire-and-forget)."""
        try:
            loop = asyncio.get_running_loop()
            self._pending = loop.create_task(self._generate())
        except RuntimeError:
            pass  # No event loop running; skip.

    async def _generate(self) -> list[str]:
        """Generate follow-up questions for the current question."""
        ctx = self._userdata.ctx
        cursor = ctx.plan.cursor

        if not ctx.plan.questions or cursor >= len(ctx.plan.questions):
            return []

        current_q = ctx.plan.questions[cursor]
        question_text = current_q.text.get("en", "")

        if not question_text:
            return []

        # Build the prompt for follow-up generation.
        prompt = (
            f"You are an expert interview coach. Given this interview question:\n\n"
            f'"{question_text}"\n\n'
            f"Generate {self._max_followups} concise follow-up probes that a "
            f"hiring manager might ask to dig deeper. Each should be one sentence. "
            f"Return ONLY a JSON array of strings, no explanation."
        )

        try:
            # Use GPT-4o-mini for speed + cost (08_Best_Practices.md §9).
            llm = self._llm_factory(model="gpt-4o-mini")
            response = await asyncio.wait_for(
                self._call_llm(llm, prompt),
                timeout=5.0,  # Hard cap: don't slow down the interview
            )
            followups = self._parse_response(response)
            self._cache = followups
            log.debug(
                "followup-gen: pre-generated %d follow-ups for cursor %d",
                len(followups),
                cursor,
            )
            return followups
        except TimeoutError:
            log.debug("followup-gen: timeout for cursor %d", cursor)
            return []
        except Exception:
            log.debug("followup-gen: generation failed (non-fatal)")
            return []

    async def _call_llm(self, llm: Any, prompt: str) -> str:
        """Call the LLM with a simple prompt (non-streaming)."""
        # Support both LangChain-style and raw OpenAI-style LLMs.
        if hasattr(llm, "ainvoke"):
            result = await llm.ainvoke(prompt)
            return getattr(result, "content", str(result))
        if hasattr(llm, "chat") and hasattr(llm.chat, "completions"):
            resp = await llm.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.7,
            )
            return resp.choices[0].message.content or ""
        return ""

    def _parse_response(self, response: str) -> list[str]:
        """Parse the LLM response into a list of follow-up strings."""
        import json  # noqa: WPS433 — lazy import

        # Strip markdown code fences if present.
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
        text = text.strip()

        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(item) for item in parsed[: self._max_followups]]
        except (json.JSONDecodeError, TypeError):
            pass

        # Fallback: split by newlines.
        lines = [line.strip().lstrip("0123456789.-) ") for line in text.split("\n")]
        return [line for line in lines if line and len(line) > 10][: self._max_followups]
