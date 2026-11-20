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
import { api, isMock, resourceFileUrl } from "@/services/api";
import { useAuth } from "@/App";
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
  return (
    <div className="panel" role={error ? "alert" : "status"}>
      {error ? (
        <>
          <h2>Something needs attention</h2>
          <p>{error}</p>
          <Button onClick={reload}>Try again</Button>
        </>
      ) : (
        "Loading your workspace…"
      )}
    </div>
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
            <Link className="course-card" key={c.id} to={`/courses/${c.id}`}>
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
      {c.role === "instructor" && (
        <nav className="instructor-actions" aria-label="Instructor tools">
          <Button asChild>
            <Link to="announcements">Publish announcement</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="quizzes">Create quiz</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="resources">Upload resource</Link>
          </Button>
        </nav>
      )}
      <div className="dashboard-grid course-overview">
        <section className="panel recent-announcements">
          <h2>Recent announcements</h2>
          <p className="list-summary">Latest course updates</p>
          {latest.length === 0 && <p>No announcements yet.</p>}
          {latest.map((a) => (
            <article className="list-row full-announcement" key={a.id}>
              <span className="eyebrow">{a.author}</span>
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
          <p className="assessment-intro">Assignments, quizzes & exams</p>
          {upcoming.length === 0 && <p>No assessments scheduled.</p>}
          <p className="list-summary" aria-live="polite">
            Showing{" "}
            {showAllUpcoming ? upcoming.length : Math.min(4, upcoming.length)}{" "}
            of {upcoming.length} assessments
          </p>
          <div id="upcoming-list">
            {(showAllUpcoming ? upcoming : upcoming.slice(0, 4)).map((a) => (
              <article className="assessment-item" key={a.id}>
                <span className={"pill assessment-kind kind-" + a.kind}>
                  {a.kind}
                </span>
                <h3>{a.title}</h3>
                <DueDate dueAt={a.dueAt} />
                <p>{a.description}</p>
                {a.kind === "quiz" && a.quizId && (
                  <Link className="text-link" to={"quizzes/" + a.quizId}>
                    Open quiz →
                  </Link>
                )}
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
  const r = useData(() => api.quizzes(c.id), [c.id]);
  if (!r.data) return <State {...r} />;
  if (quizId) {
    const q = r.data.find((x) => x.id === quizId);
    if (!q) return <NotFound />;
    return isMock && c.role === "instructor" ? (
      <QuizReview key={c.id + q.id} quiz={q} />
    ) : (
      <QuizTaking key={c.id + q.id} quiz={q} />
    );
  }
  return (
    <>
      <Title
        over=""
        title="Quizzes"
        description="Check your understanding and make your next step count."
      />
      {c.role === "instructor" && <CreateQuiz onCreated={r.reload} />}
      {r.data.length === 0 && <p className="panel">No quizzes available.</p>}
      {r.data.map((q) => (
        <Link className="panel quiz-card" key={q.id} to={q.id}>
          <div>
            <span className="eyebrow">KNOWLEDGE CHECK</span>
            <h2>{q.title}</h2>
            <p>{q.questions.length} questions</p>
            <DueDate dueAt={q.dueAt} />
          </div>
          {isMock && c.role === "student" ? (
            <span className="quiz-list-grade" aria-label="Grade">
              {demoQuizReview.mine(c.id, q)?.score?.earned ?? "—"} /{" "}
              {q.questions.reduce(
                (sum, question) => sum + (question.points ?? 1),
                0,
              )}
            </span>
          ) : (
            <ArrowUpRight />
          )}
        </Link>
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

function CreateQuiz({ onCreated }: { onCreated: () => void }) {
  const c = useCourse();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [questions, setQuestions] = useState(() => [newQuestion()]);
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
        aria-expanded={open}
      >
        <Plus size={16} /> {open ? "Close quiz form" : "Create quiz"}
      </Button>
      {open && (
        <form
          className="panel stack"
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
              const payload: QuizQuestionInput[] = questions.map((q, index) => {
                const prompt = q.prompt.trim();
                const points = Number(q.points);
                const options =
                  q.kind === "short_answer"
                    ? []
                    : q.options.map((option) => option.text.trim());
                if (!prompt || !Number.isSafeInteger(points) || points < 1) {
                  throw Error(
                    `Question ${index + 1}: enter a prompt and a positive whole-number point value.`,
                  );
                }
                if (
                  q.kind !== "short_answer" &&
                  (options.length < 2 ||
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
                    (q.kind === "single_choice" && correctOptions.length !== 1))
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
              });
              await api.createQuiz(c.id, {
                title: String(data.get("title")).trim(),
                dueAt: dueAt.toISOString(),
                questions: payload,
                releaseGrades:
                  hasShortAnswer || data.get("releaseGrades") !== "automatic"
                    ? "manual"
                    : "automatic",
              });
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
          <h2>Create a quiz</h2>
          <p>A quiz can contain just one question.</p>
          {isMock && <p>Demo quizzes and grades are saved in this browser.</p>}
          <label>
            Quiz title
            <input name="title" required maxLength={160} />
          </label>
          <div className="quiz-deadline-fields">
            <label>
              Due date
              <input name="dueDate" type="date" required />
            </label>
            <label>
              Due time (local)
              <input name="dueTime" type="time" defaultValue="23:59" required />
            </label>
          </div>
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
                            if (e.key === "Enter" && !e.nativeEvent.isComposing)
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
          {isMock && (
            <label>
              Release grades
              {hasShortAnswer ? (
                <span>Instructor publishes after grading short answers.</span>
              ) : (
                <select
                  className="quiz-release-select"
                  name="releaseGrades"
                  defaultValue="manual"
                >
                  <option value="manual">Instructor publishes manually</option>
                  <option value="automatic">
                    Show score immediately after submission
                  </option>
                </select>
              )}
            </label>
          )}
          <div className="quiz-builder-settings">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                const question = newQuestion();
                setQuestions((current) => [...current, question]);
              }}
            >
              <Plus size={16} /> Add question
            </Button>
            <strong>{totalPoints} total points</strong>
          </div>
          {message && <p role="alert">{message}</p>}
          <Button disabled={busy}>{busy ? "Creating…" : "Create quiz"}</Button>
        </form>
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
function QuizReview({ quiz }: { quiz: Quiz }) {
  const course = useCourse();
  const records = useData(
    async () => demoQuizReview.list(course.id, quiz.id),
    [course.id, quiz.id],
  );
  const [publishMessage, setPublishMessage] = useState("");
  const hasUnpublished = records.data?.some((record) => !record.published);
  return (
    <section className="quiz-workspace">
      <Title
        over=""
        title={quiz.title}
        description={
          quiz.releaseGrades === "automatic"
            ? "Grades are released automatically."
            : "Grades are released when you publish them."
        }
      />
      {quiz.releaseGrades !== "automatic" && (
        <div className="mb-4">
          <Button
            disabled={!hasUnpublished}
            onClick={() => {
              try {
                demoQuizReview.publish(course.id, quiz.id);
                setPublishMessage("Grades published.");
                records.reload();
              } catch (error) {
                setPublishMessage((error as Error).message);
              }
            }}
          >
            {records.data?.length && !hasUnpublished
              ? "Grades published"
              : "Publish grades"}
          </Button>
          {publishMessage && <p role="status">{publishMessage}</p>}
        </div>
      )}
      <h2>Student submissions {records.data && `(${records.data.length})`}</h2>
      {!records.data ? (
        <State {...records} />
      ) : records.data.length === 0 ? (
        <p>No submissions yet. Sign in as Jamie to submit this quiz.</p>
      ) : (
        records.data.map((record) => (
          <SubmissionReview
            key={record.id}
            quiz={quiz}
            record={record}
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
  function save(data: FormData) {
    const marks: Record<string, number> = {};
    for (const question of quiz.questions) {
      const value = data.get(question.id);
      if (typeof value === "string" && value.trim())
        marks[question.id] = Number(value);
    }
    try {
      demoQuizReview.save(
        course.id,
        quiz.id,
        record.id,
        marks,
        String(data.get("feedback") ?? "").trim(),
      );
      onSave();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <details className="panel quiz-submission">
      <summary>
        {record.studentName} · {date(record.submittedAt)} ·{" "}
        {record.published ? "Published" : "Unpublished"}
      </summary>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save(new FormData(event.currentTarget));
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
              {question.kind === "short_answer" && !record.published ? (
                <label>
                  Score for question {index + 1} (max {question.points ?? 1})
                  <input
                    name={question.id}
                    type="number"
                    min={0}
                    max={question.points ?? 1}
                    step="any"
                    defaultValue={record.marks[question.id]}
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
        {record.published ? (
          record.feedback && (
            <p className="quiz-submitted-answer">{record.feedback}</p>
          )
        ) : (
          <>
            <label>
              Feedback
              <textarea name="feedback" defaultValue={record.feedback} />
            </label>
            <div className="actions quiz-actions">
              <Button variant="outline">Save grades and feedback</Button>
            </div>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
function QuizTaking({ quiz }: { quiz: Quiz }) {
  const c = useCourse();
  const r = useData(async () => {
    const submission = isMock ? demoQuizReview.mine(c.id, quiz) : null;
    return submission
      ? { submission }
      : { submission: null, draft: await api.draft(c.id, quiz.id) };
  }, [c.id, quiz.id]);
  if (!r.data) return <State {...r} />;
  if (r.data.submission)
    return (
      <section className="quiz-workspace">
        <Title over="" title={quiz.title} description="Quiz submitted" />
        <div className="panel">
          <h2>Feedback</h2>
          <p className="quiz-submitted-answer">
            {r.data.submission.score
              ? r.data.submission.feedback ||
                "Your instructor did not leave written feedback."
              : "Feedback will appear here when your instructor publishes grades."}
          </p>
        </div>
      </section>
    );
  return <QuizForm quiz={quiz} initial={r.data.draft ?? {}} />;
}
function QuizForm({ quiz, initial }: { quiz: Quiz; initial: Answers }) {
  const c = useCourse();
  const [answers, setAnswers] = useState(initial);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function act(submit: boolean) {
    setBusy(true);
    try {
      if (submit) {
        const s = await api.submit(c.id, quiz.id, answers);
        setDone(true);
        const receipt = `Submitted ${date(s.submittedAt)} · Receipt ${s.id}.`;
        const score = s.score;
        setMessage(
          score
            ? `${receipt} Auto-graded score: ${score.earned}/${score.possible}.${score.manualPending ? ` ${score.manualPending} points pending manual grading.` : ""}`
            : `${receipt} Your grade will appear here when your instructor publishes it.`,
        );
      } else {
        await api.saveDraft(c.id, quiz.id, answers);
        setMessage("Draft saved. You can leave and return to this quiz.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="quiz-workspace">
      <Title
        over=""
        title={quiz.title}
        description={`${quiz.questions.length} questions · ${quiz.questions.reduce((total, q) => total + (q.points ?? 1), 0)} points`}
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
          >
            <legend>
              {i + 1}. {q.prompt}
            </legend>
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
        <p role="status">{message}</p>
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
    c.status === "active" && (c.role !== null || user?.systemRole === "admin");
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
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
      <Title
        over=""
        title="Resources"
        description="Course materials and shared notes."
      />
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
      <div className="resource-list-controls">
        <Button
          type="button"
          aria-haspopup="dialog"
          disabled={!canUpload}
          onClick={() => {
            setMessage("");
            setUploadError("");
            uploadDialog.current?.showModal();
          }}
        >
          <Plus size={16} /> Upload
        </Button>
      </div>
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
              await api.upload(c.id, {
                file,
                title: String(data.get("title")).trim(),
                resourceType,
              });
              form.reset();
              uploadDialog.current?.close();
              setQuery("");
              setSearch("");
              r.reload();
              setMessage(
                isMock
                  ? "Demo resource added to this session."
                  : "File uploaded.",
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
          {uploadError && (
            <p className="resource-upload-error" role="alert">
              {uploadError}
            </p>
          )}
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
      {message && <p role="status">{message}</p>}
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
