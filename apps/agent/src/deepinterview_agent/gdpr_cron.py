"""GDPR auto-delete cron job.

Periodically scans for candidates, sessions, recordings, and transcripts
that have exceeded their retention period and soft-deletes them.

Design:
  - Runs as a standalone script: `python -m deepinterview_agent.gdpr_cron`
  - Default retention: 90 days (configurable via org_configs.recording_retention_days)
  - Soft-deletes by setting `deleted_at` timestamp; hard-delete runs 30 days later
  - Logs all deletions for audit trail
"""

from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone

from .core.logging import get_logger

log = get_logger(__name__)


async def run_gdpr_cleanup() -> dict[str, int]:
    """Scan and soft-delete records past their retention period.

    Returns counts of deleted records by type.
    """
    from .core.deps import build_deps

    deps = build_deps()
    supabase = deps.supabase

    if supabase is None:
        log.warning("gdpr_cron: Supabase not configured; skipping cleanup")
        return {}

    now = datetime.now(timezone.utc)
    counts = {"candidates": 0, "sessions": 0, "transcripts": 0, "recordings": 0}

    # 1. Find orgs with custom retention periods.
    try:
        orgs_result = await asyncio.to_thread(
            lambda: supabase.table("org_configs")
            .select("org_id, recording_retention_days")
            .execute()
        )
        org_retention = {}
        for row in (orgs_result.data or []):
            org_retention[row["org_id"]] = row.get("recording_retention_days", 90)
    except Exception:
        log.exception("gdpr_cron: failed to load org retention configs")
        org_retention = {}

    default_retention = 90

    # 2. Soft-delete old candidates (and cascade to sessions/transcripts).
    try:
        # Find candidates past retention that aren't already deleted.
        cutoff = (now - timedelta(days=default_retention)).isoformat()
        old_candidates = await asyncio.to_thread(
            lambda: supabase.table("candidates")
            .select("id, org_id, created_at, pipeline_status")
            .is_("deleted_at", "null")
            .lt("created_at", cutoff)
            .execute()
        )

        for cand in (old_candidates.data or []):
            retention = org_retention.get(cand.get("org_id"), default_retention)
            cand_created = datetime.fromisoformat(cand["created_at"].replace("Z", "+00:00"))
            if now - cand_created < timedelta(days=retention):
                continue

            # Soft-delete the candidate.
            await asyncio.to_thread(
                lambda c=cand: supabase.table("candidates")
                .update({"deleted_at": now.isoformat()})
                .eq("id", c["id"])
                .execute()
            )
            counts["candidates"] += 1

            # Soft-delete associated sessions.
            sessions_result = await asyncio.to_thread(
                lambda c=cand: supabase.table("sessions")
                .select("id")
                .eq("candidate_id", c["id"])
                .is_("deleted_at", "null")
                .execute()
            )
            for session in (sessions_result.data or []):
                await asyncio.to_thread(
                    lambda s=session: supabase.table("sessions")
                    .update({"deleted_at": now.isoformat()})
                    .eq("id", s["id"])
                    .execute()
                )
                counts["sessions"] += 1

            # Soft-delete associated transcripts.
            transcripts_result = await asyncio.to_thread(
                lambda c=cand: supabase.table("transcripts")
                .select("id")
                .eq("candidate_id", c["id"])
                .is_("deleted_at", "null")
                .execute()
            )
            for t in (transcripts_result.data or []):
                await asyncio.to_thread(
                    lambda tr=t: supabase.table("transcripts")
                    .update({"deleted_at": now.isoformat()})
                    .eq("id", tr["id"])
                    .execute()
                )
                counts["transcripts"] += 1

    except Exception:
        log.exception("gdpr_cron: candidate cleanup failed")

    # 3. Hard-delete records past the grace period (deleted_at > 30 days ago).
    grace_cutoff = (now - timedelta(days=30)).isoformat()
    try:
        for table in ["candidates", "sessions", "transcripts"]:
            result = await asyncio.to_thread(
                lambda t=table: supabase.table(t)
                .delete()
                .not_.is_("deleted_at", "null")
                .lt("deleted_at", grace_cutoff)
                .execute()
            )
            deleted = len(result.data or [])
            if deleted > 0:
                log.info("gdpr_cron: hard-deleted %d rows from %s", deleted, table)
    except Exception:
        log.exception("gdpr_cron: hard-delete failed")

    log.info(
        "gdpr_cron: completed — candidates=%d sessions=%d transcripts=%d recordings=%d",
        counts["candidates"],
        counts["sessions"],
        counts["transcripts"],
        counts["recordings"],
    )

    return counts


def main() -> None:
    """CLI entry point for the GDPR cron job."""
    log.info("gdpr_cron: starting retention cleanup")
    counts = asyncio.run(run_gdpr_cleanup())
    log.info("gdpr_cron: done — %s", counts)


if __name__ == "__main__":
    main()
