"""Core API. Routers mount under /api/v1. No plugin names here."""
import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core import db
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.models import *  # noqa: F401,F403 — register core tables for Alembic
from app.core.routes import router as core_api_router
from app.core.services import seed_permissions

logger = logging.getLogger("app")

# uvicorn only configures its own loggers, so the "app" logger (and the plugin
# loaders under it) would otherwise drop every INFO record. Attach one handler
# if nobody else did — keeps `docker logs` useful without adding a dependency.
if not logger.handlers and not logging.getLogger().handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    logger.addHandler(_h)
    logger.setLevel(logging.INFO)


def _build_scheduler():
    """Core-owned APScheduler instance handed to plugins via load_plugins(scheduler=...).

    Plugins register their own cron jobs in tasks.py; core never names a plugin.
    Returns None when APScheduler is unusable so the app still starts.
    """
    try:
        from apscheduler.schedulers.background import BackgroundScheduler

        return BackgroundScheduler()
    except Exception as e:
        logger.error("scheduler unavailable, background tasks disabled: %s", e)
        return None


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    # Idempotent core permission seed; never deletes.
    try:
        with SessionLocal() as session:
            seed_permissions(session)
    except Exception:
        pass  # DB may be unreachable in test env; endpoints report via /health
    # Phase 3: discover + mount plugins (failures are skipped, app still starts).
    # The scheduler is passed in so plugin tasks.py crons actually register.
    scheduler = None
    try:
        from app.core import plugin_loader

        scheduler = _build_scheduler()
        plugin_loader.load_plugins(app, scheduler=scheduler)
    except Exception as e:
        logger.error("plugin loading failed: %s", e)
    # Start only after load_plugins so every plugin job is already registered.
    if scheduler is not None:
        try:
            scheduler.start()
            logger.info("scheduler started with %d job(s)", len(scheduler.get_jobs()))
        except Exception as e:
            logger.error("scheduler start failed: %s", e)
    try:
        yield
    finally:
        if scheduler is not None:
            try:
                scheduler.shutdown(wait=False)
            except Exception as e:
                logger.error("scheduler shutdown failed: %s", e)


app = FastAPI(
    title="Account Registry", version=settings.core_version, lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

core_router = APIRouter(prefix="/api/v1/core")


@core_router.get("/health")
def core_health():
    return {"status": "ok", "core_version": settings.core_version}


app.include_router(core_router)
app.include_router(core_api_router)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "core_version": settings.core_version,
        "db": "up" if db.check_db() else "down",
    }


@app.get("/api/v1/health")
def api_health():
    return health()


@app.exception_handler(Exception)
async def unhandled_handler(request, exc):  # noqa: ARG001
    return JSONResponse(status_code=500, content={"detail": "internal_error"})
