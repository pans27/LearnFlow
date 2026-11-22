import { confirmCourseAction } from "@/lib/course-confirm";
import { CourseFeedback, VisibilityBadge } from "@/components/CourseFeedback";
import { useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { useCourse } from "@/layouts/Layouts";
import { useData } from "@/lib/use-data";
import { isMock } from "@/services/api";
import {
  assignmentsApi as api,
  type Assignment,
  type AssignmentInput,
  type AssignmentSubmission,
} from "@/services/assignments";
import { ArrowUpRight } from "lucide-react";
import { DueDate } from "@/components/DueDate";
import { Button } from "@/components/ui/button";

function Failure({ error, reload }: { error: string; reload: () => void }) {
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
function Deadline({ value }: { value: string | null }) {
  return value ? <DueDate dueAt={value} /> : <p>No deadline</p>;
}
function FileDownload({
  assignment,
  submission,
}: {
  assignment: Assignment;
  submission: AssignmentSubmission;
}) {
  const course = useCourse();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div className="actions assignment-submission-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            const tab = window.open("about:blank", "_blank");
            if (!tab) {
              setError("Allow pop-ups for this site to preview the PDF.");
              return;
            }
            tab.opener = null;
            setBusy(true);
            setError("");
            try {
              tab.location.replace(
                await api.preview(course.id, assignment.id, submission.id),
              );
            } catch (error) {
              tab.close();
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Preview PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const url = await api.download(
                course.id,
                assignment.id,
                submission.id,
              );
              const link = document.createElement("a");
              link.href = url;
              link.rel = "noopener noreferrer";
              document.body.append(link);
              link.click();
              link.remove();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Loading…" : "Download submission"}
        </Button>
      </div>
      {error && <CourseFeedback>{error}</CourseFeedback>}
    </>
  );
}
export default function Assignments() {
  if (isMock)
    return (
      <div className="panel">
        <h1>Assignments</h1>
        <p>Assignment management is available when connected to the backend.</p>
      </div>
    );
  return <LiveAssignments />;
}
function LiveAssignments() {
  const course = useCourse();
  const { user } = useAuth();
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const manage = course.role === "instructor" || user?.systemRole === "admin";
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [editor, setEditor] = useState<Assignment | null | undefined>(
    undefined,
  );
  const result = useData(async () => {
    const list = assignmentId
      ? [await api.get(course.id, assignmentId)]
      : await api.list(course.id);
    return Promise.all(
      list.map(async (item) => ({
        ...item,
        own: manage ? null : await api.mine(course.id, item.id),
      })),
    );
  }, [course.id, assignmentId, manage, user?.id]);
  if (!result.data) return <Failure {...result} />;
  const selected = result.data[0];
  return (
    <section className="assignment-workspace">
      <div className="announcement-toolbar course-page-header">
        <h1>{assignmentId ? selected.title : "Assignments"}</h1>
        {manage && course.status === "active" && (
          <div className="actions assignment-heading-actions">
            {(!assignmentId || !selected.isVisible) && (
              <>
                <Button
                  variant={assignmentId ? "outline" : "default"}
                  disabled={publishing}
                  onClick={() => setEditor(assignmentId ? selected : null)}
                >
                  {assignmentId ? "Edit draft" : "Create assignment"}
                </Button>
                {assignmentId && (
                  <Button
                    disabled={publishing}
                    onClick={async () => {
                      if (
                        !(await confirmCourseAction(
                          "Publish this assignment? Students will see it and its content and settings will be locked.",
                        ))
                      )
                        return;
                      setPublishing(true);
                      setPublishError("");
                      try {
                        await api.publishAssignment(course.id, selected.id);
                        result.reload();
                      } catch (error) {
                        setPublishError((error as Error).message);
                      } finally {
                        setPublishing(false);
                      }
                    }}
                  >
                    {publishing ? "Publishing…" : "Publish assignment"}
                  </Button>
                )}
              </>
            )}
            {assignmentId && (
              <Button
                type="button"
                variant="outline"
                className="delete-action"
                disabled={deleting || publishing}
                onClick={async () => {
                  if (
                    !(await confirmCourseAction(
                      `Delete “${selected.title}”? This cannot be undone. Assignments with submissions cannot be deleted.`,
                    ))
                  )
                    return;
                  setDeleting(true);
                  setDeleteError("");
                  try {
                    await api.remove(course.id, selected.id);
                    navigate(`/courses/${course.id}/assignments`, {
                      replace: true,
                    });
                  } catch (error) {
                    setDeleteError((error as Error).message);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete assignment"}
              </Button>
            )}
          </div>
        )}
      </div>
      {deleteError && <CourseFeedback>{deleteError}</CourseFeedback>}
      {publishError && <CourseFeedback>{publishError}</CourseFeedback>}
      {assignmentId && manage && selected.isVisible && (
        <p className="notice">
          Published assignment. Its content and settings are locked. You can
          still grade submissions and publish grades.
        </p>
      )}
      {course.status === "archived" && (
        <p className="notice">Archived course. Assignments are read-only.</p>
      )}
      {!assignmentId && result.data.length === 0 && (
        <p className="panel">No assignments yet.</p>
      )}
      {!assignmentId ? (
        result.data.map((item) => (
          <div className="panel quiz-card" key={item.id}>
            <Link className="quiz-card-content" to={String(item.id)}>
              <div>
                <h2>{item.title}</h2>
                {manage ? (
                  <VisibilityBadge
                    visible={item.isVisible}
                    draft={!item.isVisible}
                  />
                ) : (
                  <span
                    className={`quiz-completion ${item.own ? "quiz-completed" : "quiz-incomplete"}`}
                  >
                    {item.own ? "Submitted" : "Not submitted"}
                  </span>
                )}
                <Deadline value={item.dueAt} />
              </div>
              {!manage ? (
                <span className="quiz-list-grade">
                  {item.own?.mark ?? "—"} / {item.maxMark}
                </span>
              ) : (
                <ArrowUpRight />
              )}
            </Link>
            {manage && course.status === "active" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="delete-action"
                disabled={deleting}
                onClick={async () => {
                  if (
                    !(await confirmCourseAction(
                      `Delete “${item.title}”? This cannot be undone. Assignments with submissions cannot be deleted.`,
                    ))
                  )
                    return;
                  setDeleting(true);
                  setDeleteError("");
                  try {
                    await api.remove(course.id, item.id);
                    result.reload();
                  } catch (error) {
                    setDeleteError((error as Error).message);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "Deleting…" : "Delete assignment"}
              </Button>
            )}
          </div>
        ))
      ) : (
        <>
          <Deadline value={selected.dueAt} />
          <div className="panel">
            <h2>Instructions</h2>
            <p className="quiz-submitted-answer">
              {selected.description || "No additional instructions."}
            </p>
            <p>Maximum score: {selected.maxMark}</p>
            <p>
              {selected.allowResubmission
                ? "Resubmission is allowed before the deadline. Replacing a submission clears its previous grade."
                : "One submission is allowed."}
            </p>
            {manage && (
              <VisibilityBadge
                visible={selected.isVisible}
                draft={!selected.isVisible}
              />
            )}
          </div>
          {manage ? (
            <InstructorAssignment
              key={selected.id}
              assignment={selected}
              reload={result.reload}
            />
          ) : (
            <StudentAssignment
              key={selected.id}
              assignment={selected}
              submission={selected.own}
              reload={result.reload}
            />
          )}
        </>
      )}
      {editor !== undefined && (
        <AssignmentEditor
          key={editor?.id ?? "new"}
          assignment={editor}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            result.reload();
          }}
        />
      )}
    </section>
  );
}
function AssignmentEditor({
  assignment,
  onClose,
  onSaved,
}: {
  assignment: Assignment | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const course = useCourse();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const local = assignment?.dueAt
    ? new Date(
        Date.parse(assignment.dueAt) -
          new Date(assignment.dueAt).getTimezoneOffset() * 60000,
      ).toISOString()
    : "";
  return (
    <dialog
      className="announcement-dialog"
      aria-labelledby="assignment-editor-title"
      ref={(element) => {
        if (element && !element.open) element.showModal();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        className="stack"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          setError("");
          try {
            const title = String(data.get("title") ?? "").trim();
            const maxMark = Number(data.get("maxMark"));
            const day = String(data.get("dueDate") ?? "");
            const time = String(data.get("dueTime") ?? "");
            if (!title || title.length > 200)
              throw new Error("Enter a title of up to 200 characters.");
            if (
              !Number.isFinite(maxMark) ||
              maxMark <= 0 ||
              maxMark > 999999.99 ||
              Math.abs(maxMark * 100 - Math.round(maxMark * 100)) > 0.000001
            )
              throw new Error(
                "Enter a maximum score from 0.01 to 999999.99 with up to two decimal places.",
              );
            const date = day ? new Date(`${day}T${time}`) : null;
            if (date && !Number.isFinite(date.getTime()))
              throw new Error("Choose a valid due date and time.");
            const input: AssignmentInput = {
              title,
              maxMark,
              description: String(data.get("description") ?? "").trim() || null,
              dueAt: date?.toISOString() ?? null,
              isVisible: false,
              allowResubmission: data.get("resubmit") === "on",
            };
            setBusy(true);
            if (assignment) await api.update(course.id, assignment.id, input);
            else await api.create(course.id, input);
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 id="assignment-editor-title">
          {assignment ? "Edit assignment" : "Create assignment"}
        </h2>
        <fieldset className="stack assignment-fields" disabled={busy}>
          <label>
            Title
            <input
              name="title"
              maxLength={200}
              defaultValue={assignment?.title}
            />
          </label>
          <label>
            Instructions
            <textarea
              name="description"
              maxLength={20000}
              rows={5}
              defaultValue={assignment?.description ?? ""}
            />
          </label>
          <label>
            Maximum score
            <input
              name="maxMark"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue={assignment?.maxMark ?? 100}
            />
          </label>
          <div className="quiz-deadline-fields">
            <label>
              Due date (optional)
              <input
                type="date"
                name="dueDate"
                defaultValue={local.slice(0, 10)}
              />
            </label>
            <label>
              Due time (local)
              <input
                type="time"
                name="dueTime"
                defaultValue={local.slice(11, 16) || "23:59"}
              />
            </label>
          </div>
          <label className="announcement-visibility">
            <input
              type="checkbox"
              name="resubmit"
              defaultChecked={assignment?.allowResubmission ?? true}
            />
            Allow resubmission before the deadline
          </label>
        </fieldset>
        {error && <CourseFeedback>{error}</CourseFeedback>}
        <div className="announcement-actions">
          <Button disabled={busy}>{busy ? "Saving…" : "Save draft"}</Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </dialog>
  );
}
function StudentAssignment({
  assignment,
  submission: initialSubmission,
  reload,
}: {
  assignment: Assignment;
  submission: AssignmentSubmission | null;
  reload: () => void;
}) {
  const course = useCourse();
  const [submission, setSubmission] = useState(initialSubmission);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const success = useRef<HTMLDialogElement>(null);
  const pastDue =
    assignment.dueAt !== null && Date.parse(assignment.dueAt) <= Date.now();
  const canUpload =
    course.status === "active" &&
    !pastDue &&
    (!submission || assignment.allowResubmission);
  return (
    <>
      <div className="panel">
        <div className="assignment-submission-heading">
          <h2>{submission ? "Your submission" : "Submit your assignment"}</h2>
          {submission && canUpload && !editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError("");
                setEditing(true);
              }}
            >
              Edit submission
            </Button>
          )}
        </div>
        {submission ? (
          <>
            <span className="quiz-completion quiz-completed">Submitted</span>
            <p className="assignment-submitted-filename">
              {submission.originalFilename}
            </p>
            <p>
              Submitted{" "}
              {new Date(submission.submittedAt).toLocaleString("en-CA")}
            </p>
            <p>
              Grade: {submission.mark ?? "—"} / {assignment.maxMark}
            </p>
            {submission.mark === null && (
              <p>
                {assignment.gradesVisible
                  ? "Your submission has not been graded yet."
                  : "Waiting for your instructor to publish grades."}
              </p>
            )}
            <FileDownload assignment={assignment} submission={submission} />
          </>
        ) : (
          <p>Not submitted</p>
        )}
        {pastDue && <p>The deadline has passed. Uploads are closed.</p>}
        {submission &&
          !assignment.allowResubmission &&
          !pastDue &&
          course.status === "active" && (
            <p className="assignment-upload">
              Your instructor has not enabled resubmission.
            </p>
          )}
        {canUpload && (!submission || editing) && (
          <form
            className="stack assignment-upload"
            noValidate
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setError("");
              const data = new FormData(event.currentTarget);
              const file = data.get("file");
              try {
                if (!(file instanceof File) || !file.size)
                  throw new Error("Choose a PDF file.");
                if (
                  submission &&
                  !(await confirmCourseAction(
                    "Replace your current submission? Its previous grade will be cleared.",
                  ))
                )
                  return;
                setBusy(true);
                const saved = await api.submit(course.id, assignment.id, file);
                setSubmission(saved);
                setEditing(false);
                success.current?.showModal();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {submission && (
              <p>
                Select a new PDF to replace your submission. Your current file
                remains saved until you submit the replacement. Replacing it
                clears its previous grade.
              </p>
            )}
            <label>
              {submission ? "New submission file" : "Submission file"} (PDF · up
              to 10 MB)
              <input
                type="file"
                name="file"
                accept=".pdf,application/pdf"
                disabled={busy}
              />
            </label>
            <div className="actions assignment-submission-actions">
              <Button disabled={busy}>
                {busy
                  ? "Uploading…"
                  : submission
                    ? "Submit replacement"
                    : "Submit assignment"}
              </Button>
              {submission && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setError("");
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
        {error && <CourseFeedback>{error}</CourseFeedback>}
      </div>
      <dialog
        ref={success}
        className="quiz-success-dialog assignment-success-dialog"
        aria-labelledby="assignment-success-title"
        onClose={reload}
      >
        <h2 id="assignment-success-title">Submitted successfully</h2>
        <p>
          Your file has been saved. Your instructor will review and grade your
          work.
        </p>
        <div className="assignment-success-actions">
          <Button type="button" onClick={() => success.current?.close()}>
            Done
          </Button>
        </div>
      </dialog>
    </>
  );
}
function InstructorAssignment({
  assignment,
  reload,
}: {
  assignment: Assignment;
  reload: () => void;
}) {
  const course = useCourse();
  const rows = useData(
    () => api.submissions(course.id, assignment.id),
    [course.id, assignment.id],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <div className="announcement-toolbar">
        <h2>Student submissions {rows.data && `(${rows.data.length})`}</h2>
        <Button
          disabled={
            busy ||
            course.status !== "active" ||
            assignment.gradesVisible ||
            !rows.data?.length
          }
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api.publish(course.id, assignment);
              reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {assignment.gradesVisible
            ? "Grades published"
            : busy
              ? "Publishing…"
              : "Publish grades"}
        </Button>
      </div>
      {error && <CourseFeedback>{error}</CourseFeedback>}
      {!rows.data ? (
        <Failure {...rows} />
      ) : rows.data.length === 0 ? (
        <p className="panel">No submissions yet.</p>
      ) : (
        rows.data.map((row) => (
          <AssignmentGrading
            key={row.id + ":" + row.submittedAt}
            assignment={assignment}
            submission={row}
            reload={rows.reload}
          />
        ))
      )}
    </>
  );
}
function AssignmentGrading({
  assignment,
  submission,
  reload,
}: {
  assignment: Assignment;
  submission: AssignmentSubmission;
  reload: () => void;
}) {
  const course = useCourse();
  const [editing, setEditing] = useState(submission.mark === null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writable = course.status === "active" && !assignment.gradesVisible;
  return (
    <details className="panel quiz-submission">
      <summary>
        {submission.student.name} · {submission.mark ?? "Pending"} /{" "}
        {assignment.maxMark}
      </summary>
      <p>{submission.student.email}</p>
      <p>
        {submission.originalFilename} ·{" "}
        {new Date(submission.submittedAt).toLocaleString("en-CA")}
      </p>
      <FileDownload assignment={assignment} submission={submission} />
      {editing && writable ? (
        <form
          className="stack"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const data = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api.grade(
                course.id,
                assignment,
                submission.id,
                String(data.get("mark") ?? ""),
              );
              setEditing(false);
              reload();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Score (max {assignment.maxMark})
            <input
              name="mark"
              type="number"
              min={0}
              max={assignment.maxMark}
              step="0.01"
              defaultValue={submission.mark ?? ""}
              disabled={busy}
            />
          </label>
          <div className="actions">
            <Button disabled={busy}>{busy ? "Saving…" : "Save grade"}</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="assignment-upload">
          <p>
            Score: {submission.mark ?? "Pending"} / {assignment.maxMark}
          </p>
          {writable && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      )}
      {error && <CourseFeedback>{error}</CourseFeedback>}
    </details>
  );
}
