CREATE TABLE user_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES assignees(id) ON DELETE CASCADE,
    leave_date TEXT NOT NULL,
    leave_type TEXT NOT NULL CHECK (leave_type IN ('planned', 'unplanned')),
    leave_unit TEXT NOT NULL CHECK (leave_unit IN ('full_day', 'morning', 'afternoon')),
    reason TEXT NOT NULL DEFAULT '' CHECK (length(reason) <= 500),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (user_id, leave_date)
);

CREATE INDEX idx_user_leaves_user_date
ON user_leaves (user_id, leave_date);
