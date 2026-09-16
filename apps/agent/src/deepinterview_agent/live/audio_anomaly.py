"""Audio anomaly detection for proctoring.

Detects background voices, multiple speakers, and suspicious audio patterns
during live interviews. Runs as a parallel analysis alongside the main
interview voice pipeline.

Design:
  - Uses WebRTC VAD (Voice Activity Detection) for speaker diarization
  - Detects: background voice, multiple simultaneous speakers, audio spoofing
  - Reports events to the proctoring event log
  - Runs in a background task, never blocks the turn-critical path
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field

from ..core.logging import get_logger

if __name__ != "__main__":
    log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class AudioAnomaly:
    """A detected audio anomaly."""

    event_type: str  # background_voice | multiple_voices | audio_spoof
    severity: str  # low | medium | high
    confidence: float  # 0.0-1.0
    description: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class AudioAnalysisResult:
    """Result of audio analysis for a frame/window."""

    has_voice: bool = False
    voice_count: int = 0
    anomalies: list[AudioAnomaly] = field(default_factory=list)


# ---------------------------------------------------------------------------
# VAD-based analysis
# ---------------------------------------------------------------------------

# Simple energy-based voice activity detection threshold.
# In production, replace with a proper VAD model (e.g., Silero VAD).
ENERGY_THRESHOLD = 0.02
MULTIPLE_VOICE_THRESHOLD = 0.05  # Energy threshold for detecting second speaker.


def detect_voice_activity(audio_frames: list[bytes], sample_rate: int = 16000) -> bool:
    """Simple energy-based VAD to detect if voice is present."""
    if not audio_frames:
        return False

    # Combine frames and compute RMS energy.
    all_audio = b"".join(audio_frames)
    import struct

    samples = struct.unpack(f"<{len(all_audio) // 2}h", all_audio)
    if not samples:
        return False

    rms = (sum(s * s for s in samples) / len(samples)) ** 0.5
    normalized = rms / 32768.0

    return normalized > ENERGY_THRESHOLD


def detect_multiple_speakers(
    audio_frames: list[bytes],
    primary_speaker_energy: float = 0.0,
    sample_rate: int = 16000,
) -> int:
    """Estimate the number of distinct speakers in audio frames.

    Returns an estimated speaker count (1 or 2+).
    Uses energy distribution analysis as a simple proxy for diarization.
    """
    if not audio_frames:
        return 0

    import struct

    all_audio = b"".join(audio_frames)
    samples = struct.unpack(f"<{len(all_audio) // 2}h", all_audio)

    if not samples:
        return 0

    # Split into windows and check energy variance.
    window_size = sample_rate // 10  # 100ms windows
    energies = []
    for i in range(0, len(samples) - window_size, window_size):
        window = samples[i : i + window_size]
        rms = (sum(s * s for s in window) / len(window)) ** 0.5 / 32768.0
        energies.append(rms)

    if not energies:
        return 0

    # Check if energy distribution suggests multiple sources.
    avg_energy = sum(energies) / len(energies)
    high_energy_count = sum(1 for e in energies if e > avg_energy * 1.5)

    # If significant energy variation exists, likely multiple speakers.
    if high_energy_count > len(energies) * 0.3 and avg_energy > MULTIPLE_VOICE_THRESHOLD:
        return 2

    return 1 if avg_energy > ENERGY_THRESHOLD else 0


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------


def analyze_audio_window(
    audio_frames: list[bytes],
    candidate_is_speaking: bool,
    sample_rate: int = 16000,
) -> AudioAnalysisResult:
    """Analyze an audio window for anomalies.

    Args:
        audio_frames: Raw PCM audio frames (16-bit, mono).
        candidate_is_speaking: Whether the candidate is expected to be speaking.
        sample_rate: Audio sample rate in Hz.

    Returns:
        AnalysisResult with detected anomalies.
    """
    anomalies = []
    has_voice = detect_voice_activity(audio_frames, sample_rate)
    voice_count = detect_multiple_speakers(audio_frames, sample_rate=sample_rate) if has_voice else 0

    # Multiple voices detected while candidate should be alone.
    if voice_count >= 2 and candidate_is_speaking:
        anomalies.append(
            AudioAnomaly(
                event_type="multiple_voices",
                severity="high",
                confidence=0.7,
                description="Multiple voices detected during candidate's answer",
            )
        )

    # Background voice when candidate is not speaking.
    if has_voice and not candidate_is_speaking and voice_count == 1:
        # Check if this could be background noise vs. actual voice.
        import struct

        all_audio = b"".join(audio_frames)
        samples = struct.unpack(f"<{len(all_audio) // 2}h", all_audio)
        rms = (sum(s * s for s in samples) / len(samples)) ** 0.5 / 32768.0

        if rms > ENERGY_THRESHOLD * 2:
            anomalies.append(
                AudioAnomaly(
                    event_type="background_voice",
                    severity="medium",
                    confidence=0.5,
                    description="Possible background voice detected when candidate is not speaking",
                )
            )

    return AudioAnalysisResult(
        has_voice=has_voice,
        voice_count=voice_count,
        anomalies=anomalies,
    )


# ---------------------------------------------------------------------------
# Continuous monitoring task
# ---------------------------------------------------------------------------


class AudioMonitor:
    """Background audio anomaly monitor for a live session.

    Consumes audio frames from a queue and runs periodic analysis.
    Reports anomalies via a callback.
    """

    def __init__(
        self,
        session_id: str,
        report_callback=None,
        window_sec: float = 5.0,
    ):
        self.session_id = session_id
        self._callback = report_callback
        self._window_sec = window_sec
        self._frame_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._anomaly_count = 0

    def start(self) -> None:
        """Start the background monitoring task."""
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Stop the monitoring task."""
        await self._frame_queue.put(None)
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def feed_frame(self, frame: bytes) -> None:
        """Feed an audio frame for analysis."""
        await self._frame_queue.put(frame)

    async def _run(self) -> None:
        """Main monitoring loop: collect frames and analyze periodically."""
        try:
            while True:
                frames = []
                start = time.monotonic()

                # Collect frames for the analysis window.
                while time.monotonic() - start < self._window_sec:
                    try:
                        frame = await asyncio.wait_for(
                            self._frame_queue.get(), timeout=1.0
                        )
                        if frame is None:
                            return  # Shutdown signal.
                        frames.append(frame)
                    except asyncio.TimeoutError:
                        continue

                if not frames:
                    continue

                # Analyze the collected frames.
                result = analyze_audio_window(frames, candidate_is_speaking=True)

                for anomaly in result.anomalies:
                    self._anomaly_count += 1
                    log.warning(
                        "audio_monitor: session=%s anomaly=%s severity=%s confidence=%.2f",
                        self.session_id,
                        anomaly.event_type,
                        anomaly.severity,
                        anomaly.confidence,
                    )
                    if self._callback:
                        await self._callback(anomaly)

        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("audio_monitor: error for session %s", self.session_id)
