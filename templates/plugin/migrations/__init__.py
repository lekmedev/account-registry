"""{{LABEL}} migration chain.

Own Alembic chain, own version table (alembic_version_{{name}}) — no env.py
needed, core points the runner at this folder. Only two files are required:
the package markers here and versions/0001_*.py.
"""