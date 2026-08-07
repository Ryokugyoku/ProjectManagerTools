ALTER TABLE wbs_tasks
ADD COLUMN prerequisite_task_id INTEGER REFERENCES wbs_tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_wbs_tasks_prerequisite
ON wbs_tasks (prerequisite_task_id);
