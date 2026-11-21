-- Store the assignment's positive finite maximum without capping bonus marks on submissions.
ALTER TABLE learnflow.assignments ADD COLUMN max_mark DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE learnflow.assignments ADD CONSTRAINT assignment_max_mark_valid
  CHECK (max_mark > 0 AND max_mark < 'Infinity'::double precision);
