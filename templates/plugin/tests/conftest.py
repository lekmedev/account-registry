"""Fixture bootstrap for plugin-local tests.

Plugin tests live in plugins/<name>/tests/, so writing a plugin never means
editing backend/tests/. The shared fixtures come from core; this file only
puts the repo on sys.path and re-exports what a plugin test needs.

Note the three parent hops: tests/ -> <plugin>/ -> plugins/ -> repo root.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / "backend"
for _p in (str(REPO_ROOT), str(BACKEND)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Re-exported as fixtures: pytest picks them up from this conftest.
from tests.conftest import app_factory, login  # noqa: E402,F401