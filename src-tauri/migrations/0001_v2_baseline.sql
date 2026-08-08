PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
    email TEXT NOT NULL CHECK (length(trim(email)) BETWEEN 1 AND 254),
    birthday TEXT,
    department TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    interests TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '',
    work_style TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 40),
    client_name TEXT NOT NULL DEFAULT '' CHECK (length(client_name) <= 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'active', 'on_hold', 'completed')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    planned_start TEXT,
    planned_end TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_code ON projects (code COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_role TEXT NOT NULL DEFAULT '' CHECK (length(project_role) <= 80),
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS wbs_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    parent_task_id INTEGER REFERENCES wbs_tasks(id) ON DELETE SET NULL,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'on_hold')),
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    country_code TEXT NOT NULL DEFAULT 'JP' CHECK (length(country_code) = 2),
    planned_start TEXT NOT NULL,
    planned_end TEXT NOT NULL,
    business_days INTEGER NOT NULL CHECK (business_days BETWEEN 1 AND 999),
    actual_start TEXT,
    actual_end TEXT,
    finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_project ON wbs_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_tasks_parent ON wbs_tasks (parent_task_id);
CREATE INDEX IF NOT EXISTS idx_wbs_tasks_owner ON wbs_tasks (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_wbs_tasks_schedule ON wbs_tasks (planned_start, planned_end);

CREATE TABLE IF NOT EXISTS wbs_task_dependencies (
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    prerequisite_task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (task_id, prerequisite_task_id),
    CHECK (task_id <> prerequisite_task_id)
);

CREATE INDEX IF NOT EXISTS idx_wbs_task_dependencies_prerequisite
ON wbs_task_dependencies (prerequisite_task_id);

CREATE TABLE IF NOT EXISTS task_progress_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    entry_date TEXT NOT NULL,
    daily_progress INTEGER NOT NULL CHECK (daily_progress BETWEEN 0 AND 100),
    cumulative_progress INTEGER NOT NULL CHECK (cumulative_progress BETWEEN 0 AND 100),
    note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (task_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_task_progress_entries_date
ON task_progress_entries (entry_date, task_id);

CREATE TABLE IF NOT EXISTS task_activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('created', 'finalized', 'rescheduled', 'progress', 'delay')),
    reason_category TEXT NOT NULL DEFAULT '' CHECK (reason_category IN (
        '', 'scope_omission', 'requirement_addition', 'requirement_change', 'estimate_variance',
        'technical_issue', 'external_dependency', 'resource_constraint', 'priority_change',
        'quality_response', 'other'
    )),
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
    details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_task_activity_events_task_time
ON task_activity_events (task_id, occurred_at DESC, id DESC);

CREATE TRIGGER IF NOT EXISTS record_wbs_task_finalization
AFTER UPDATE OF finalized ON wbs_tasks
WHEN OLD.finalized = 0 AND NEW.finalized = 1
BEGIN
    INSERT INTO task_activity_events (task_id, owner_user_id, event_kind, details)
    VALUES (NEW.id, NEW.owner_user_id, 'finalized', 'タスクの計画を確定しました。');
END;

CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
    description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
    due_date TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    color TEXT NOT NULL DEFAULT 'forest' CHECK (color IN ('forest', 'ocean', 'amber', 'violet', 'slate')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_milestones_project_date ON milestones (project_id, due_date);

CREATE TABLE IF NOT EXISTS user_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_date TEXT NOT NULL,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('planned', 'unplanned')),
    leave_unit TEXT NOT NULL CHECK (leave_unit IN ('full_day', 'morning', 'afternoon')),
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
    customer_approved INTEGER NOT NULL DEFAULT 0 CHECK (customer_approved IN (0, 1)),
    manager_approved INTEGER NOT NULL DEFAULT 0 CHECK (manager_approved IN (0, 1)),
    workflow_approved INTEGER NOT NULL DEFAULT 0 CHECK (workflow_approved IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, leave_date)
);

CREATE INDEX IF NOT EXISTS idx_user_leaves_user_date ON user_leaves (user_id, leave_date);

CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    country_code TEXT NOT NULL DEFAULT 'JP' CHECK (length(country_code) = 2),
    notification_time TEXT NOT NULL DEFAULT '17:30',
    notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1)),
    last_notified_date TEXT,
    daily_report_ancestor_depth INTEGER NOT NULL DEFAULT 3 CHECK (daily_report_ancestor_depth BETWEEN 0 AND 10)
);

INSERT OR IGNORE INTO app_settings (id) VALUES (1);
