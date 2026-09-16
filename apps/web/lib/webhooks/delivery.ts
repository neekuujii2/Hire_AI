"""Webhook delivery service for HireAI ATS integration.

Delivers webhooks with exponential backoff retry (3 attempts).
Events: candidate.shortlisted, candidate.rejected, interview.completed.

Design:
  - BullMQ-based for reliability and retry management.
  - HMAC-SHA256 signing with configurable webhook secret.
  - All deliveries logged to audit trail.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..core.logging import get_logger

log = get_logger(__name__)

MAX_RETRIES = 3
RETRY_DELAYS = [1000, 5000, 15000]  # ms, exponential backoff


@dataclass
class WebhookConfig:
    """Webhook endpoint configuration."""

    url: str
    secret: str = ""
    events: list[str] = field(default_factory=lambda: ["candidate.shortlisted", "candidate.rejected"])
    active: bool = True


@dataclass
class WebhookPayload:
    """Standard webhook payload."""

    event: str
    timestamp: str
    data: dict[str, Any]


def sign_payload(payload_bytes: bytes, secret: str) -> str:
    """Sign payload with HMAC-SHA256."""
    if not secret:
        return ""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


async def deliver_webhook(
    config: WebhookConfig,
    event: str,
    data: dict[str, Any],
) -> bool:
    """Deliver a webhook with retry logic.

    Returns True if delivered successfully, False after all retries exhausted.
    """
    if not config.active:
        return False

    if event not in config.events:
        return False

    payload = WebhookPayload(
        event=event,
        timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        data=data,
    )

    payload_bytes = json.dumps(
        {"event": payload.event, "timestamp": payload.timestamp, "data": payload.data},
        default=str,
    ).encode("utf-8")

    signature = sign_payload(payload_bytes, config.secret)

    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "User-Agent": "HireAI-Webhook/1.0",
    }
    if signature:
        headers["X-HireAI-Signature"] = f"sha256={signature}"

    for attempt in range(MAX_RETRIES):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(config.url, content=payload_bytes, headers=headers)

                if 200 <= response.status_code < 300:
                    log.info(
                        "webhook: delivered %s to %s (attempt %d, status %d)",
                        event,
                        config.url,
                        attempt + 1,
                        response.status_code,
                    )
                    return True

                log.warning(
                    "webhook: delivery failed %s to %s (attempt %d, status %d)",
                    event,
                    config.url,
                    attempt + 1,
                    response.status_code,
                )
        except Exception:
            log.warning(
                "webhook: delivery error %s to %s (attempt %d)",
                event,
                config.url,
                attempt + 1,
            )

        # Wait before retry (exponential backoff).
        if attempt < MAX_RETRIES - 1:
            import asyncio
            delay = RETRY_DELAYS[attempt] / 1000
            await asyncio.sleep(delay)

    log.error("webhook: all %d attempts failed for %s to %s", MAX_RETRIES, event, config.url)
    return False


async def notify_candidate_shortlisted(
    webhook_configs: list[WebhookConfig],
    candidate: dict[str, Any],
    job: dict[str, Any],
    scorecard: dict[str, Any],
    report_url: str,
) -> int:
    """Send candidate.shortlisted webhook to all configured endpoints.

    Returns the number of successful deliveries.
    """
    event = "candidate.shortlisted"
    data = {
        "candidate": {
            "id": candidate.get("id"),
            "name": candidate.get("name"),
            "email": candidate.get("email"),
        },
        "job": {
            "id": job.get("id"),
            "title": job.get("title"),
        },
        "score": {
            "overall": scorecard.get("overall_score"),
            "recommendation": scorecard.get("recommendation"),
        },
        "report_url": report_url,
    }

    success_count = 0
    for config in webhook_configs:
        if await deliver_webhook(config, event, data):
            success_count += 1

    return success_count


async def notify_candidate_rejected(
    webhook_configs: list[WebhookConfig],
    candidate: dict[str, Any],
    job: dict[str, Any],
) -> int:
    """Send candidate.rejected webhook."""
    event = "candidate.rejected"
    data = {
        "candidate": {
            "id": candidate.get("id"),
            "name": candidate.get("name"),
            "email": candidate.get("email"),
        },
        "job": {
            "id": job.get("id"),
            "title": job.get("title"),
        },
    }

    success_count = 0
    for config in webhook_configs:
        if await deliver_webhook(config, event, data):
            success_count += 1

    return success_count
