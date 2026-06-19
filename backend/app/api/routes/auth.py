"""Auth endpoints - register, login (JWT), current-user, profile updates."""
import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.ratelimit import RateLimit
from app.models.user import User
from app.schemas.user import AuthResponse, UserLogin, UserPublic, UserRegister
from app.services import media
from app.services.auth_service import (
    authenticate_user,
    google_sign_in,
    register_user,
    request_password_reset,
    reset_password,
)

router = APIRouter()


class GoogleAuthRequest(BaseModel):
    id_token: str


class ForgotPasswordRequest(BaseModel):
    email: str
    method: str = "link"  # link | otp (affects the email copy / UX only)


class ResetPasswordRequest(BaseModel):
    new_password: str
    token: str | None = None       # link flow
    email: str | None = None       # otp flow
    otp: str | None = None         # otp flow


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    username: str | None = None       # unique handle; validated + rate-limited on change
    default_lat: float | None = None
    default_lng: float | None = None
    default_ward: str | None = None
    clear_location: bool | None = None  # explicitly unset the saved home area
    preferences: dict | None = None  # merged (partial update) into the stored preferences


# Username policy: 3-20 chars, starts with a letter, lowercase letters/digits/underscore only.
_USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,19}$")
_RESERVED_USERNAMES = {
    "admin", "administrator", "root", "system", "safetails", "support", "help", "moderator",
    "anonymous", "null", "undefined", "me", "you", "user", "official", "api",
}
USERNAME_CHANGE_COOLDOWN_DAYS = 14  # safeguard against churn/abuse


def _validate_username(db: Session, raw: str, user: User) -> str:
    """Normalise + validate a requested username; raise HTTPException on any violation."""
    name = (raw or "").strip().lower()
    if name == (user.username or "").lower():
        return user.username  # unchanged
    if not _USERNAME_RE.match(name):
        raise HTTPException(
            status_code=422,
            detail="Username must be 3-20 characters, start with a letter, and use only lowercase letters, numbers or underscore.",
        )
    if name in _RESERVED_USERNAMES:
        raise HTTPException(status_code=422, detail="That username is reserved. Please choose another.")
    # Cooldown safeguard (stored in preferences).
    prefs = user.preferences or {}
    last = prefs.get("username_changed_at")
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            days = (datetime.now(timezone.utc) - last_dt).days
            if days < USERNAME_CHANGE_COOLDOWN_DAYS:
                raise HTTPException(
                    status_code=429,
                    detail=f"You can change your username again in {USERNAME_CHANGE_COOLDOWN_DAYS - days} day(s).",
                )
        except ValueError:
            pass
    # Uniqueness (case-insensitive), excluding self.
    clash = db.scalar(
        select(User).where(func.lower(User.username) == name, User.id != user.id)
    )
    if clash is not None:
        raise HTTPException(status_code=409, detail="That username is already taken.")
    return name


@router.post("/register", response_model=AuthResponse, status_code=201,
             dependencies=[Depends(RateLimit("register", limit=8, window_s=300))])
def register(payload: UserRegister, db: Session = Depends(get_db)) -> AuthResponse:
    user, token = register_user(db, payload)
    return AuthResponse(user=UserPublic.model_validate(user), access_token=token)


@router.post("/login", response_model=AuthResponse,
             dependencies=[Depends(RateLimit("login", limit=10, window_s=60))])
def login(payload: UserLogin, db: Session = Depends(get_db)) -> AuthResponse:
    user, token = authenticate_user(db, payload)
    return AuthResponse(user=UserPublic.model_validate(user), access_token=token)


@router.post("/forgot-password",
             dependencies=[Depends(RateLimit("forgot", limit=5, window_s=300))])
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict:
    """Start a password reset: emails a link + OTP. Always returns success (no account
    enumeration). In DEV mode (no SMTP configured) the response includes the token/OTP."""
    return request_password_reset(db, payload.email.strip().lower(), payload.method)


@router.post("/reset-password",
             dependencies=[Depends(RateLimit("reset", limit=10, window_s=300))])
def reset_password_route(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict:
    """Complete a reset via link token OR email + OTP."""
    reset_password(
        db, payload.new_password,
        token=payload.token,
        email=(payload.email.strip().lower() if payload.email else None),
        otp=payload.otp,
    )
    return {"reset": True}


@router.get("/google/available")
def google_available() -> dict:
    """Lets the frontend show the Google button only when the server is configured for it."""
    return {"available": bool(settings.google_client_id), "client_id": settings.google_client_id or None}


@router.post("/google", response_model=AuthResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user, token = google_sign_in(db, payload.id_token)
    return AuthResponse(user=UserPublic.model_validate(user), access_token=token)


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/me/change-password")
def change_password(
    payload: ChangePassword,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Change the signed-in user's password (requires the current one). Accounts created via
    Google have no password and must use the reset flow to set one."""
    from app.core.security import hash_password, verify_password

    if not current_user.hashed_password:
        raise HTTPException(status_code=400, detail="This account signs in with Google. Use 'Forgot password' to set a password first.")
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Your current password is incorrect.")
    if payload.new_password == payload.current_password:
        raise HTTPException(status_code=422, detail="New password must be different from the current one.")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"changed": True}


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic.model_validate(current_user)


@router.patch("/me", response_model=UserPublic)
def update_me(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPublic:
    if payload.display_name is not None and payload.display_name.strip():
        current_user.display_name = payload.display_name.strip()[:60]
    # Username change: validated (format, reserved, uniqueness) + cooldown safeguard.
    if payload.username is not None and payload.username.strip():
        new_username = _validate_username(db, payload.username, current_user)
        if new_username != current_user.username:
            current_user.username = new_username
            merged = dict(current_user.preferences or {})
            merged["username_changed_at"] = datetime.now(timezone.utc).isoformat()
            current_user.preferences = merged
    # Saved default location. `clear_location` explicitly unsets it (graceful fallback to
    # valley-wide behaviour); otherwise set lat/lng together with the generalised ward.
    if payload.clear_location:
        current_user.default_lat = None
        current_user.default_lng = None
        current_user.default_ward = None
    elif payload.default_lat is not None and payload.default_lng is not None:
        current_user.default_lat = payload.default_lat
        current_user.default_lng = payload.default_lng
        if payload.default_ward is not None:
            current_user.default_ward = payload.default_ward or None
    # Merge (partial-update) preferences so a single toggle doesn't wipe the rest.
    if payload.preferences is not None:
        merged = dict(current_user.preferences or {})
        merged.update(payload.preferences)
        current_user.preferences = merged
    db.commit()
    db.refresh(current_user)
    return UserPublic.model_validate(current_user)


@router.get("/me/export")
def export_my_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """GDPR-style export of everything tied to the account (JSON download on the client)."""
    from app.models.report import PointEvent, Report, ReportConfirmation
    from app.models.social import Comment, Like
    from app.services.report_service import to_public

    reports = db.scalars(select(Report).where(Report.reporter_id == current_user.id)).all()
    comments = db.scalars(select(Comment).where(Comment.user_id == current_user.id)).all()
    likes = db.scalars(select(Like).where(Like.user_id == current_user.id)).all()
    confirmations = db.scalars(select(ReportConfirmation).where(ReportConfirmation.user_id == current_user.id)).all()
    points = db.scalars(select(PointEvent).where(PointEvent.user_id == current_user.id)).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": UserPublic.model_validate(current_user).model_dump(mode="json"),
        "reports": [to_public(r).model_dump(mode="json") for r in reports],
        "comments": [{"report_id": str(c.report_id), "body": c.body, "created_at": c.created_at.isoformat()} for c in comments],
        "likes": [{"report_id": str(l.report_id)} for l in likes],
        "confirmations": [{"report_id": str(c.report_id), "vote": c.vote, "created_at": c.created_at.isoformat()} for c in confirmations],
        "point_events": [{"delta": p.delta, "reason": p.reason, "created_at": p.created_at.isoformat()} for p in points],
    }


@router.delete("/me", status_code=204)
def delete_my_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete the account. Reports are anonymised (kept for welfare history) rather than removed."""
    from app.models.message import Message
    from app.models.password_reset import PasswordReset
    from app.models.report import HelpRequest, PointEvent, Report, ReportConfirmation
    from app.models.gamification import UserBadge
    from app.models.social import Comment, Like
    from sqlalchemy import delete as sql_delete, update as sql_update

    uid = current_user.id
    # Remove personal engagement; anonymise reports to preserve the welfare record.
    db.execute(sql_delete(Message).where(Message.sender_id == uid))
    db.execute(sql_delete(Comment).where(Comment.user_id == uid))
    db.execute(sql_delete(Like).where(Like.user_id == uid))
    db.execute(sql_delete(ReportConfirmation).where(ReportConfirmation.user_id == uid))
    db.execute(sql_delete(PointEvent).where(PointEvent.user_id == uid))
    db.execute(sql_delete(UserBadge).where(UserBadge.user_id == uid))
    db.execute(sql_delete(HelpRequest).where(HelpRequest.helper_id == uid))
    db.execute(sql_delete(PasswordReset).where(PasswordReset.user_id == uid))
    db.execute(sql_update(Report).where(Report.helper_id == uid).values(helper_id=None))
    # Reassign the reporter to a shared anonymous account so map/analytics history stays intact.
    anon = db.scalar(select(User).where(User.email == "anonymous@safetails.np"))
    if anon is None:
        from app.core.security import hash_password
        anon = User(email="anonymous@safetails.np", username="anonymous", display_name="Former member",
                    hashed_password=hash_password(uuid.uuid4().hex), is_active=False)
        db.add(anon); db.flush()
    db.execute(sql_update(Report).where(Report.reporter_id == uid).values(reporter_id=anon.id))
    db.delete(current_user)
    db.commit()
    return None


@router.post("/me/avatar", response_model=UserPublic)
async def upload_avatar(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPublic:
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty upload")
    # Normalise to an optimised, square, metadata-free JPEG before hosting.
    from app.utils.images import InvalidImageError, load_clean_image, save_image, to_avatar_jpeg

    try:
        img = load_clean_image(raw)
    except InvalidImageError:
        raise HTTPException(status_code=400, detail="Invalid image")
    avatar_bytes = to_avatar_jpeg(img)
    # Prefer Cloudinary; fall back to local /uploads so avatar upload never hard-fails.
    url = media.upload_image(avatar_bytes, folder="safetails/avatars", public_id=f"user_{current_user.id}")
    if not url:
        from PIL import Image as _Image
        import io as _io
        local_path = save_image(_Image.open(_io.BytesIO(avatar_bytes)), settings.upload_path)
        url = f"/uploads/{os.path.basename(local_path)}"
    current_user.avatar_url = url
    db.commit()
    db.refresh(current_user)
    return UserPublic.model_validate(current_user)
