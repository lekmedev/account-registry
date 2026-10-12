"""{{LABEL}} plugin package.

Marks the folder as a package so `plugins/{{name}}/tests/` imports as
`plugins.{{name}}.tests.*`. Without it, pytest resolves this plugin's
conftest.py to the same module name as `backend/tests/conftest.py` and
refuses to register it. Harmless to the loader: it imports plugin modules by
file path under its own generated names.
"""