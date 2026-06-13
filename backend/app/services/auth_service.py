"""Authentication business logic (kept out of the route layer for testability)."""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.schemas.user import UserLogin, UserRegister
from app.services import email as email_service


def register_user(db: Session, payload: UserRegister) -> tuple[User, str]:
    existing = db.scalar(
        select(User).where(
            (User.email == payload.email) | (User.username == payload.username)
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email or username already registered",
        )
    user = User(
        email=payload.email,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        display_name=payload.display_name or payload.username,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    return user, token


def authenticate_user(db: Session, payload: UserLogin) -> tuple[User, str]:
    user = db.scalar(select(User).where(User.email == payload.email))
    if user is not None and not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google Sign-In. Please continue with Google.",
        )
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    token = create_access_token(str(user.id))
    return user, token


def request_password_reset(db: Session, email: str, method: str = "link") -> dict:
    """Create a single-use reset (token + OTP) and email it. Returns the same shape whether or
    not the email exists (no account enumeration). In DEV mode (no SMTP) the credentials are
    returned so the flow is testable without an email provider."""
    result: dict = {"sent": True, "method": method}
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        return result

    token = secrets.token_urlsafe(32)
    otp = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.password_reset_ttl_minutes)
    # Invalidate any earlier unused resets for this account.
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used.is_(False))
        .values(used=True)
    )
    db.add(PasswordReset(user_id=user.id, token=token, otp=otp, method=method, expires_at=expires))
    db.commit()

    link = f"{settings.app_base_url.rstrip('/')}/reset-password?token={token}"
    ttl = settings.password_reset_ttl_minutes
    subject = "Reset your SafeTails password"
    text = (
        f"We received a request to reset your SafeTails password.\n\n"
        f"Your one-time code is: {otp}\n\n"
        f"Or open this link to reset it: {link}\n\n"
        f"This code and link expire in {ttl} minutes. If you didn't request this, ignore this email."
    )
    html = (
        f"<div style='font-family:Arial,sans-serif;max-width:480px'>"
        f"<h2 style='color:#157d8f'>Reset your SafeTails password</h2>"
        f"<p>Your one-time code is:</p>"
        f"<p style='font-size:28px;font-weight:700;letter-spacing:4px;color:#112a32'>{otp}</p>"
        f"<p>Or <a href='{link}' style='color:#157d8f'>click here to reset your password</a>.</p>"
        f"<p style='color:#66808b;font-size:13px'>Expires in {ttl} minutes. If you didn't request "
        f"this, you can safely ignore this email.</p></div>"
    )
    sent = email_service.send_email(email, subject, text, html)
    if not sent:
        result["dev"] = {"otp": otp, "token": token, "link": link}
    return result


def reset_password(
    db: Session,
    new_password: str,
    token: str | None = None,
    email: str | None = None,
    otp: str | None = None,
) -> None:
    """Complete a reset via link token OR (email + OTP). Single-use and expiry-checked."""
    if not new_password or len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    pr: PasswordReset | None = None
    if token:
        pr = db.scalar(select(PasswordReset).where(PasswordReset.token == token, PasswordReset.used.is_(False)))
    elif email and otp:
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            pr = db.scalar(
                select(PasswordReset)
                .where(PasswordReset.user_id == user.id, PasswordReset.otp == otp, PasswordReset.used.is_(False))
                .order_by(PasswordReset.created_at.desc())
            )
    else:
        raise HTTPException(status_code=400, detail="Provide a reset token, or an email and code.")

    if pr is None:
        raise HTTPException(status_code=400, detail="Invalid or already-used reset code.")
    exp = pr.expires_at if pr.expires_at.tzinfo else pr.expires_at.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This reset code has expired. Please request a new one.")

    user = db.get(User, pr.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Account not found.")
    user.hashed_password = hash_password(new_password)
    pr.used = True
    db.commit()


def _unique_username(db: Session, base: str) -> str:
    """Derive a unique, valid username from an email/name for a new OAuth account."""
    base = re.sub(r"[^a-z0-9_]", "", (base or "user").lower())[:24] or "user"
    if len(base) < 3:
        base = f"{base}user"
    candidate = base
    n = 0
    while db.scalar(select(User).where(User.username == candidate)) is not None:
        n += 1
        candidate = f"{base}{n}"
    return candidate


def google_sign_in(db: Session, id_token_str: str) -> tuple[User, str]:
    """Verify a Google ID token and sign the user in, creating or linking as needed.

    - Existing Google user (matched by `google_sub`) -> signed straight in.
    - Existing local account with the same verified email -> Google linked to it.
    - Otherwise -> a new account is created (no password; username derived from the email).
    """
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google Sign-In is not configured on the server.")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token
    except ImportError:  # pragma: no cover
        raise HTTPException(status_code=503, detail="Google auth library is unavailable on the server.")
    try:
        info = google_id_token.verify_oauth2_token(
            id_token_str, google_requests.Request(), settings.google_client_id
        )
    except Exception:  # noqa: BLE001 - any verification failure is an auth failure
        raise HTTPException(status_code=401, detail="Could not verify the Google sign-in. Please try again.")

    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email or not info.get("email_verified", False):
        raise HTTPException(status_code=401, detail="Google account is missing a verified email.")

    user = db.scalar(select(User).where(User.google_sub == sub))
    if user is None:
        user = db.scalar(select(User).where(User.email == email))
        if user is not None:
            user.google_sub = sub  # link Google to the existing local account
        else:
            user = User(
                email=email,
                username=_unique_username(db, email.split("@")[0]),
                hashed_password=None,
                display_name=info.get("name") or email.split("@")[0],
                avatar_url=info.get("picture"),
                google_sub=sub,
            )
            db.add(user)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    db.commit()
    db.refresh(user)
    return user, create_access_token(str(user.id))
