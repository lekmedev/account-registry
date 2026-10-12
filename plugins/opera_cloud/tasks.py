"""opera_cloud background tasks. Loaded only when core passes a scheduler."""
import logging

logger = logging.getLogger("opera_cloud.tasks")


def _expire_now() -> None:
    from app.core.db import SessionLocal

    try:
        from plugins.opera_cloud import services
    except ImportError:
        import account_registry_plugin_opera_cloud_services as services  # type: ignore
    db = SessionLocal()
    try:
        n = services.expire_old_accounts(db)
    finally:
        db.close()
    logger.info("opera_cloud expiry job: %d account(s) expired", n)


def register_tasks(scheduler) -> None:
    """Daily 02:05 job: expire accounts past their expiration_date."""
    scheduler.add_job(
        _expire_now, "cron", hour=2, minute=5,
        id="opera_cloud_expire", replace_existing=True,
        misfire_grace_time=3600,
    )
