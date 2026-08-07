ALTER TABLE wbs_tasks ADD COLUMN finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1));
ALTER TABLE wbs_progress_logs ADD COLUMN daily_progress INTEGER NOT NULL DEFAULT 0 CHECK (daily_progress BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS wbs_work_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('finalized', 'rescheduled', 'progress', 'delay')),
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
    details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_wbs_work_history_task_time
ON wbs_work_history (task_id, occurred_at DESC, id DESC);
