CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 120),
    code TEXT NOT NULL CHECK (length(trim(code)) > 0 AND length(code) <= 40),
    client_name TEXT NOT NULL DEFAULT '' CHECK (length(client_name) <= 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'on_hold', 'completed')),
    priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high')),
    planned_start TEXT,
    planned_end TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code
ON projects (code COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES assignees(id) ON DELETE CASCADE,
    project_role TEXT NOT NULL DEFAULT '' CHECK (length(project_role) <= 80),
    PRIMARY KEY (project_id, user_id)
);

ALTER TABLE wbs_tasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wbs_tasks_project ON wbs_tasks (project_id);
