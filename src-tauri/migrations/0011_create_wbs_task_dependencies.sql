CREATE TABLE IF NOT EXISTS wbs_task_dependencies (
    task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    prerequisite_task_id INTEGER NOT NULL REFERENCES wbs_tasks(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    PRIMARY KEY (task_id, prerequisite_task_id),
    CHECK (task_id <> prerequisite_task_id)
);

INSERT OR IGNORE INTO wbs_task_dependencies (task_id, prerequisite_task_id)
SELECT id, prerequisite_task_id
FROM wbs_tasks
WHERE prerequisite_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_task_dependencies_prerequisite
ON wbs_task_dependencies (prerequisite_task_id);
