ALTER TABLE app_settings
ADD COLUMN daily_report_ancestor_depth INTEGER NOT NULL DEFAULT 3
CHECK (daily_report_ancestor_depth BETWEEN 0 AND 10);
