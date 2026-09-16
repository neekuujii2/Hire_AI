"""Redis-backed TTS audio cache for common interview phrases.

Caches synthesized audio bytes to avoid redundant TTS calls for
repeated phrases (intro, transitions, follow-ups, goodbye).  Target:
~30% TTS cost reduction (08_Best_Practices.md §9).

Usage::

    cache = TTSCache(redis_url="redis://localhost:6379")
    audio = await cache.get_or_synthesize(text, voice_id, synthesizer)

Design:
  - Key: ``tts_cache:{sha256(text)}:{voice_id}``
  - TTL: 24 hours (phrases don't change; cache is warm-hitting)
  - Format: raw audio bytes (PCM/WAV/MP3 depending on provider)
  - Lazy init: Redis connection is opened on first use, not at import.
"""

from __future__ import annotations

import hashlib
from collections.abc import Awaitable, Callable
from typing import Any

from ..core.logging import get_logger

log = get_logger(__name__)

CACHE_TTL_SEC = 86400  # 24 hours
CACHE_PREFIX = "tts_cache"

# Phrases worth pre-warming (08_Best_Practices.md §9).
WARM_PHRASES: dict[str, dict[str, str]] = {
    "en": {
        "intro": "Thank you for joining today. Let's get started with your interview.",
        "transition": "That's interesting. Let's move on to the next question.",
        "followup": "Can you tell me more about that?",
        "goodbye": "Thank you for your time today. The team will be in touch.",
        "clarify": "Could you rephrase that? I want to make sure I understand.",
    },
    "vi": {
        "intro": "Cảm ơn bạn đã tham gia hôm nay. Chúng ta bắt đầu phỏng vấn nhé.",
        "transition": "Điều đó thú vị. Chúng ta sang câu hỏi tiếp theo nhé.",
        "followup": "Bạn có thể kể thêm về điều đó không?",
        "goodbye": "Cảm ơn bạn đã dành thời gian hôm nay. Đội ngũ sẽ liên hệ bạn sớm.",
        "clarify": "Bạn có thể nói lại được không? Tôi muốn chắc chắn mình hiểu đúng.",
    },
}


class TTSCache:
    """Redis-backed TTS audio cache.

    Args:
        redis_url: Redis connection string (default: ``redis://localhost:6379``).
    """

    def __init__(self, redis_url: str = "redis://localhost:6379") -> None:
        self._redis_url = redis_url
        self._redis: Any = None  # lazily imported aioredis

    async def _get_redis(self) -> Any:
        """Lazy-init the Redis connection (avoids import at module load)."""
        if self._redis is not None:
            return self._redis

        try:
            import redis.asyncio as aioredis  # noqa: WPS433 — lazy import

            self._redis = aioredis.from_url(
                self._redis_url,
                decode_responses=False,  # We store raw bytes
                max_connections=10,
            )
            log.info("tts-cache: connected to %s", self._redis_url)
            return self._redis
        except Exception:
            log.warning(
                "tts-cache: Redis unavailable at %s; caching disabled",
                self._redis_url,
            )
            return None

    @staticmethod
    def _cache_key(text: str, voice_id: str) -> str:
        """Derive the Redis key from text + voice_id."""
        text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        return f"{CACHE_PREFIX}:{text_hash}:{voice_id}"

    async def get(self, text: str, voice_id: str) -> bytes | None:
        """Lookup cached audio. Returns ``None`` on miss or Redis failure."""
        redis = await self._get_redis()
        if redis is None:
            return None

        try:
            data = await redis.get(self._cache_key(text, voice_id))
            if data:
                log.debug("tts-cache: HIT (%d bytes)", len(data))
                return data
            log.debug("tts-cache: MISS")
            return None
        except Exception:
            log.debug("tts-cache: GET failed (non-fatal)")
            return None

    async def set(self, text: str, voice_id: str, audio: bytes) -> None:
        """Store audio bytes in cache with TTL."""
        redis = await self._get_redis()
        if redis is None:
            return

        try:
            await redis.setex(
                self._cache_key(text, voice_id),
                CACHE_TTL_SEC,
                audio,
            )
            log.debug("tts-cache: SET (%d bytes)", len(audio))
        except Exception:
            log.debug("tts-cache: SET failed (non-fatal)")

    async def get_or_synthesize(
        self,
        text: str,
        voice_id: str,
        synthesizer: Callable[[str], Awaitable[bytes]],
    ) -> bytes:
        """Cache-through: return cached audio or synthesize + cache.

        Args:
            text: The text to synthesize.
            voice_id: The TTS voice identifier.
            synthesizer: Async callable that produces audio bytes from text.

        Returns:
            Audio bytes (from cache or fresh synthesis).
        """
        cached = await self.get(text, voice_id)
        if cached is not None:
            return cached

        audio = await synthesizer(text)
        await self.set(text, voice_id, audio)
        return audio

    async def warm_cache(
        self,
        language: str,
        voice_id: str,
        synthesizer: Callable[[str], Awaitable[bytes]],
    ) -> int:
        """Pre-warm cache with common interview phrases for a language.

        Returns the number of phrases successfully cached.
        """
        phrases = WARM_PHRASES.get(language, WARM_PHRASES.get("en", {}))
        cached_count = 0

        for key, text in phrases.items():
            existing = await self.get(text, voice_id)
            if existing is not None:
                continue

            try:
                audio = await synthesizer(text)
                await self.set(text, voice_id, audio)
                cached_count += 1
                log.info("tts-cache: warmed [%s] %s (%d bytes)", language, key, len(audio))
            except Exception:
                log.warning("tts-cache: failed to warm [%s] %s", language, key)

        log.info("tts-cache: warmed %d/%d phrases for %s", cached_count, len(phrases), language)
        return cached_count

    async def close(self) -> None:
        """Close the Redis connection."""
        if self._redis is not None:
            await self._redis.close()
            self._redis = None
