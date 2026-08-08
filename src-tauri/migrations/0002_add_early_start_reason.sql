ALTER TABLE task_progress_entries
ADD COLUMN early_start_reason TEXT NOT NULL DEFAULT '' CHECK (length(early_start_reason) <= 1000);
