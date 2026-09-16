"""Email notification service for HireAI.

Sends invite emails and result notifications via SMTP (or Resend API).
Gated behind ``enable_email_notifications`` org config flag.

Design:
  - Uses aiosmtplib for SMTP transport (or httpx for Resend API)
  - HTML + plaintext email templates
  - All sends are fire-and-forget with error logging
  - Integrated with BullMQ email queue for retry
"""

from __future__ import annotations

import asyncio
from typing import Any

from ..core.logging import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------

INVITE_SUBJECT = "You're invited to interview for {job_title} at {company_name}"

INVITE_HTML = """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 24px; color: #1a1a1a;">You're invited to interview</h1>
  <p style="font-size: 15px; color: #555; line-height: 1.6;">
    Hi {candidate_name},
  </p>
  <p style="font-size: 15px; color: #555; line-height: 1.6;">
    You've been invited to complete an AI-powered interview for the
    <strong>{job_title}</strong> position at <strong>{company_name}</strong>.
  </p>
  <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 24px 0;">
    <p style="font-size: 14px; color: #333; margin: 4px 0;">
      <strong>Duration:</strong> ~{duration} minutes
    </p>
    <p style="font-size: 14px; color: #333; margin: 4px 0;">
      <strong>Expires:</strong> {expires}
    </p>
  </div>
  <a href="{invite_url}" style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
    Start Interview
  </a>
  <p style="font-size: 13px; color: #888; margin-top: 24px;">
    This interview is conducted by AI and recorded for evaluation. You'll need a desktop browser with camera and microphone access.
  </p>
</div>
"""

RESULT_SUBJECT = "Your interview results for {job_title} at {company_name}"

RESULT_HTML = """
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
  <h1 style="font-size: 24px; color: #1a1a1a;">Interview Complete</h1>
  <p style="font-size: 15px; color: #555; line-height: 1.6;">
    Hi {candidate_name},
  </p>
  <p style="font-size: 15px; color: #555; line-height: 1.6;">
    Thank you for completing your interview for <strong>{job_title}</strong> at
    <strong>{company_name}</strong>. The hiring team will review your results
    and get back to you within a few business days.
  </p>
  <p style="font-size: 13px; color: #888; margin-top: 24px;">
    If you have any questions, please reach out to the hiring team directly.
  </p>
</div>
"""


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


async def _send_via_resend(
    api_key: str,
    from_email: str,
    to_email: str,
    subject: str,
    html: str,
) -> bool:
    """Send email via Resend API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": from_email,
                    "to": [to_email],
                    "subject": subject,
                    "html": html,
                },
            )
            if response.status_code < 300:
                log.info("email: sent to %s via Resend", to_email)
                return True
            log.warning("email: Resend failed (%d): %s", response.status_code, response.text)
            return False
    except Exception:
        log.exception("email: Resend error for %s", to_email)
        return False


async def _send_via_smtp(
    host: str,
    port: int,
    username: str,
    password: str,
    from_email: str,
    to_email: str,
    subject: str,
    html: str,
) -> bool:
    """Send email via SMTP (aiosmtplib)."""
    try:
        import aiosmtplib
        from email.mime.text import MIMEText

        msg = MIMEText(html, "html", "utf-8")
        msg["From"] = from_email
        msg["To"] = to_email
        msg["Subject"] = subject

        await aiosmtplib.send(
            msg,
            hostname=host,
            port=port,
            username=username,
            password=password,
            use_tls=True,
        )
        log.info("email: sent to %s via SMTP", to_email)
        return True
    except Exception:
        log.exception("email: SMTP error for %s", to_email)
        return False


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def send_invite_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    duration_min: int,
    invite_url: str,
    expires_at: str,
    config: dict[str, Any] | None = None,
) -> bool:
    """Send an interview invite email.

    Returns True if sent successfully, False otherwise.
    """
    config = config or {}

    subject = INVITE_SUBJECT.format(job_title=job_title, company_name=company_name)
    html = INVITE_HTML.format(
        candidate_name=candidate_name,
        job_title=job_title,
        company_name=company_name,
        duration=duration_min,
        invite_url=invite_url,
        expires=expires_at,
    )

    resend_key = config.get("resend_api_key") or ""
    if resend_key:
        return await _send_via_resend(
            api_key=resend_key,
            from_email=config.get("from_email", "interviews@hireai.dev"),
            to_email=to_email,
            subject=subject,
            html=html,
        )

    smtp_host = config.get("smtp_host", "")
    if smtp_host:
        return await _send_via_smtp(
            host=smtp_host,
            port=config.get("smtp_port", 587),
            username=config.get("smtp_username", ""),
            password=config.get("smtp_password", ""),
            from_email=config.get("from_email", "interviews@hireai.dev"),
            to_email=to_email,
            subject=subject,
            html=html,
        )

    log.warning("email: no transport configured (Resend or SMTP); skipping invite email")
    return False


async def send_result_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    config: dict[str, Any] | None = None,
) -> bool:
    """Send interview result notification email."""
    config = config or {}

    subject = RESULT_SUBJECT.format(job_title=job_title, company_name=company_name)
    html = RESULT_HTML.format(
        candidate_name=candidate_name,
        job_title=job_title,
        company_name=company_name,
    )

    resend_key = config.get("resend_api_key") or ""
    if resend_key:
        return await _send_via_resend(
            api_key=resend_key,
            from_email=config.get("from_email", "interviews@hireai.dev"),
            to_email=to_email,
            subject=subject,
            html=html,
        )

    smtp_host = config.get("smtp_host", "")
    if smtp_host:
        return await _send_via_smtp(
            host=smtp_host,
            port=config.get("smtp_port", 587),
            username=config.get("smtp_username", ""),
            password=config.get("smtp_password", ""),
            from_email=config.get("from_email", "interviews@hireai.dev"),
            to_email=to_email,
            subject=subject,
            html=html,
        )

    log.warning("email: no transport configured; skipping result email")
    return False
