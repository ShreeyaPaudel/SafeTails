"""Minimal SMTP email sender. Degrades gracefully: if SMTP isn't configured, `send_email`
returns False and callers fall back to DEV mode (surfacing the token/OTP in the API response)."""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email; return True on success, False if not configured or on failure."""
    if not is_configured():
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from
        msg["To"] = to
        msg.set_content(text)
        if html:
            msg.add_alternative(html, subtype="html")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Email send failed: %s", exc)
        return False
