ALTER TABLE user_leaves ADD COLUMN customer_approved INTEGER NOT NULL DEFAULT 0 CHECK (customer_approved IN (0, 1));
ALTER TABLE user_leaves ADD COLUMN manager_approved INTEGER NOT NULL DEFAULT 0 CHECK (manager_approved IN (0, 1));
ALTER TABLE user_leaves ADD COLUMN workflow_approved INTEGER NOT NULL DEFAULT 0 CHECK (workflow_approved IN (0, 1));
