"""{{LABEL}} permissions.

Upserted into the core permission table at startup and never deleted. Prefix
every code with the plugin name so codes stay unique across plugins, and keep
the five verbs the UI checks for: view / create / edit / delete / export.
Drop `export` if the plugin has no spreadsheet output.
"""

PERMISSIONS = [
    {"code": "{{PERM_PREFIX}}.record.view", "description": "View {{LABEL}} records"},
    {"code": "{{PERM_PREFIX}}.record.create", "description": "Create {{LABEL}} records"},
    {"code": "{{PERM_PREFIX}}.record.edit", "description": "Edit {{LABEL}} records"},
    {"code": "{{PERM_PREFIX}}.record.delete", "description": "Delete {{LABEL}} records"},
    {"code": "{{PERM_PREFIX}}.record.export", "description": "Export {{LABEL}} records to Excel"},
]