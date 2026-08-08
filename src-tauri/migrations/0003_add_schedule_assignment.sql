ALTER TABLE wbs_tasks
ADD COLUMN schedule_assigned INTEGER NOT NULL DEFAULT 1 CHECK (schedule_assigned IN (0, 1));
