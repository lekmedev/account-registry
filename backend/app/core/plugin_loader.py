"""Generic plugin loader. Scans plugins/*/plugin.json at startup.

No plugin names are hard-coded here. A plugin that fails to load is
skipped and logged; the app still starts.
"""
import importlib.util
import json
import logging
import re
import sys
from pathlib import Path

from sqlalchemy import text

from app.core.config import settings
from app.core.db import Base  # noqa: F401 — ensures core tables registered
from app.core.db import SessionLocal, engine
from app.core.models import Permission

logger = logging.getLogger("plugin_loader")

NAME_RE = re.compile(r"^[a-z0-9_.\-]+$")

LOADED: dict[str, dict] = {}
SKIPPED: dict[str, str] = {}
_MOUNTED: set[str] = set()


def default_plugins_dir() -> Path:
    if settings.plugins_dir:
        return Path(settings.plugins_dir)
    here = Path(__file__).resolve()
    # repo layout: <repo>/backend/app/core/plugin_loader.py → parents[3] is repo.
    # container layout: /app/app/core/plugin_loader.py → /app/plugins.
    for cand in (here.parents[3] / "plugins", here.parents[2] / "plugins",
                 Path("/app/plugins")):
        if cand.is_dir():
            return cand
    return here.parents[3] / "plugins"


def _parse_version(v: str) -> tuple[int, ...]:
    return tuple(int(p) for p in str(v).split("."))


def _read_manifest(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text())
    except Exception as e:
        logger.error("plugin %s: bad plugin.json: %s", path.parent.name, e)
        return None
    if not isinstance(data, dict):
        logger.error("plugin %s: plugin.json is not an object", path.parent.name)
        return None
    return data


def _validate_manifest(dirname: str, data: dict) -> dict | None:
    for field in ("name", "version", "min_core_version"):
        if not data.get(field):
            logger.error("plugin %s: plugin.json missing %r", dirname, field)
            return None
    name = data["name"]
    if name != dirname or not NAME_RE.match(name):
        logger.error("plugin %s: name %r invalid or != dirname", dirname, name)
        return None
    try:
        _parse_version(data["version"])
        min_core = _parse_version(data["min_core_version"])
    except (ValueError, AttributeError) as e:
        logger.error("plugin %s: bad version string: %s", dirname, e)
        return None
    if min_core > _parse_version(settings.core_version):
        logger.error(
            "plugin %s: needs core %s, have %s — skipped",
            dirname, data["min_core_version"], settings.core_version,
        )
        return None
    depends = data.get("depends_on", [])
    if not isinstance(depends, list) or any(not isinstance(d, str) for d in depends):
        logger.error("plugin %s: depends_on must be a string list", dirname)
        return None
    menu = data.get("menu", [])
    if not isinstance(menu, list):
        logger.error("plugin %s: menu must be a list", dirname)
        return None
    for item in menu:
        if not isinstance(item, dict) or not item.get("label") or not item.get("path"):
            logger.error("plugin %s: menu items need label+path", dirname)
            return None
    return {
        "name": name,
        "version": data["version"],
        "description": data.get("description", ""),
        "min_core_version": data["min_core_version"],
        "depends_on": depends,
        "menu": menu,
    }


def discover_plugins(plugins_dir: Path | None = None) -> dict[str, dict]:
    """Scan dir, return {name: manifest} for valid manifests only."""
    root = Path(plugins_dir) if plugins_dir else default_plugins_dir()
    found: dict[str, dict] = {}
    if not root.is_dir():
        logger.warning("plugins dir %s missing — no plugins", root)
        return found
    for child in sorted(root.iterdir()):
        manifest_path = child / "plugin.json"
        if not child.is_dir() or not manifest_path.is_file():
            continue
        data = _read_manifest(manifest_path)
        if data is None:
            SKIPPED[child.name] = "bad plugin.json"
            continue
        manifest = _validate_manifest(child.name, data)
        if manifest is None:
            SKIPPED[child.name] = "invalid manifest"
            continue
        manifest["_dir"] = child
        found[manifest["name"]] = manifest
    return found


def resolve_order(manifests: dict[str, dict]) -> tuple[list[dict], dict[str, str]]:
    """Topo-sort by depends_on. Returns (ordered, {name: reason} skipped)."""
    skipped: dict[str, str] = {}
    ok = {
        name: m for name, m in manifests.items()
        if all(d in manifests for d in m["depends_on"])
    }
    for name, m in manifests.items():
        missing = [d for d in m["depends_on"] if d not in manifests]
        if missing:
            skipped[name] = f"missing deps: {missing}"
            logger.error("plugin %s: missing depends_on %s — skipped", name, missing)
    ordered: list[dict] = []
    done: set[str] = set()
    remaining = dict(ok)
    while remaining:
        progress = False
        for name, m in list(remaining.items()):
            if all(d in done for d in m["depends_on"]):
                ordered.append(m)
                done.add(name)
                del remaining[name]
                progress = True
        if not progress:
            for name in remaining:
                skipped[name] = "circular depends_on"
                logger.error("plugin %s: circular depends_on — skipped", name)
            break
    return ordered, skipped


def _canonical_name(plugin_name: str, mod: str) -> str:
    """The dotted name a plugin module would have if the repo were a package."""
    return f"plugins.{plugin_name}.{mod}"


def _importable(dotted: str) -> bool:
    """True when `dotted` names an importable package.

    importlib.util.find_spec raises ModuleNotFoundError for a missing parent
    package instead of returning None, so a bare call would turn "repo root
    is not on sys.path" (normal in Docker) into a plugin load failure.
    """
    try:
        return importlib.util.find_spec(dotted) is not None
    except (ImportError, ValueError, AttributeError):
        return False


def _load_module(plugin_name: str, mod: str, path: Path):
    """Exec one plugin module and register it under BOTH names.

    Plugin files import their siblings by package name
    (`from plugins.<name>.services import ...`) with a fallback to the
    generated name used here. When both spellings resolve to the SAME module
    object, a declarative model is defined exactly once — no duplicate class,
    no SAWarning, and no "the class the test imported isn't the one the
    route uses" trap. Tests import the package name first, so prefer the
    already-imported module when there is one.
    """
    canonical = _canonical_name(plugin_name, mod)
    generated = f"account_registry_plugin_{plugin_name}_{mod}"

    existing = sys.modules.get(canonical)
    if existing is not None:
        # Same file? Trust it; a stale entry from another plugin is impossible
        # because the name embeds the plugin name.
        sys.modules.setdefault(generated, existing)
        return existing

    spec = importlib.util.spec_from_file_location(generated, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    # Alias the package spelling so a later `import plugins.<name>.<mod>`
    # finds this module instead of re-executing the file. Only when the
    # plugins package is actually importable (repo root on sys.path, i.e.
    # tests); in Docker the repo root is not on sys.path and the generated
    # name is the only spelling in play. find_spec raises ModuleNotFoundError
    # for a missing package rather than returning None, so guard it.
    if _importable(canonical.rpartition(".")[0]):
        sys.modules.setdefault(canonical, module)
    return module


def _upsert_permissions(session, perms: list) -> list[str]:
    codes: list[str] = []
    for p in perms:
        if not isinstance(p, dict) or not p.get("code"):
            logger.warning("permission entry without code — ignored: %r", p)
            continue
        codes.append(p["code"])
        exists = session.query(Permission).filter_by(code=p["code"]).first()
        if exists is None:
            session.add(Permission(code=p["code"], description=p.get("description", "")))
    session.commit()  # upsert only; never deletes
    return codes


def _real_alembic():
    """Return (migration, operations, script) from the INSTALLED alembic.

    The core migrations package lives at <repo>/backend/alembic (copied to
    /app/alembic in the image), which shadows the installed `alembic`
    package whenever the app dir is on sys.path. Strip those entries so
    `import alembic...` resolves to site-packages.
    """
    import os
    import sys

    if "alembic.migration" in sys.modules:
        import alembic.migration as _mig
        import alembic.operations as _ops
        import alembic.script as _script
        return _mig, _ops, _script
    saved_path = list(sys.path)
    sys.modules.pop("alembic", None)  # drop the shadow if already cached

    def _shadows(entry: str) -> bool:
        base = entry or os.getcwd()
        return os.path.isfile(os.path.join(base, "alembic", "env.py")) and (
            not os.path.isfile(os.path.join(base, "alembic", "migration.py"))
        )

    try:
        sys.path = [p for p in saved_path if not _shadows(p)]
        import alembic.migration as _mig
        import alembic.operations as _ops
        import alembic.script as _script
        return _mig, _ops, _script
    finally:
        sys.path = saved_path
        # leave the real package in sys.modules so plugin
        # scripts (`from alembic import op`) resolve correctly


def run_plugin_migrations(db_engine, plugin_dir: Path, name: str) -> bool:
    """Run plugins/<name>/migrations/versions/*.py oldest-first.

    Uses its own version table alembic_version_<name>. No env.py needed.
    Single linear history assumed. Returns True if any migration ran.
    """
    mig_dir = Path(plugin_dir) / "migrations"
    versions = mig_dir / "versions"
    files = [p for p in versions.glob("*.py")] if versions.is_dir() else []
    if not any(p.name != "__init__.py" for p in files):
        return False
    table = f"alembic_version_{name}"
    MigrationMod, OperationsMod, ScriptMod = _real_alembic()
    script = ScriptMod.ScriptDirectory(str(mig_dir))
    with db_engine.begin() as conn:
        ctx = MigrationMod.MigrationContext.configure(conn, opts={"version_table": table})
        try:
            heads = ctx.get_current_heads()
        except Exception:
            heads = ()
        current = heads[0] if heads else None
        chain = list(reversed(list(script.walk_revisions(base="base", head="head"))))
        start = 0
        if current:
            ids = [r.revision for r in chain]
            if current not in ids:
                logger.warning("plugin %s: version %s unknown — migrations skipped", name, current)
                return False
            start = ids.index(current) + 1
        pending = chain[start:]
        if pending:
            op_ctx = MigrationMod.MigrationContext.configure(conn, opts={"version_table": table})
            with OperationsMod.Operations.context(op_ctx):
                for rev in pending:
                    rev.module.upgrade()
        conn.execute(text(f'CREATE TABLE IF NOT EXISTS "{table}" (version_num VARCHAR(32) NOT NULL)'))
        conn.execute(text(f'DELETE FROM "{table}"'))
        for head in script.get_heads():
            conn.execute(text(f'INSERT INTO "{table}" (version_num) VALUES (:v)'), {"v": head})
    return bool(pending)


# Modules are imported in dependency order, never alphabetically. routes.py
# and tasks.py import services.py by its generated module name, so services
# must already be in sys.modules by then — otherwise the plugin is skipped
# with a confusing "No module named ..." error. Generic: no plugin named here.
_MODULE_ORDER = ("models", "services", "permissions", "routes")


def _init_one(app, manifest: dict, session_factory, db_engine, scheduler) -> bool:
    name = manifest["name"]
    pdir = manifest["_dir"]
    mods: dict[str, object] = {}
    try:
        for mod in _MODULE_ORDER:
            path = pdir / f"{mod}.py"
            if path.is_file():
                mods[mod] = _load_module(name, mod, path)
    except Exception as e:
        logger.error("plugin %s: import failed: %s — skipped", name, e)
        SKIPPED[name] = f"import: {e}"
        return False

    routes_mod = mods.get("routes")
    perms_mod = mods.get("permissions")

    if routes_mod is not None:
        router = getattr(routes_mod, "router", None)
        if router is None:
            logger.error("plugin %s: routes.py has no `router` — skipped", name)
            SKIPPED[name] = "routes.py has no router"
            return False
        if name not in _MOUNTED:
            app.include_router(router, prefix=f"/api/v1/plugins/{name}")
            _MOUNTED.add(name)

    try:
        with session_factory() as session:
            raw = getattr(perms_mod, "PERMISSIONS", []) if perms_mod else []
            codes = _upsert_permissions(session, list(raw))
    except Exception as e:
        logger.error("plugin %s: permission upsert failed: %s — skipped", name, e)
        SKIPPED[name] = f"permissions: {e}"
        return False

    try:
        run_plugin_migrations(db_engine, pdir, name)
    except Exception as e:
        logger.error("plugin %s: migrations failed: %s — skipped", name, e)
        SKIPPED[name] = f"migrations: {e}"
        return False

    tasks_path = pdir / "tasks.py"
    if tasks_path.is_file() and scheduler is not None:
        try:
            tasks_mod = _load_module(name, "tasks", tasks_path)
            register = getattr(tasks_mod, "register_tasks", None)
            if register:
                register(scheduler)
        except Exception as e:
            logger.error("plugin %s: register_tasks failed: %s", name, e)

    LOADED[name] = {
        "name": name,
        "version": manifest["version"],
        "description": manifest["description"],
        "menu": manifest["menu"],
        "permissions": codes,
    }
    logger.info("plugin %s v%s loaded", name, manifest["version"])
    return True


def load_plugins(app, *, session_factory=None, db_engine=None,
                 plugins_dir: Path | None = None, scheduler=None) -> dict[str, dict]:
    """Full pipeline: discover → order → import/mount/upsert/migrate/tasks."""
    manifests = discover_plugins(plugins_dir)
    ordered, skipped = resolve_order(manifests)
    SKIPPED.update(skipped)
    sf = session_factory or SessionLocal
    eng = db_engine if db_engine is not None else engine
    for manifest in ordered:
        if manifest["name"] in LOADED:
            continue
        _init_one(app, manifest, sf, eng, scheduler)
    return dict(LOADED)


def get_loaded_plugins() -> list[dict]:
    return [
        {k: v for k, v in p.items() if not k.startswith("_")}
        for _, p in sorted(LOADED.items())
    ]
