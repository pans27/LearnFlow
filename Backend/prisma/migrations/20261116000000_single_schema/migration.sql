-- Define the LearnFlow single-schema database for PostgreSQL 18.
-- Scope course operations by authorized course_id and enforce permissions in the backend.
-- Authentication and file processing are integrated separately.
BEGIN;
CREATE SCHEMA IF NOT EXISTS learnflow;

CREATE TABLE learnflow.users (
  user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_nonempty CHECK (length(trim(email)) > 0)
);
CREATE UNIQUE INDEX users_email_unique ON learnflow.users (lower(email));

CREATE TABLE learnflow.courses (
  course_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX courses_status_idx ON learnflow.courses(status);

CREATE TABLE learnflow.enrollments (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES learnflow.users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('instructor','student')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (course_id, user_id)
);
CREATE INDEX enrollments_user_idx ON learnflow.enrollments(user_id);

-- Persistent sessions; cookie stores only an opaque session identifier.
CREATE TABLE learnflow.sessions (
  session_id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES learnflow.users(user_id) ON DELETE CASCADE,
  session_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expires_idx ON learnflow.sessions(expires_at);
CREATE INDEX sessions_user_idx ON learnflow.sessions(user_id);


CREATE TABLE learnflow.announcements (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  announcement_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX announcements_recent_idx ON learnflow.announcements(course_id, created_at DESC);

CREATE TABLE learnflow.assignments (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  assignment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_by BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  is_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, assignment_id)
);
CREATE INDEX assignments_due_idx ON learnflow.assignments(course_id, due_at);

CREATE TABLE learnflow.quizzes (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  quiz_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_by BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  title TEXT NOT NULL,
  description TEXT,
  opens_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  is_visible BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts > 0),
  show_results BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quiz_dates_valid CHECK (opens_at IS NULL OR due_at IS NULL OR due_at >= opens_at),
  UNIQUE (course_id, quiz_id)
);
CREATE INDEX quizzes_due_idx ON learnflow.quizzes(course_id, due_at);

CREATE TABLE learnflow.quiz_questions (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  question_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  question_type TEXT NOT NULL CHECK (question_type IN ('multiple_choice','true_false','short_answer')),
  prompt TEXT NOT NULL,
  options JSONB,
  answer_key JSONB,
  points NUMERIC(8,2) NOT NULL DEFAULT 1 CHECK (points >= 0),
  UNIQUE (course_id, quiz_id, position),
  FOREIGN KEY (course_id, quiz_id) REFERENCES learnflow.quizzes(course_id, quiz_id) ON DELETE CASCADE
);

CREATE TABLE learnflow.submissions (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  submission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','graded')),
  draft_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  s3_key TEXT, -- finalized answer file (questionId -> answer)
  feedback TEXT,
  score NUMERIC(10,2) CHECK (score IS NULL OR score >= 0),
  graded_by BIGINT REFERENCES learnflow.users(user_id),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  UNIQUE (course_id, quiz_id, student_id, attempt_number),
  CONSTRAINT finalized_has_file CHECK (status = 'draft' OR s3_key IS NOT NULL),
  FOREIGN KEY (course_id, quiz_id) REFERENCES learnflow.quizzes(course_id, quiz_id) ON DELETE CASCADE
);
CREATE INDEX submissions_quiz_status_idx ON learnflow.submissions(course_id, quiz_id, status);
CREATE INDEX submissions_student_idx ON learnflow.submissions(course_id, student_id);

-- Instructor files and student notes share one table.
CREATE TABLE learnflow.learning_resources (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  resource_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('instructor_material','student_note','assignment_file')),
  title TEXT NOT NULL,
  description TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  s3_key TEXT NOT NULL UNIQUE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','completed','failed')),
  page_count INTEGER CHECK (page_count IS NULL OR page_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, resource_id)
);
CREATE INDEX resources_recent_idx ON learnflow.learning_resources(course_id, created_at DESC);
CREATE INDEX resources_owner_idx ON learnflow.learning_resources(course_id, owner_id);
CREATE INDEX resources_type_idx ON learnflow.learning_resources(course_id, resource_type);

CREATE TABLE learnflow.resource_pages (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  resource_id BIGINT NOT NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  extracted_text TEXT NOT NULL DEFAULT '',
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', extracted_text)) STORED,
  PRIMARY KEY (course_id, resource_id, page_number),
  FOREIGN KEY (course_id, resource_id) REFERENCES learnflow.learning_resources(course_id, resource_id) ON DELETE CASCADE
);
CREATE INDEX resource_pages_search_idx ON learnflow.resource_pages USING GIN(search_vector);

-- OPTIONAL: only needed if assignment-file submission endpoints are implemented.
CREATE TABLE learnflow.assignment_submissions (
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  submission_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  assignment_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL REFERENCES learnflow.users(user_id),
  s3_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, assignment_id, student_id),
  FOREIGN KEY (course_id, assignment_id) REFERENCES learnflow.assignments(course_id, assignment_id) ON DELETE CASCADE
);

CREATE TABLE learnflow.extraction_jobs (
  job_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES learnflow.courses(course_id) ON DELETE CASCADE,
  resource_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  FOREIGN KEY (course_id, resource_id) REFERENCES learnflow.learning_resources(course_id, resource_id) ON DELETE CASCADE
);
CREATE INDEX extraction_jobs_queue_idx
  ON learnflow.extraction_jobs(status, created_at) WHERE status IN ('pending','failed');
CREATE INDEX extraction_jobs_resource_idx
  ON learnflow.extraction_jobs(course_id, resource_id);

-- Maintain updated_at automatically on mutable rows.
CREATE FUNCTION learnflow.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON learnflow.users
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON learnflow.courses
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER announcements_updated_at BEFORE UPDATE ON learnflow.announcements
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON learnflow.assignments
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER quizzes_updated_at BEFORE UPDATE ON learnflow.quizzes
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER submissions_updated_at BEFORE UPDATE ON learnflow.submissions
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();
CREATE TRIGGER learning_resources_updated_at BEFORE UPDATE ON learnflow.learning_resources
  FOR EACH ROW EXECUTE FUNCTION learnflow.touch_updated_at();

COMMIT;

-- Scope PDF search by course and apply resource visibility permissions before returning results.
