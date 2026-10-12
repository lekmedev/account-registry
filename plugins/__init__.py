"""Marks `plugins/` as a package so plugin tests get unique module names.

Without this, `plugins/<name>/tests/conftest.py` and `backend/tests/conftest.py`
both resolve to the module name `tests.conftest`, and pytest refuses to
register the second one:

    ValueError: Plugin already registered under a different name

With it, a plugin's tests import as `plugins.<name>.tests.*` — unique no
matter how many plugins ship tests. Harmless to the loader: it imports plugin
modules by file path under its own generated names.
"""