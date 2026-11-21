-- Require instructor permission before replacing a student's current submission.
ALTER TABLE learnflow.assignments ADD COLUMN allow_resubmission BOOLEAN NOT NULL DEFAULT false;
