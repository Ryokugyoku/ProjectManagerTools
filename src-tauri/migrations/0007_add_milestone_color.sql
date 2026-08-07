ALTER TABLE milestones
ADD COLUMN color TEXT NOT NULL DEFAULT 'forest'
CHECK (color IN ('forest', 'ocean', 'amber', 'violet', 'slate'));
