-- Hide marks until instructors release them and restrict stored marks to nonnegative finite numbers.
ALTER TABLE learnflow.assignments ADD COLUMN grades_visible BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE learnflow.assignment_submissions ADD COLUMN mark DOUBLE PRECISION;
ALTER TABLE learnflow.assignment_submissions ADD CONSTRAINT assignment_submission_mark_valid
  CHECK (mark IS NULL OR (mark >= 0 AND mark < 'Infinity'::double precision));
