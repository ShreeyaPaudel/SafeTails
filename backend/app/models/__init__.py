"""ORM models. Importing this package registers all tables on `Base.metadata`."""
from app.models.user import User
from app.models.report import Report, ReportConfirmation, PointEvent, AIFeedback, HelpRequest
from app.models.gamification import Badge, UserBadge
from app.models.social import Like, Comment, SavedReport
from app.models.adoption import Adoption
from app.models.password_reset import PasswordReset
from app.models.message import Message

__all__ = [
    "Message",
    "User",
    "Report",
    "ReportConfirmation",
    "PointEvent",
    "AIFeedback",
    "HelpRequest",
    "Badge",
    "UserBadge",
    "Like",
    "Comment",
    "SavedReport",
    "Adoption",
    "PasswordReset",
]
