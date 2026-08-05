CREATE TABLE IF NOT EXISTS assignees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 80),
    email TEXT NOT NULL CHECK (length(trim(email)) > 0 AND length(email) <= 254),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assignees_email
ON assignees (email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS wbs_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    assignee_id INTEGER REFERENCES assignees(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
        CHECK (status IN ('not_started', 'in_progress', 'completed', 'on_hold')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    country_code TEXT NOT NULL DEFAULT 'JP' CHECK (length(country_code) = 2),
    planned_start TEXT NOT NULL,
    planned_end TEXT NOT NULL,
    business_days INTEGER NOT NULL CHECK (business_days > 0 AND business_days <= 999),
    actual_start TEXT,
    actual_end TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_schedule
ON wbs_tasks (planned_start, planned_end);

CREATE TABLE IF NOT EXISTS wbs_progress_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    log_date TEXT NOT NULL,
    progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (task_id, log_date)
);

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    country_code TEXT NOT NULL DEFAULT 'JP' CHECK (length(country_code) = 2),
    notification_time TEXT NOT NULL DEFAULT '17:30',
    notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1)),
    last_notified_date TEXT
);

INSERT OR IGNORE INTO app_settings (id) VALUES (1);
