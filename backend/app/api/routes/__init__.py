"""Aggregates all route modules into a single API router.

Phase 0 ships these as typed contract stubs (correct paths + schemas, `501` bodies) so the
frontend and ML work can proceed against stable interfaces. Each phase fills in the logic.
"""
from fastapi import APIRouter

from app.api.routes import (
    adoption,
    auth,
    chat,
    gamification,
    help as help_routes,
    insights,
    map as map_routes,
    notifications,
    reports,
    social,
)

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])
api_router.include_router(map_routes.router, prefix="/map", tags=["map"])
api_router.include_router(gamification.router, tags=["gamification"])
api_router.include_router(social.router, tags=["social"])
api_router.include_router(help_routes.router, tags=["help"])
api_router.include_router(adoption.router, prefix="/adoptions", tags=["adoption"])
api_router.include_router(insights.router, prefix="/insights", tags=["insights"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(chat.router, tags=["chat"])
