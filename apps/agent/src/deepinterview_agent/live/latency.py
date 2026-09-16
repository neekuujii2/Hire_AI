"""Per-turn latency measurement for the live interview pipeline.

Logs and emits metrics for each stage of the voice pipeline:
  - ``stt_ms``: speech-to-text transcription time
  - ``llm_first_token_ms``: time to first LLM token
  - ``tts_start_ms``: time until TTS starts speaking
  - ``total_ms``: end-to-end turn latency

Design:
  - Lightweight dataclass; no locks, no threads — just timestamps.
  - Attached to the ``InterviewUserdata`` and logged per turn.
  - Emits to Datadog (or any StatsD-compatible backend) when configured.
  - Alert threshold: P95 > 2000ms (08_Best_Practices.md §1).

Usage::

    meter = LatencyMeter()
    meter.mark_stt_start()
    # ... STT runs ...
    meter.mark_stt_end()
    # ... LLM runs ...
    meter.mark_llm_first_token()
    # ... TTS starts ...
    meter.mark_tts_start()
    stats = meter.finish()
    log.info("turn latency", **stats.to_dict())
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

from ..core.logging import get_logger

log = get_logger(__name__)

# Datadog statsd client (lazy init).
_statsd: Any = None


def _get_statsd() -> Any:
    """Lazy-init the Datadog StatsD client."""
    global _statsd  # noqa: WPS420
    if _statsd is not None:
        return _statsd

    try:
        from ddtrace import tracer  # noqa: WPS433 — optional dependency

        _statsd = tracer.statsd
        return _statsd
    except Exception:
        return None


@dataclass
class TurnLatencyStats:
    """Immutable snapshot of one turn's latency breakdown."""

    stt_ms: float = 0.0
    llm_first_token_ms: float = 0.0
    tts_start_ms: float = 0.0
    total_ms: float = 0.0
    stt_chars: int = 0
    llm_tokens: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "stt_ms": round(self.stt_ms, 1),
            "llm_first_token_ms": round(self.llm_first_token_ms, 1),
            "tts_start_ms": round(self.tts_start_ms, 1),
            "total_ms": round(self.total_ms, 1),
            "stt_chars": self.stt_chars,
            "llm_tokens": self.llm_tokens,
        }


class LatencyMeter:
    """Mutable per-turn latency tracker.

    Call the ``mark_*`` methods in pipeline order; ``finish()`` returns
    an immutable snapshot and emits metrics.
    """

    def __init__(self) -> None:
        self._turn_start = time.monotonic()
        self._stt_start: float | None = None
        self._stt_end: float | None = None
        self._llm_first_token: float | None = None
        self._tts_start: float | None = None

    def mark_stt_start(self) -> None:
        """Called when the STT stage begins processing audio."""
        self._stt_start = time.monotonic()

    def mark_stt_end(self) -> None:
        """Called when STT produces a transcript."""
        self._stt_end = time.monotonic()

    def mark_llm_first_token(self) -> None:
        """Called on the first streamed token from the LLM."""
        self._llm_first_token = time.monotonic()

    def mark_tts_start(self) -> None:
        """Called when TTS begins speaking (first audio chunk emitted)."""
        self._tts_start = time.monotonic()

    def finish(
        self,
        stt_chars: int = 0,
        llm_tokens: int = 0,
    ) -> TurnLatencyStats:
        """Finalize the turn and return stats.

        Call once at the end of each turn to compute durations and emit metrics.
        """
        now = time.monotonic()
        start = self._turn_start

        def _delta(end: float | None) -> float:
            if end is None:
                return 0.0
            return (end - start) * 1000  # ms

        stats = TurnLatencyStats(
            stt_ms=_delta(self._stt_end) - _delta(self._stt_start),
            llm_first_token_ms=_delta(self._llm_first_token),
            tts_start_ms=_delta(self._tts_start),
            total_ms=(now - start) * 1000,
            stt_chars=stt_chars,
            llm_tokens=llm_tokens,
        )

        # Log structured turn latency.
        log.info("turn-latency", **stats.to_dict())

        # Emit to Datadog (fire-and-forget).
        self._emit_metrics(stats)

        return stats

    def _emit_metrics(self, stats: TurnLatencyStats) -> None:
        """Push latency metrics to StatsD (no-op when DD is unavailable)."""
        sd = _get_statsd()
        if sd is None:
            return

        try:
            sd.histogram("interview.turn.stt_ms", stats.stt_ms)
            sd.histogram("interview.turn.llm_first_token_ms", stats.llm_first_token_ms)
            sd.histogram("interview.turn.tts_start_ms", stats.tts_start_ms)
            sd.histogram("interview.turn.total_ms", stats.total_ms)
            sd.increment("interview.turn.count")
        except Exception:
            pass  # Metric emission is best-effort.
