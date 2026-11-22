import { QuizPreview } from "@/components/QuizPreview";
import { confirmCourseAction } from "@/lib/course-confirm";
import { CourseFeedback, VisibilityBadge } from "@/components/CourseFeedback";
import { readQuestionMarks } from "@/lib/quiz-grading";
import {
  studentResourceAccept,
  validateResourceFile,
  validateBackendResourceFile,
} from "@/lib/resource-files";
import { DueDate } from "@/components/DueDate";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";
import { api, isMock, resourceFileUrl, deleteResource } from "@/services/api";
import { useAuth } from "@/App";
import { liveQuizzes } from "@/services/quizzes";
import { demoQuizReview } from "@/services/mock";
import { useData } from "@/lib/use-data";
import { useCourse } from "@/layouts/Layouts";
import { Button } from "@/components/ui/button";
import type {
  Answers,
  Question,
  QuestionKind,
  Quiz,
  QuizQuestionInput,
  QuizSubmissionRecord,
  Submission,
} from "@/types";
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
export function State({
  error,
  reload,
}: {
  error: string;
  reload: () => void;
}) {
  return error ? (
    <div className="course-load-state">
      <CourseFeedback>{error}</CourseFeedback>
      <Button variant="outline" onClick={reload}>
        Try again
      </Button>
    </div>
  ) : (
    <p role="status" className="course-loading">
      Loading…
    </p>
  );
}
function Title({
  over,
  title,
  description,
}: {
  over: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-title">
      <span className="eyebrow">{over}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function Courses() {
  const r = useData(() => api.courses(), []);
  return (
    <>
      <div className="courses-heading">
        <div>
          <h1>
            My courses <span className="count">{r.data?.length ?? "—"}</span>
          </h1>
          <p>Fall 2026</p>
        </div>
      </div>
      {!r.data ? (
        <State {...r} />
      ) : r.data.length === 0 ? (
        <p className="panel">
          No courses yet. Ask your instructor about enrollment.
        </p>
      ) : (
        <div className="course-grid">
          {r.data.map((c, i) => (
            <Link
              className="course-card"
              state={{ fromAdmin: false }}
              key={c.id}
              to={`/courses/${c.id}`}
            >
              <div className={"course-cover cover-" + i}>
                <BookOpen size={38} />
                <ArrowUpRight size={24} />
              </div>
              <div className="card-body">
                <span className="eyebrow">
                  FALL 2026 <span className="pill">{c.role}</span>
                </span>
                <h2>
                  {c.code} · {c.name}
                </h2>
                <p>{c.description}</p>
                <div className="card-bottom">
                  Enter course <ArrowRight size={17} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
export function Dashboard() {
  const c = useCourse();
  return <CourseDashboard key={c.id} />;
}
function CourseDashboard() {
  const c = useCourse();
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const r = useData(() => api.dashboard(c.id), [c.id]);
  if (!r.data) return <State {...r} />;
  const latest = [...r.data.announcements]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const upcoming = r.data.upcomingAssessments.sort(
    (a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
  return (
    <>
      <div className="dashboard-grid course-overview">
        <section className="panel recent-announcements">
          <h2>Recent announcements</h2>
          {latest.length === 0 && <p>No announcements yet.</p>}
          {latest.map((a) => (
            <article className="list-row full-announcement" key={a.id}>
              {a.author && <span className="eyebrow">{a.author}</span>}
              <h3>{a.title}</h3>
              <p>{a.body}</p>
            </article>
          ))}
          <Link className="see-all" to="announcements">
            See all announcements <ArrowRight size={16} />
          </Link>
        </section>
        <section className="panel upcoming-assessments">
          <h2>Upcoming & past due</h2>
          {upcoming.length === 0 && <p>No assessments scheduled.</p>}
          <div id="upcoming-list">
            {(showAllUpcoming ? upcoming : upcoming.slice(0, 4)).map((a) => (
              <article
                className="assessment-item assessment-compact"
                key={a.kind + a.id}
              >
                <div className="assessment-content">
                  <h3>{a.title}</h3>
                  <DueDate
                    dueAt={a.dueAt}
                    completed={
                      c.role === "student" &&
                      ["submitted", "graded"].includes(a.submissionStatus ?? "")
                    }
                    showStatus={false}
                  />
                  {c.role === "student" && a.submissionStatus && (
                    <span
                      className={`quiz-completion ${["submitted", "graded"].includes(a.submissionStatus) ? "quiz-completed" : "quiz-incomplete"}`}
                    >
                      {["submitted", "graded"].includes(a.submissionStatus)
                        ? "Submitted"
                        : "Not submitted"}
                    </span>
                  )}
                </div>
                <div className="assessment-trailing">
                  <span className={"pill assessment-kind kind-" + a.kind}>
                    {a.kind === "assignment"
                      ? "Assignment"
                      : a.kind === "quiz"
                        ? "Quiz"
                        : "Exam"}
                  </span>
                  {(a.quizId || a.assignmentId || a.kind === "assignment") && (
                    <Link
                      className="assessment-open"
                      aria-label={`Open ${a.kind}: ${a.title}`}
                      to={
                        (a.kind === "quiz" ? "quizzes/" : "assignments/") +
                        (a.quizId || a.assignmentId || "")
                      }
                    >
                      <ArrowRight size={19} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
          {upcoming.length > 4 && (
            <Button
              className="upcoming-toggle"
              variant="outline"
              aria-expanded={showAllUpcoming}
              aria-controls="upcoming-list"
              onClick={() => setShowAllUpcoming((v) => !v)}
            >
              {showAllUpcoming
                ? "Show fewer"
                : `Show all assessments (${upcoming.length})`}
            </Button>
          )}
        </section>
      </div>
    </>
  );
}
export { default as Announcements } from "./Announcements";
export function Quizzes() {
  const c = useCourse();
  const { quizId } = useParams();
  const { user } = useAuth();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const manage = c.role === "instructor" || user?.systemRole === "admin";
  const r = useData(async () => {
    const quizzes = await api.quizzes(c.id);
    return Promise.all(
      quizzes.map(async (quiz) => ({
        ...quiz,
        ownSubmission:
          !manage && !isMock ? await liveQuizzes.mine(c.id, quiz) : null,
      })),
    );
  }, [c.id, manage, quizId, user?.id]);
  if (!r.data) return <State {...r} />;
  if (quizId) {
    const q = r.data.find((x) => x.id === quizId);
    if (!q) return <NotFound />;
    return manage ? (
      <QuizReview key={c.id + q.id} quiz={q} onChanged={r.reload} />
    ) : (
      <QuizTaking key={c.id + q.id} quiz={q} />
    );
  }
  return (
    <>
      <div className="announcement-toolbar course-page-header quiz-page-heading">
        <div>
          <h1>Quizzes</h1>
        </div>
        {manage && !c.readOnly && c.status === "active" && (
          <CreateQuiz onCreated={r.reload} />
        )}
      </div>
      {c.status === "archived" && (
        <p className="notice">Archived course. Quizzes are read-only.</p>
      )}
      {r.data.length === 0 && <p className="panel">No quizzes available.</p>}
      {deleteError && <CourseFeedback>{deleteError}</CourseFeedback>}
      {r.data.map((q) => (
        <div className="panel quiz-card" key={q.id}>
          <Link className="quiz-card-content" to={q.id}>
            <div>
              <h2>{q.title}</h2>
              {manage && !isMock && (
                <VisibilityBadge
                  visible={q.isVisible !== false && q.status !== "draft"}
                  draft={q.status === "draft"}
                />
              )}
              <div className="quiz-card-meta">
                <p>
                  {q.questions.length}{" "}
                  {q.questions.length === 1 ? "question" : "questions"}
                </p>
                {!manage && (
                  <span
                    className={`quiz-completion ${(isMock ? demoQuizReview.mine(c.id, q) : q.ownSubmission) ? "quiz-completed" : "quiz-incomplete"}`}
                  >
                    {(isMock ? demoQuizReview.mine(c.id, q) : q.ownSubmission)
                      ? "Submitted"
                      : "Not submitted"}
                  </span>
                )}
              </div>
              <DueDate
                dueAt={q.dueAt}
                showStatus={false}
                completed={
                  !manage &&
                  Boolean(
                    isMock ? demoQuizReview.mine(c.id, q) : q.ownSubmission,
                  )
                }
              />
            </div>
            {!manage ? (
              <span className="quiz-list-grade" aria-label="Grade">
                {(isMock ? demoQuizReview.mine(c.id, q) : q.ownSubmission)
                  ?.score?.earned ?? "—"}{" "}
                /{" "}
                {q.questions.reduce(
                  (sum, question) => sum + (question.points ?? 1),
                  0,
                )}
              </span>
            ) : (
              <ArrowUpRight />
            )}
          </Link>
          {!isMock && manage && !c.readOnly && c.status === "active" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="delete-action"
              disabled={deleting !== null}
              onClick={async () => {
                if (
                  !(await confirmCourseAction(
                    `Delete “${q.title}”? This cannot be undone. Quizzes with saved drafts or submissions cannot be deleted.`,
                  ))
                )
                  return;
                setDeleting(q.id);
                setDeleteError("");
                try {
                  await liveQuizzes.remove(c.id, q.id);
                  r.reload();
                } catch (error) {
                  setDeleteError((error as Error).message);
                } finally {
                  setDeleting(null);
                }
              }}
            >
              {deleting === q.id ? "Deleting…" : "Delete quiz"}
            </Button>
          )}
        </div>
      ))}
    </>
  );
}
const questionKinds: Record<QuestionKind, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
};

function newQuizOption() {
  return { id: crypto.randomUUID(), text: "", correct: false };
}

function newQuestion() {
  return {
    id: crypto.randomUUID(),
    kind: "single_choice" as QuestionKind,
    points: "1",
    prompt: "",
    options: [newQuizOption(), newQuizOption()],
  };
}

function CreateQuiz({
  onCreated,
  initialQuiz,
}: {
  onCreated: () => void;
  initialQuiz?: Quiz;
}) {
  const c = useCourse();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [questions, setQuestions] = useState(() =>
    initialQuiz
      ? initialQuiz.questions.map((q) => ({
          id: q.id,
          kind: q.kind ?? "single_choice",
          points: String(q.points ?? 1),
          prompt: q.prompt,
          options: q.options.map((text) => ({
            id: crypto.randomUUID(),
            text,
            correct: q.correctOptions?.includes(text) ?? false,
          })),
        }))
      : [newQuestion()],
  );
  const localDue = initialQuiz?.dueAt
    ? new Date(
        Date.parse(initialQuiz.dueAt) -
          new Date(initialQuiz.dueAt).getTimezoneOffset() * 60000,
      ).toISOString()
    : "";
  function updateQuestion(
    id: string,
    changes: Partial<Omit<ReturnType<typeof newQuestion>, "id">>,
  ) {
    setQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, ...changes } : q)),
    );
  }
  const hasShortAnswer = questions.some(
    (question) => question.kind === "short_answer",
  );
  const totalPoints = questions.reduce(
    (total, q) => total + Number(q.points),
    0,
  );
  return (
    <div className="quiz-create">
      <Button
        type="button"
        disabled={busy}
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
      >
        {initialQuiz ? "Edit draft" : "Create quiz"}
      </Button>
      {open && (
        <dialog
          className="quiz-create-dialog"
          aria-labelledby="quiz-editor-title"
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) {
              setOpen(false);
              if (needsRefresh) onCreated();
            }
          }}
        >
          <form
            noValidate
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setMessage("");
              try {
                const dueAt = new Date(
                  `${data.get("dueDate")}T${data.get("dueTime")}`,
                );
                if (!Number.isFinite(dueAt.getTime())) {
                  throw Error("Choose a valid due date and time.");
                }
                const payload: QuizQuestionInput[] = questions.map(
                  (q, index) => {
                    const prompt = q.prompt.trim();
                    const points = Number(q.points);
                    const options =
                      q.kind === "short_answer"
                        ? []
                        : q.options.map((option) => option.text.trim());
                    if (
                      !prompt ||
                      !Number.isSafeInteger(points) ||
                      points < 1
                    ) {
                      throw Error(
                        `Question ${index + 1}: enter a prompt and a positive whole-number point value.`,
                      );
                    }
                    if (
                      q.kind !== "short_answer" &&
                      (options.length < 2 ||
                        options.length > 20 ||
                        options.some((option) => !option) ||
                        new Set(options).size !== options.length)
                    ) {
                      throw Error(
                        `Question ${index + 1}: enter at least two distinct options.`,
                      );
                    }
                    const correctOptions =
                      q.kind === "short_answer"
                        ? undefined
                        : q.options
                            .filter((option) => option.correct)
                            .map((option) => option.text.trim());
                    if (
                      correctOptions &&
                      (!correctOptions.length ||
                        (q.kind === "single_choice" &&
                          correctOptions.length !== 1))
                    ) {
                      throw Error(
                        `Question ${index + 1}: mark ${q.kind === "single_choice" ? "one correct option" : "at least one correct option"}.`,
                      );
                    }
                    return {
                      id: q.id,
                      kind: q.kind,
                      points,
                      prompt,
                      options,
                      correctOptions,
                    };
                  },
                );
                const maxAttempts = Number(data.get("maxAttempts") ?? 1);
                if (
                  !Number.isInteger(maxAttempts) ||
                  maxAttempts < 1 ||
                  maxAttempts > 2147483647
                )
                  throw new Error(
                    "Maximum attempts must be a positive whole number.",
                  );
                const input: Omit<Quiz, "id" | "questions"> & {
                  questions: QuizQuestionInput[];
                } = {
                  title: String(data.get("title") ?? "").trim(),
                  dueAt: dueAt.toISOString(),
                  questions: payload,
                  releaseGrades:
                    hasShortAnswer || data.get("releaseGrades") !== "automatic"
                      ? "manual"
                      : "automatic",
                  maxAttempts,
                };
                if (initialQuiz) {
                  try {
                    await liveQuizzes.updateDraft(c.id, initialQuiz, input);
                  } catch (error) {
                    setNeedsRefresh(true);
                    throw new Error(
                      `Some draft changes may already be saved. Close this editor and reopen the draft before retrying. ${(error as Error).message}`,
                    );
                  }
                } else await api.createQuiz(c.id, input);
                setQuestions([newQuestion()]);
                setOpen(false);
                onCreated();
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 id="quiz-editor-title">
              {initialQuiz ? "Edit quiz draft" : "Create a quiz"}
            </h2>
            {!isMock && (
              <p>
                Save a private draft first. Publish it separately when it is
                ready.
              </p>
            )}
            <p>A quiz can contain just one question.</p>
            {isMock && (
              <p>Demo quizzes and grades are saved in this browser.</p>
            )}
            <label>
              Quiz title
              <input
                name="title"
                required
                maxLength={160}
                defaultValue={initialQuiz?.title}
              />
            </label>
            <div className="quiz-deadline-fields">
              <label>
                Due date
                <input
                  name="dueDate"
                  type="date"
                  required
                  defaultValue={localDue.slice(0, 10)}
                />
              </label>
              <label>
                Due time (local)
                <input
                  name="dueTime"
                  type="time"
                  defaultValue={localDue.slice(11, 16) || "23:59"}
                  required
                />
              </label>
            </div>
            {!isMock && (
              <label>
                Maximum attempts
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={initialQuiz?.maxAttempts ?? 1}
                  required
                />
                <small>
                  Each submission uses one attempt. The latest submitted attempt
                  is used for the displayed grade.
                </small>
              </label>
            )}
            {questions.map((question, index) => (
              <fieldset
                className="quiz-builder-question"
                key={question.id}
                disabled={busy}
              >
                <legend>Question {index + 1}</legend>
                <div className="quiz-question-fields">
                  <label>
                    Question type
                    <select
                      value={question.kind}
                      onChange={(e) =>
                        updateQuestion(question.id, {
                          kind: e.target.value as QuestionKind,
                          options: question.options.map((option) => ({
                            ...option,
                            correct: false,
                          })),
                        })
                      }
                    >
                      {Object.entries(questionKinds).map(([kind, label]) => (
                        <option key={kind} value={kind}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Points
                    <input
                      type="number"
                      min={1}
                      step={1}
                      required
                      value={question.points}
                      onChange={(e) =>
                        updateQuestion(question.id, { points: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Prompt
                  <textarea
                    required
                    value={question.prompt}
                    onChange={(e) =>
                      updateQuestion(question.id, { prompt: e.target.value })
                    }
                  />
                </label>
                {question.kind === "short_answer" && (
                  <p>Manually graded by the instructor.</p>
                )}
                {question.kind !== "short_answer" && (
                  <div
                    className="quiz-option-list"
                    role="group"
                    aria-label={`Answer options for question ${index + 1}`}
                  >
                    <strong>Answer options</strong>
                    <p>
                      {question.kind === "single_choice"
                        ? "Mark one correct option."
                        : "Mark all correct options."}
                    </p>
                    {question.options.map((option, optionIndex) => (
                      <div className="quiz-option-editor" key={option.id}>
                        <label>
                          Option {optionIndex + 1}
                          <input
                            value={option.text}
                            required
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" &&
                                !e.nativeEvent.isComposing
                              )
                                e.preventDefault();
                            }}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                options: question.options.map((item) =>
                                  item.id === option.id
                                    ? { ...item, text: e.target.value }
                                    : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="quiz-correct-option">
                          <input
                            type={
                              question.kind === "single_choice"
                                ? "radio"
                                : "checkbox"
                            }
                            name={`correct-${question.id}`}
                            checked={option.correct}
                            aria-label={`Mark option ${optionIndex + 1} correct for question ${index + 1}`}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              updateQuestion(question.id, {
                                options: question.options.map((item) => ({
                                  ...item,
                                  correct:
                                    item.id === option.id
                                      ? checked
                                      : question.kind === "multiple_choice" &&
                                        item.correct,
                                })),
                              });
                            }}
                          />
                          Correct
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={question.options.length <= 2}
                          aria-label={`Remove option ${optionIndex + 1} from question ${index + 1}`}
                          onClick={() =>
                            updateQuestion(question.id, {
                              options: question.options.filter(
                                (item) => item.id !== option.id,
                              ),
                            })
                          }
                        >
                          <X size={15} aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={question.options.length >= 20}
                      onClick={() =>
                        updateQuestion(question.id, {
                          options: [...question.options, newQuizOption()],
                        })
                      }
                    >
                      <Plus size={15} aria-hidden="true" /> Add option
                    </Button>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={questions.length === 1}
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() =>
                    setQuestions((current) =>
                      current.filter((q) => q.id !== question.id),
                    )
                  }
                >
                  Remove question
                </Button>
              </fieldset>
            ))}
            <div className="quiz-builder-settings">
              <Button
                type="button"
                variant="outline"
                className="quiz-add-question"
                disabled={busy || questions.length >= 100}
                onClick={() => {
                  const question = newQuestion();
                  setQuestions((current) => [...current, question]);
                }}
              >
                <Plus size={16} /> Add question
              </Button>
              <strong>{totalPoints} total points</strong>
            </div>
            {
              <label>
                Release grades
                {hasShortAnswer ? (
                  <span>Instructor publishes after grading short answers.</span>
                ) : (
                  <select
                    className="quiz-release-select"
                    name="releaseGrades"
                    defaultValue={initialQuiz?.releaseGrades ?? "manual"}
                  >
                    <option value="manual">
                      Instructor publishes manually
                    </option>
                    <option value="automatic">
                      Show score immediately after submission
                    </option>
                  </select>
                )}
              </label>
            }
            {message && <CourseFeedback>{message}</CourseFeedback>}
            <div className="actions">
              <Button disabled={busy || needsRefresh}>
                {busy ? "Saving…" : isMock ? "Create quiz" : "Save draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  if (needsRefresh) onCreated();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}

function AnswerInput({
  question,
  answer,
  onChange,
}: {
  question: Question;
  answer: Answers[string] | undefined;
  onChange: (answer: Answers[string]) => void;
}) {
  if (question.kind === "short_answer") {
    return (
      <label>
        Your answer
        <textarea
          required
          value={typeof answer === "string" ? answer : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }
  const multiple = question.kind === "multiple_choice";
  const selected = Array.isArray(answer) ? answer : [];
  return question.options.map((option) => (
    <label key={option} className="option">
      <input
        type={multiple ? "checkbox" : "radio"}
        name={question.id}
        value={option}
        required={!multiple}
        checked={multiple ? selected.includes(option) : answer === option}
        onChange={(e) =>
          onChange(
            multiple
              ? e.target.checked
                ? [...selected, option]
                : selected.filter((value) => value !== option)
              : option,
          )
        }
      />
      {option}
    </label>
  ));
}
function QuizReview(props: { quiz: Quiz; onChanged: () => void }) {
  if (!isMock && props.quiz.status === "draft")
    return <QuizDraftReview {...props} />;
  return <PublishedQuizReview {...props} />;
}
function QuizDraftReview({
  quiz,
  onChanged,
}: {
  quiz: Quiz;
  onChanged: () => void;
}) {
  const course = useCourse();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="quiz-workspace">
      <div className="announcement-toolbar course-page-header">
        <h1>{quiz.title}</h1>
        {!course.readOnly && course.status === "active" && (
          <div className="actions">
            <CreateQuiz initialQuiz={quiz} onCreated={onChanged} />
            <Button
              disabled={busy || !quiz.questions.length}
              onClick={async () => {
                if (
                  !(await confirmCourseAction(
                    "Publish this quiz? Students will be able to see and attempt it.",
                  ))
                )
                  return;
                setBusy(true);
                setError("");
                try {
                  await liveQuizzes.publishQuiz(course.id, quiz.id);
                  onChanged();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Publishing…" : "Publish quiz"}
            </Button>
          </div>
        )}
      </div>
      <p className="notice">Draft · not visible to students</p>
      <p>Maximum attempts: {quiz.maxAttempts ?? 1}</p>
      <DueDate dueAt={quiz.dueAt} />
      <QuizPreview quiz={quiz} />
      {error && <CourseFeedback>{error}</CourseFeedback>}
    </section>
  );
}
function PublishedQuizReview({
  quiz,
  onChanged,
}: {
  quiz: Quiz;
  onChanged: () => void;
}) {
  const course = useCourse();
  const records = useData(
    async () =>
      isMock
        ? demoQuizReview.list(course.id, quiz.id)
        : liveQuizzes.submissions(course.id, quiz),
    [course.id, quiz.id],
  );
  const [publishMessage, setPublishMessage] = useState("");
  const [publishFailed, setPublishFailed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(quiz.showResults === true);
  const hasUnpublished =
    !published && records.data?.some((record) => !record.published);
  return (
    <section className="quiz-workspace">
      <Title
        over=""
        title={quiz.title}
        description={
          !isMock
            ? published
              ? "Grades are available to students."
              : "Grades are released when you publish them."
            : quiz.releaseGrades === "automatic"
              ? "Grades are released automatically."
              : "Grades are released when you publish them."
        }
      />
      {!course.readOnly &&
        (isMock ? quiz.releaseGrades !== "automatic" : !quiz.showResults) && (
          <div className="mb-4">
            <Button
              disabled={
                !hasUnpublished ||
                publishing ||
                course.readOnly ||
                course.status !== "active"
              }
              onClick={async () => {
                setPublishing(true);
                try {
                  if (isMock) demoQuizReview.publish(course.id, quiz.id);
                  else await liveQuizzes.publish(course.id, quiz);
                  setPublished(true);
                  setPublishFailed(false);
                  setPublishMessage("Grades published.");
                  records.reload();
                } catch (error) {
                  setPublishFailed(true);
                  setPublishMessage((error as Error).message);
                } finally {
                  setPublishing(false);
                }
              }}
            >
              {publishing
                ? "Publishing…"
                : records.data?.length && !hasUnpublished
                  ? "Grades published"
                  : "Publish grades"}
            </Button>
            {publishMessage && (
              <CourseFeedback tone={publishFailed ? "error" : "success"}>
                {publishMessage}
              </CourseFeedback>
            )}
          </div>
        )}
      {!isMock && <QuizPreview quiz={quiz} />}
      <h2>Student submissions {records.data && `(${records.data.length})`}</h2>
      {!records.data ? (
        <State {...records} />
      ) : records.data.length === 0 ? (
        <p>No submissions yet.</p>
      ) : (
        records.data.map((record) => (
          <SubmissionReview
            key={record.id}
            quiz={quiz}
            record={{
              ...record,
              published:
                (published || record.published) && record.score !== undefined,
            }}
            onSave={records.reload}
          />
        ))
      )}
    </section>
  );
}

function SubmissionReview({
  quiz,
  record,
  onSave,
}: {
  quiz: Quiz;
  record: QuizSubmissionRecord;
  onSave: () => void;
}) {
  const course = useCourse();
  const [error, setError] = useState("");
  const shortAnswers = quiz.questions.filter(
    (question) => question.kind === "short_answer",
  );
  const hasSavedMarks =
    shortAnswers.length === 0 ||
    shortAnswers.some((question) => record.marks[question.id] !== undefined);
  const [editing, setEditing] = useState(!hasSavedMarks && !record.published);
  const canEdit =
    !record.published && !course.readOnly && course.status === "active";
  const [saving, setSaving] = useState(false);
  async function save(data: FormData) {
    if (saving || !editing || !canEdit) return;
    setSaving(true);
    setError("");
    try {
      const marks = readQuestionMarks(quiz.questions, data);
      const feedback = String(data.get("feedback") ?? "").trim();
      if (isMock)
        demoQuizReview.save(course.id, quiz.id, record.id, marks, feedback);
      else
        await liveQuizzes.grade(
          course.id,
          quiz,
          record.id,
          { ...record.marks, ...marks },
          feedback,
        );
      setEditing(false);
      onSave();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <details className="panel quiz-submission">
      <summary>
        {record.studentName} · {date(record.submittedAt)} ·{" "}
        {record.published ? "Published" : "Unpublished"}
      </summary>
      <form
        noValidate
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving && editing && canEdit)
            void save(new FormData(event.currentTarget));
        }}
      >
        {quiz.questions.map((question, index) => {
          const answer = record.answers[question.id];
          return (
            <div key={question.id}>
              <h3>
                {index + 1}. {question.prompt}
              </h3>
              <p className="quiz-submitted-answer">
                {Array.isArray(answer) ? answer.join(", ") : answer}
              </p>
              {question.kind === "short_answer" && editing && canEdit ? (
                <label>
                  Score for question {index + 1} (max {question.points ?? 1})
                  <input
                    name={question.id}
                    type="number"
                    min={0}
                    max={question.points ?? 1}
                    step="any"
                    defaultValue={record.marks[question.id]}
                    disabled={
                      saving || course.readOnly || course.status !== "active"
                    }
                  />
                </label>
              ) : (
                <p>
                  Score: {record.marks[question.id] ?? "Pending"} /{" "}
                  {question.points ?? 1}
                </p>
              )}
            </div>
          );
        })}
        {editing && canEdit ? (
          <>
            <label>
              Feedback
              <textarea
                name="feedback"
                defaultValue={record.feedback}
                disabled={saving}
              />
            </label>
            <div className="actions quiz-actions">
              <Button variant="outline" disabled={saving}>
                {saving ? "Saving…" : "Save grades and feedback"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h3>Feedback</h3>
              <p className="quiz-submitted-answer">
                {record.feedback || "No feedback saved."}
              </p>
            </div>
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError("");
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            )}
          </>
        )}
        {error && <CourseFeedback>{error}</CourseFeedback>}
      </form>
    </details>
  );
}
function QuizTaking({ quiz }: { quiz: Quiz }) {
  return isMock ? (
    <MockQuizTaking quiz={quiz} />
  ) : (
    <LiveQuizTaking quiz={quiz} />
  );
}
function LiveQuizTaking({ quiz }: { quiz: Quiz }) {
  const course = useCourse();
  const [composing, setComposing] = useState(false);
  const result = useData(
    () => liveQuizzes.attempts(course.id, quiz),
    [course.id, quiz.id],
  );
  if (!result.data) return <State {...result} />;
  const completed = result.data.filter((row) => row.attemptState !== "draft");
  const draft = result.data.find((row) => row.attemptState === "draft");
  const max = quiz.maxAttempts ?? 1;
  const open =
    !course.readOnly &&
    course.status === "active" &&
    quiz.status === "published" &&
    (!quiz.opensAt || Date.parse(quiz.opensAt) <= Date.now()) &&
    (!quiz.dueAt || Date.parse(quiz.dueAt) > Date.now());
  const canAttempt = open && completed.length < max;
  if (canAttempt && (composing || completed.length === 0))
    return (
      <>
        <p className="notice">
          Attempt {completed.length + 1} of {max}
        </p>
        <QuizForm
          key={completed.length}
          quiz={quiz}
          initial={draft?.answers ?? {}}
          onFinished={() => {
            setComposing(false);
            result.reload();
          }}
        />
      </>
    );
  return (
    <section className="quiz-workspace">
      <h1>{quiz.title}</h1>
      <p>
        Attempts used: {completed.length} / {max}
      </p>
      <p>The latest submitted attempt is used for your displayed grade.</p>
      {completed.length > 0 && (
        <QuizResult quiz={quiz} submission={completed[0]} embedded />
      )}
      {canAttempt ? (
        <Button onClick={() => setComposing(true)}>
          {draft ? "Continue saved attempt" : "Start another attempt"}
        </Button>
      ) : (
        <p>
          {!open
            ? "This quiz is not open for submissions."
            : "You have used all available attempts."}
        </p>
      )}
      <h2 className="quiz-history-title">Attempt history</h2>
      {!completed.length ? (
        <p>No submitted attempts yet.</p>
      ) : (
        completed.map((row) => (
          <details className="panel" key={row.id}>
            <summary>
              Attempt {row.attemptNumber} · {date(row.submittedAt)} ·{" "}
              {row.score
                ? `${row.score.earned} / ${row.score.possible}`
                : "Grade not released"}
            </summary>
            <p className="quiz-submitted-answer">
              {row.score
                ? row.feedback || "No written feedback is available yet."
                : "Waiting for your instructor to publish grades."}
            </p>
          </details>
        ))
      )}
    </section>
  );
}
function MockQuizTaking({ quiz }: { quiz: Quiz }) {
  const c = useCourse();
  const r = useData(async () => {
    const submission = isMock
      ? demoQuizReview.mine(c.id, quiz)
      : await liveQuizzes.mine(c.id, quiz);
    return submission
      ? { submission }
      : { submission: null, draft: await api.draft(c.id, quiz.id) };
  }, [c.id, quiz.id]);
  if (!r.data) return <State {...r} />;
  if (r.data.submission)
    return <QuizResult quiz={quiz} submission={r.data.submission} />;
  if (
    c.readOnly ||
    c.status !== "active" ||
    quiz.status === "closed" ||
    (quiz.opensAt && Date.parse(quiz.opensAt) > Date.now()) ||
    (quiz.dueAt && Date.parse(quiz.dueAt) < Date.now())
  )
    return (
      <div className="panel">
        <h2>{quiz.title}</h2>
        <p>This quiz is not open for submissions.</p>
      </div>
    );
  return <QuizForm quiz={quiz} initial={r.data.draft ?? {}} />;
}
function QuizResult({
  quiz,
  submission,
  embedded = false,
}: {
  quiz: Quiz;
  submission: Submission;
  embedded?: boolean;
}) {
  const course = useCourse();
  return (
    <section className="quiz-workspace">
      {!embedded && (
        <Title over="" title={quiz.title} description="Quiz submitted" />
      )}
      <div className="panel">
        <h2>
          {submission.score ? "Grade and feedback" : "Waiting for grades"}
        </h2>
        <p>
          Grade: {submission.score?.earned ?? "—"} /{" "}
          {quiz.questions.reduce((sum, q) => sum + (q.points ?? 1), 0)}
        </p>
        <p className="quiz-submitted-answer">
          {submission.score
            ? submission.feedback || "No written feedback is available yet."
            : "Your quiz has been submitted. Your grade and feedback will appear here when your instructor publishes them."}
        </p>
        <Button asChild variant="outline">
          <Link to={`/courses/${course.id}/quizzes`}>Back to quizzes</Link>
        </Button>
      </div>
    </section>
  );
}
function QuizForm({
  quiz,
  initial,
  onFinished,
}: {
  quiz: Quiz;
  initial: Answers;
  onFinished?: () => void;
}) {
  const c = useCourse();
  const [answers, setAnswers] = useState(initial);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success" | "info">(
    "info",
  );
  const [done, setDone] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [viewResult, setViewResult] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(submit: boolean) {
    if (busy || done) return;
    setBusy(true);
    setMessage("");
    setMessageTone("info");
    try {
      if (submit) {
        const s = await api.submit(c.id, quiz.id, answers);
        setDone(true);
        setSubmitted(s);
      } else {
        await api.saveDraft(c.id, quiz.id, answers);
        setMessageTone("success");
        setMessage("Draft saved. You can leave and return to this quiz.");
      }
    } catch (e) {
      setMessageTone("error");
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (submitted) {
    if (viewResult) return <QuizResult quiz={quiz} submission={submitted} />;
    return (
      <section className="quiz-workspace">
        <Title over="" title={quiz.title} description="Quiz submitted" />
        <dialog
          className="quiz-success-dialog"
          aria-labelledby="quiz-success-title"
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={() => (onFinished ? onFinished() : setViewResult(true))}
          onClose={() => (onFinished ? onFinished() : setViewResult(true))}
        >
          <div className="stack">
            <h2 id="quiz-success-title">Submitted successfully</h2>
            <p>
              {submitted.score
                ? "Your answers have been saved."
                : "Your answers have been saved. Please wait for your instructor to publish your grade and feedback."}
            </p>
            {submitted.score && (
              <div className="quiz-success-grade" aria-label="Your grade">
                <span>Your grade</span>
                <strong>
                  {submitted.score.earned} / {submitted.score.possible}
                </strong>
              </div>
            )}
            <div className="actions quiz-success-actions">
              <Button asChild>
                <Link to={`/courses/${c.id}/quizzes`}>Done</Link>
              </Button>
            </div>
          </div>
        </dialog>
      </section>
    );
  }
  return (
    <section className="quiz-workspace">
      <Title
        over=""
        title={quiz.title}
        description={`${quiz.questions.length} ${quiz.questions.length === 1 ? "question" : "questions"} · ${quiz.questions.reduce((total, q) => total + (q.points ?? 1), 0)} points`}
      />
      <div className="quiz-due">
        <DueDate dueAt={quiz.dueAt} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void act(true);
        }}
      >
        {quiz.questions.map((q, i) => (
          <fieldset
            disabled={done || busy}
            className="panel question"
            key={q.id}
            aria-labelledby={`quiz-question-${q.id}`}
          >
            <h2 className="quiz-question-heading" id={`quiz-question-${q.id}`}>
              {i + 1}. {q.prompt}
            </h2>
            <p className="quiz-question-meta">
              {questionKinds[q.kind ?? "single_choice"]} · {q.points ?? 1}{" "}
              {(q.points ?? 1) === 1 ? "point" : "points"}
            </p>
            <AnswerInput
              question={q}
              answer={answers[q.id]}
              onChange={(answer) =>
                setAnswers((current) => ({ ...current, [q.id]: answer }))
              }
            />
          </fieldset>
        ))}
        <div className="actions quiz-actions">
          <Button
            type="button"
            variant="outline"
            disabled={done || busy}
            onClick={() => void act(false)}
          >
            Save draft
          </Button>
          <Button disabled={done || busy}>
            {done ? "Submitted" : "Submit answers"}
          </Button>
        </div>
        <CourseFeedback tone={messageTone}>{message}</CourseFeedback>
      </form>
    </section>
  );
}
export function Resources() {
  const course = useCourse();
  return <CourseResources key={course.id} />;
}

function CourseResources() {
  const c = useCourse();
  const { user } = useAuth();
  const canUpload =
    !c.readOnly &&
    c.status === "active" &&
    (c.role !== null || user?.systemRole === "admin");
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success" | "info">(
    "info",
  );
  const [busy, setBusy] = useState(false);
  const uploadDialog = useRef<HTMLDialogElement>(null);
  const [uploadError, setUploadError] = useState("");
  const resourceType =
    c.role === "student" ? "student_note" : "instructor_material";
  const r = useData(async () => {
    if (!search) {
      return (await api.resources(c.id)).map((resource) => ({
        resource,
        matches: [],
      }));
    }
    const [resources, pdfResults] = await Promise.all([
      api.resources(c.id),
      isMock ? api.searchResources(c.id, search) : Promise.resolve([]),
    ]);
    const results = new Map(
      pdfResults.map((result) => [result.resource.id, result]),
    );
    const normalize = (value: string) => value.normalize("NFKC").toLowerCase();
    const term = normalize(search);
    for (const resource of resources) {
      const matchesName = [resource.name, resource.demoFile?.name].some(
        (name) => name && normalize(name).includes(term),
      );
      if (matchesName && !results.has(resource.id)) {
        results.set(resource.id, { resource, matches: [] });
      }
    }
    return [...results.values()];
  }, [c.id, search]);
  const publishedAt = (value?: string) => {
    const timestamp = Date.parse(value ?? "");
    return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
  };
  const rows = [...(r.data ?? [])].sort(
    (a, b) =>
      publishedAt(b.resource.createdAt) - publishedAt(a.resource.createdAt) ||
      0,
  );
  return (
    <>
      <div className="announcement-toolbar course-page-header">
        <h1>Resources</h1>
        {!c.readOnly && (
          <Button
            type="button"
            aria-haspopup="dialog"
            disabled={!canUpload}
            onClick={() => {
              setMessage("");
              setMessageTone("info");
              setUploadError("");
              uploadDialog.current?.showModal();
            }}
          >
            Upload resource
          </Button>
        )}
      </div>
      <form
        className="resource-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <div className="search resource-search">
          <Search size={18} aria-hidden="true" />
          <input
            ref={searchInput}
            placeholder={
              isMock
                ? "Search file names or PDF text…"
                : "Search resource titles…"
            }
            aria-label={
              isMock
                ? "Search file names or PDF text"
                : "Search resource titles"
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setSearch("");
            }}
          />
          {(query || search) && (
            <button
              className="resource-search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                setSearch("");
                searchInput.current?.focus();
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
        <Button type="submit">Search</Button>
      </form>
      {isMock && (
        <p className="notice resource-notice">
          Search uploaded files by title or filename. To try PDF text search,
          use “authentication” or “API” in the sample PDFs.
        </p>
      )}
      {!isMock && (
        <p className="notice resource-notice">
          PDF uploads up to 10 MB. Search currently matches resource titles.
        </p>
      )}
      {c.status === "archived" && (
        <p className="notice">Archived course. Resources are read-only.</p>
      )}
      <dialog
        className="resource-upload-dialog"
        ref={uploadDialog}
        aria-labelledby="resource-upload-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        onClose={() => uploadDialog.current?.querySelector("form")?.reset()}
      >
        <form
          className="stack resource-upload-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = e.currentTarget;
            const data = new FormData(form);
            const file = data.get("file");
            if (!(file instanceof File) || !file.size) {
              setUploadError("Choose a file.");
              return;
            }
            setBusy(true);
            setUploadError("");
            try {
              if (!canUpload) throw new Error("This course is read-only.");
              if (isMock) validateResourceFile(file, c.role);
              else validateBackendResourceFile(file);
              const title = String(data.get("title") ?? "").trim();
              if (!title) throw new Error("Enter a resource title.");
              await api.upload(c.id, {
                file,
                title,
                resourceType,
                visibility: "visible",
              });
              form.reset();
              uploadDialog.current?.close();
              setQuery("");
              setSearch("");
              r.reload();
              setMessageTone("success");
              setMessage(
                isMock
                  ? "Demo resource added to this session."
                  : "Resource uploaded successfully.",
              );
            } catch (error) {
              setUploadError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id="resource-upload-title">
            {c.role === "student" ? "Share a note" : "Upload course material"}
          </h2>
          <label>
            Title
            <input name="title" required maxLength={160} />
          </label>
          <label>
            {!isMock
              ? "File (PDF · up to 10 MB)"
              : c.role === "student"
                ? "File (PDF or Word · up to 10 MB)"
                : "File (any format · up to 10 MB)"}
            <input
              name="file"
              type="file"
              accept={
                !isMock
                  ? ".pdf,application/pdf"
                  : c.role === "student"
                    ? studentResourceAccept
                    : undefined
              }
              required
            />
          </label>
          {uploadError && <CourseFeedback>{uploadError}</CourseFeedback>}
          <div className="actions resource-dialog-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => uploadDialog.current?.close()}
            >
              Cancel
            </Button>
            <Button disabled={busy}>
              {busy
                ? "Uploading…"
                : c.role === "student"
                  ? "Share note"
                  : "Upload file"}
            </Button>
          </div>
        </form>
      </dialog>
      {message && <CourseFeedback tone={messageTone}>{message}</CourseFeedback>}
      {search && <h2>Search results for “{search}”</h2>}
      {!r.data ? (
        <State {...r} />
      ) : r.data.length === 0 ? (
        <p className="panel">
          {search
            ? isMock
              ? "No files or PDF text matched your search."
              : "No resource titles matched your search."
            : "No resources yet."}
        </p>
      ) : (
        <ul className="resource-list">
          {rows.map(({ resource, matches }) => (
            <li className="resource-row" key={resource.id}>
              <div className="resource-row-main">
                <div className="resource-row-info">
                  <div className="resource-row-heading">
                    <FileText
                      size={20}
                      className="file-icon"
                      aria-hidden="true"
                    />
                    <h3>{resource.name}</h3>
                    <span className="pill">
                      {resource.status === "listed"
                        ? "Added"
                        : resource.status === "ready"
                          ? "Ready"
                          : resource.status === "failed"
                            ? "Processing failed"
                            : resource.status === "pending"
                              ? "Queued"
                              : "Processing"}
                    </span>
                  </div>
                  <div className="resource-row-meta">
                    {resource.resourceType && (
                      <span>
                        {resource.resourceType === "student_note"
                          ? "Shared student note"
                          : resource.resourceType === "instructor_material"
                            ? "Course material"
                            : "Assignment file"}
                      </span>
                    )}
                    {resource.createdAt && (
                      <span>Added {date(resource.createdAt)}</span>
                    )}
                    {resource.description && (
                      <span>{resource.description}</span>
                    )}
                  </div>
                </div>
                {!isMock && (
                  <div className="actions resource-row-actions">
                    {(["preview", "download"] as const).map((action) => (
                      <Button
                        key={action}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={fileBusy !== null}
                        onClick={async () => {
                          const key = resource.id + action;
                          const preview =
                            action === "preview"
                              ? window.open("about:blank", "_blank")
                              : null;
                          if (action === "preview" && !preview) {
                            setMessage(
                              "Allow pop-ups for this site to open a PDF preview.",
                            );
                            return;
                          }
                          if (preview) preview.opener = null;
                          setFileBusy(key);
                          setMessage("");
                          setMessageTone("info");
                          try {
                            const { url } = await resourceFileUrl(
                              c.id,
                              resource.id,
                              action,
                            );
                            if (preview) preview.location.replace(url);
                            else {
                              const link = document.createElement("a");
                              link.href = url;
                              link.rel = "noopener noreferrer";
                              document.body.append(link);
                              link.click();
                              link.remove();
                            }
                          } catch (error) {
                            preview?.close();
                            setMessageTone("error");
                            setMessage((error as Error).message);
                          } finally {
                            setFileBusy(null);
                          }
                        }}
                      >
                        {fileBusy === resource.id + action
                          ? "Loading…"
                          : action === "preview"
                            ? "Open PDF"
                            : "Download"}
                      </Button>
                    ))}
                    {!c.readOnly &&
                      c.status === "active" &&
                      (c.role === "instructor" ||
                        user?.systemRole === "admin" ||
                        resource.ownerId === user?.id) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="delete-action"
                          disabled={fileBusy !== null}
                          onClick={async () => {
                            if (
                              !(await confirmCourseAction(
                                `Delete “${resource.name}”? The resource and its stored file will be removed. This cannot be undone.`,
                              ))
                            )
                              return;
                            setFileBusy(resource.id + "delete");
                            setMessage("");
                            setMessageTone("info");
                            try {
                              await deleteResource(c.id, resource.id);
                              setMessageTone("success");
                              setMessage("Resource deleted.");
                            } catch (error) {
                              setMessageTone("error");
                              setMessage((error as Error).message);
                            } finally {
                              setFileBusy(null);
                              r.reload();
                            }
                          }}
                        >
                          {fileBusy === resource.id + "delete"
                            ? "Deleting…"
                            : "Delete"}
                        </Button>
                      )}
                  </div>
                )}
                {resource.demoFile && (
                  <div className="actions resource-row-actions">
                    {resource.demoFile.previewable && (
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={resource.demoFile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open PDF
                        </a>
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={resource.demoFile.url}
                        download={resource.demoFile.name}
                      >
                        Download
                      </a>
                    </Button>
                  </div>
                )}
              </div>
              {matches.map(({ page, snippet }, index) => (
                <div className="mt-4 border-t border-border pt-3" key={index}>
                  <strong className="text-sm text-primary">Page {page}</strong>
                  <p>{snippet}</p>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
export function NotFound() {
  return (
    <div className="panel">
      <h1>Page not found</h1>
      <Link to="/courses">Return to my courses →</Link>
    </div>
  );
}
