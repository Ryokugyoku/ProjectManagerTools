ALTER TABLE wbs_tasks ADD COLUMN parent_task_id INTEGER REFERENCES wbs_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_tasks_parent
ON wbs_tasks (parent_task_id);
