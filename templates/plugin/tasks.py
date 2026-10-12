"""{{LABEL}} background tasks. Loaded only when core passes a scheduler.

Optional file: delete it and the plugin still loads. Keep jobs idempotent —
the scheduler runs them once per trigger, but a restart re-runs anything whose
window was missed (misfire_grace_time).
"""
import logging

logger = logging.getLogger("{{name}}.tasks")


def _expire_now() -> None:
    from app.core.db import SessionLocal

    try:
        from plugins.{{name}} import services
    except ImportError:
        import account_registry_plugin_{{name}}_services as services  # type: ignore
    db = SessionLocal()
    try:
        n = services.expire_old_records(db)
    finally:
        db.close()
    logger.info("{{name}} expiry job: %d record(s) expired", n)


def register_tasks(scheduler) -> None:
    """Daily 02:05 job. Core calls this once, after the plugin is loaded."""
    scheduler.add_job(
        _expire_now, "cron", hour=2, minute=5,
        id="{{name}}_expire", replace_existing=True,
        misfire_grace_time=3600,
    )