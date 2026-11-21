-- Store selection mode and per-question automatic or instructor marks for quiz attempts.
ALTER TABLE learnflow.quiz_questions ADD COLUMN allow_multiple BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE learnflow.submissions ADD COLUMN question_marks JSONB NOT NULL DEFAULT '{}'::jsonb;
