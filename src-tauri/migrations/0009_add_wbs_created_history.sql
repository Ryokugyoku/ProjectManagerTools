DROP INDEX IF EXISTS idx_wbs_work_history_task_time;

ALTER TABLE wbs_work_history RENAME TO wbs_work_history_previous;

CREATE TABLE wbs_work_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('created', 'finalized', 'rescheduled', 'progress', 'delay')),
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 1000),
    details TEXT NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
    occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO wbs_work_history (id, task_id, event_type, reason, details, occurred_at)
SELECT id, task_id, event_type, reason, details, occurred_at
FROM wbs_work_history_previous;

DROP TABLE wbs_work_history_previous;

CREATE INDEX idx_wbs_work_history_task_time
ON wbs_work_history (task_id, occurred_at DESC, id DESC);
