"""Server-side proctoring agent for HireAI live interviews.

Runs as a lightweight background task alongside the interview agent,
subscribing to the candidate's video track and sampling frames every
``FACE_CHECK_INTERVAL_SEC`` seconds via MediaPipe FaceDetection. When
violations are detected (no face, multiple faces), the agent:

  1. Sends a warning packet to the candidate via LiveKit DataChannel.
  2. Increments ``warning_count`` in the ``sessions`` table.
  3. Logs the event to ``proctoring_events``.
  4. If ``warning_count >= max_warning_limit``, terminates the session.

Design constraints (``08_Best_Practices.md``):
  - Face detection confidence threshold: 0.72 (empirically validated).
  - Check interval: 5 s (not every frame — 30 fps × 500 rooms = 15k ops/s
    is untenable; 5 s × 500 = 100 ops/s is manageable).
  - Default ``max_warning_limit = 3`` — candidates get benefit of doubt
    (internet drops, lighting changes, pets walking by).
  - Always log with evidence (screenshot URL when available).

Dependencies: ``mediapipe``, ``numpy``, ``livekit-agents``, ``asyncio``, ``httpx``.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx
import numpy as np

from ..core.config import get_settings
from ..core.logging import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Tuning constants (``08_Best_Practices.md`` §3)
# ---------------------------------------------------------------------------

FACE_CHECK_INTERVAL_SEC: float = 5.0
"""How often to sample a video frame for face detection.  Every frame is
too expensive (30 fps × 500 rooms = 15k ops/s); 5 s per room gives
100 ops/s — manageable."""

FACE_CONFIDENCE_THRESHOLD: float = 0.72
"""Empirically validated.  Too low (0.5) → many false positives;
too high (0.95) → misses real violations."""

DEFAULT_MAX_WARNINGS: int = 3
"""Default termination threshold.  Candidates get benefit of doubt:
internet drops, lighting changes, pets.  Warning 1 = gentle,
2 = stern, 3 = terminate."""

# Warning reasons accepted by the web API (matches
# ``apps/web/app/api/sessions/[id]/warning/route.ts``).
_VALID_REASONS = frozenset({
    "no_face_visible",
    "multiple_faces",
})


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class ProctorEvent:
    """Single proctoring event logged to the ``proctoring_events`` table."""

    session_id: str
    event_type: str
    warning_number: int
    severity: str  # "low" | "medium" | "high" | "critical"
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class WarningPacket:
    """Payload sent to the candidate via LiveKit DataChannel."""

    type: str = "proctor_warning"
    reason: str = ""
    count: int = 0
    max: int = DEFAULT_MAX_WARNINGS
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


@dataclass
class TerminationPacket:
    """Payload broadcast when the interview is terminated by proctoring."""

    type: str = "interview_terminated"
    reason: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


# ---------------------------------------------------------------------------
# ProctorAgent
# ---------------------------------------------------------------------------

class ProctorAgent:
    """Background proctoring task that monitors a candidate's video feed.

    Usage::

        agent = ProctorAgent(session_id="abc", room=room, participant=participant)
        await agent.start()
        # … later …
        await agent.stop()

    The agent runs as an ``asyncio.Task`` that:
      1. Subscribes to the candidate's video track via LiveKit ``rtc.Room``.
      2. Every ``FACE_CHECK_INTERVAL_SEC`` seconds, grabs one frame and runs
         MediaPipe FaceDetection.
      3. On violation, sends a warning via DataChannel and persists to DB.
      4. On ``warning_count >= max_warning_limit``, terminates the session.

    The agent is intentionally lightweight — no LLM calls, no heavy ML — so
    500 concurrent instances can run on a modest cluster.
    """

    def __init__(
        self,
        session_id: str,
        room: Any,  # livekit.rtc.Room
        participant: Any,  # livekit.rtc.RemoteParticipant
        *,
        max_warnings: int = DEFAULT_MAX_WARNINGS,
        api_base: str | None = None,
    ) -> None:
        self._session_id = session_id
        self._room = room
        self._participant = participant
        self._max_warnings = max_warnings
        self._api_base = (api_base or "").rstrip("/")
        self._warning_count = 0
        self._task: asyncio.Task[None] | None = None
        self._face_detection: Any = None  # lazily initialised
        self._stop_event = asyncio.Event()

    # -- public API ---------------------------------------------------------

    async def start(self) -> None:
        """Launch the background monitoring loop."""
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name=f"proctor-{self._session_id}")
        log.info(
            "proctor: started session=%s max_warnings=%d",
            self._session_id,
            self._max_warnings,
        )

    async def stop(self) -> None:
        """Gracefully stop the monitoring loop."""
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        log.info("proctor: stopped session=%s", self._session_id)

    @property
    def warning_count(self) -> int:
        return self._warning_count

    # -- internals ----------------------------------------------------------

    def _init_face_detection(self) -> Any:
        """Lazy-init MediaPipe FaceDetection (heavy import)."""
        if self._face_detection is not None:
            return self._face_detection

        import mediapipe as mp  # noqa: WPS433 — lazy import by design

        mp_face = mp.solutions.face_detection
        self._face_detection = mp_face.FaceDetection(
            model_selection=1,  # 1 = full-range model (better accuracy)
            min_detection_confidence=FACE_CONFIDENCE_THRESHOLD,
        )
        log.info(
            "proctor: MediaPipe FaceDetection initialised (confidence=%.2f)",
            FACE_CONFIDENCE_THRESHOLD,
        )
        return self._face_detection

    async def _run(self) -> None:
        """Main monitoring loop — runs until stopped or session terminates."""
        settings = get_settings()
        # Use configured base or fall back to localhost.
        if not self._api_base:
            self._api_base = f"http://localhost:{settings.agent_api_port}"

        try:
            while not self._stop_event.is_set():
                await asyncio.sleep(FACE_CHECK_INTERVAL_SEC)
                if self._stop_event.is_set():
                    break

                frame = await self._grab_frame()
                if frame is None:
                    continue

                face_count = self._detect_faces(frame)
                await self._evaluate(face_count)
        except asyncio.CancelledError:
            return
        except Exception:
            log.exception("proctor: unexpected error in session %s", self._session_id)

    async def _grab_frame(self) -> np.ndarray | None:
        """Grab a single video frame from the candidate's track.

        Uses the LiveKit ``rtc.Room`` to locate the candidate's video track,
        then decodes one frame.  Returns ``None`` when no video track is
        available or the frame cannot be decoded (camera off, track muted).
        """
        try:
            for track in self._participant.track_publications.values():
                track_impl = track.track if hasattr(track, "track") else None
                if track_impl is None:
                    continue
                # Accept both VideoFrame and any wrapped variant.
                frame = getattr(track_impl, "read_frame", None)
                if frame is None:
                    continue
                # livekit-rtc VideoFrame → numpy via its buffer protocol.
                video_frame = frame()
                return self._video_frame_to_numpy(video_frame)
        except Exception:  # noqa: BLE001 — defensive: any frame grab failure is non-fatal
            log.debug("proctor: could not grab frame for session %s", self._session_id)
        return None

    @staticmethod
    def _video_frame_to_numpy(frame: Any) -> np.ndarray:
        """Convert a LiveKit ``VideoFrame`` to a numpy array (H, W, 3) RGB."""
        # livekit-rtc VideoFrame exposes .data (bytes), .width, .height,
        # .rotation.  Flatten to a uint8 buffer and reshape.
        data: bytes = bytes(frame.data)
        width: int = frame.width
        height: int = frame.height
        arr = np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3)
        return arr

    def _detect_faces(self, frame: np.ndarray) -> int:
        """Run MediaPipe FaceDetection and return the number of faces found."""
        fd = self._init_face_detection()
        # MediaPipe expects RGB uint8 (H, W, 3) — already in that format.
        results = fd.process(frame)
        if results.detections is None:
            return 0
        return len(results.detections)

    async def _evaluate(self, face_count: int) -> None:
        """Evaluate the face count and issue warnings / termination as needed."""
        if face_count == 0:
            await self._issue_warning("no_face_visible", face_count)
        elif face_count >= 2:
            await self._issue_warning("multiple_faces", face_count)

    async def _issue_warning(self, reason: str, face_count: int) -> None:
        """Issue a warning: persist to DB, send DataChannel packet, maybe terminate."""
        if reason not in _VALID_REASONS:
            return

        self._warning_count += 1
        should_terminate = self._warning_count >= self._max_warnings

        event = ProctorEvent(
            session_id=self._session_id,
            event_type=reason,
            warning_number=self._warning_count,
            severity="high" if should_terminate else "medium",
            metadata={"face_count": face_count},
        )

        # 1. Persist to DB.
        await self._persist_event(event)

        # 2. Send warning to candidate via DataChannel.
        packet = WarningPacket(
            reason=reason,
            count=self._warning_count,
            max=self._max_warnings,
        )
        await self._send_data_channel(packet)

        log.info(
            "proctor: warning session=%s reason=%s count=%d/%d terminate=%s",
            self._session_id,
            reason,
            self._warning_count,
            self._max_warnings,
            should_terminate,
        )

        # 3. Terminate if limit reached.
        if should_terminate:
            await self._terminate(reason)

    async def _persist_event(self, event: ProctorEvent) -> None:
        """POST the proctoring event to the web API for DB persistence."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{self._api_base}/api/sessions/{self._session_id}/warning",
                    json={"reason": event.event_type},
                )
        except Exception:
            log.exception(
                "proctor: failed to persist event for session %s", self._session_id
            )

    async def _send_data_channel(self, packet: WarningPacket | TerminationPacket) -> None:
        """Send a JSON packet to the candidate via LiveKit DataChannel."""
        try:
            payload = json.dumps(asdict(packet))
            # Publish on the default data topic so the frontend's
            # ``room.on("dataReceived")`` handler picks it up.
            await self._room.local_participant.publish_data(
                payload.encode("utf-8"),
                reliable=True,
            )
        except Exception:
            log.exception(
                "proctor: failed to send data packet for session %s",
                self._session_id,
            )

    async def _terminate(self, reason: str) -> None:
        """Terminate the interview: update DB status, broadcast, then stop."""
        # 1. Update session status via web API.
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # The web API's warning route already handles termination when
                # warning_count >= max_warning_limit, so this is a belt-and-
                # suspenders call.
                await client.post(
                    f"{self._api_base}/api/sessions/{self._session_id}/warning",
                    json={"reason": reason},
                )
        except Exception:
            log.exception(
                "proctor: failed to persist termination for session %s",
                self._session_id,
            )

        # 2. Broadcast termination to the candidate.
        term_packet = TerminationPacket(reason=reason)
        await self._send_data_channel(term_packet)

        # 3. Disconnect the candidate from the room.
        try:
            for participant in list(self._room.remote_participants.values()):
                if participant.identity == self._participant.identity:
                    await self._room.remove_participant(participant)
                    break
        except Exception:
            log.exception(
                "proctor: failed to disconnect participant for session %s",
                self._session_id,
            )

        log.warning(
            "proctor: TERMINATED session=%s reason=%s warnings=%d",
            self._session_id,
            reason,
            self._warning_count,
        )

        # 4. Stop monitoring.
        await self.stop()
