import { confirmCourseAction } from "@/lib/course-confirm";
import { CourseFeedback, VisibilityBadge } from "@/components/CourseFeedback";
import { useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/App";
import { useCourse } from "@/layouts/Layouts";
import { useData } from "@/lib/use-data";
import { api } from "@/services/api";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/types";

export default function Announcements() {
  const course = useCourse();
  const { user } = useAuth();
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const result = useData(() => api.announcements(course.id), [course.id]);
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const canManage =
    course.role === "instructor" || user?.systemRole === "admin";
  const canWrite = canManage && !course.readOnly && course.status === "active";
  const items = result.data?.filter(
    (a) => !announcementId || a.id === announcementId,
  );
  function open(item: Announcement | null) {
    setEditing(item);
    setTitle(item?.title ?? "");
    setBody(item?.body ?? "");
    setVisible(item?.isVisible !== false);
    setFormError("");
    dialog.current?.showModal();
  }
  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      result.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="announcement-toolbar course-page-header">
        <h1>Announcements</h1>
        {canWrite && (
          <Button onClick={() => open(null)}>Create announcement</Button>
        )}
      </div>
      {course.status === "archived" && (
        <CourseFeedback tone="info">
          This course is archived. Announcements are read-only.
        </CourseFeedback>
      )}
      {error && <CourseFeedback>{error}</CourseFeedback>}
      {result.error ? (
        <div className="course-load-state">
          <CourseFeedback>{result.error}</CourseFeedback>
          <Button onClick={result.reload}>Try again</Button>
        </div>
      ) : !items ? (
        <p role="status">Loading announcements…</p>
      ) : items.length === 0 ? (
        <p className="panel">
          {announcementId ? "Announcement not found." : "No announcements yet."}
        </p>
      ) : (
        items.map((item) => (
          <article className="panel announcement" key={item.id}>
            <div className="announcement-heading">
              <h2>
                <Link to={`/courses/${course.id}/announcements/${item.id}`}>
                  {item.title}
                </Link>
              </h2>
              {canManage && (
                <VisibilityBadge visible={item.isVisible !== false} />
              )}
            </div>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {item.body}
            </p>
            {canWrite && (
              <div className="announcement-actions course-card-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => open(item)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    mutate(() =>
                      api.updateAnnouncement(course.id, item.id, {
                        isVisible: item.isVisible === false,
                      }),
                    )
                  }
                >
                  {item.isVisible === false
                    ? "Publish announcement"
                    : "Hide announcement"}
                </Button>
                <Button
                  variant="outline"
                  className="delete-action"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirmCourseAction(
                        `Delete “${item.title}”? This cannot be undone.`,
                      )
                    )
                      void mutate(async () => {
                        await api.deleteAnnouncement(course.id, item.id);
                        if (announcementId)
                          navigate(`/courses/${course.id}/announcements`);
                      });
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </article>
        ))
      )}
      {announcementId && (
        <Link className="see-all" to={`/courses/${course.id}/announcements`}>
          ← All announcements
        </Link>
      )}
      <dialog
        ref={dialog}
        className="announcement-dialog"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
        aria-labelledby="announcement-editor-title"
      >
        <form
          className="stack"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!title.trim() || !body.trim()) {
              setFormError("Enter a title and message.");
              return;
            }
            setBusy(true);
            setFormError("");
            try {
              const input = {
                title: title.trim(),
                body: body.trim(),
                isVisible: visible,
              };
              if (editing)
                await api.updateAnnouncement(course.id, editing.id, input);
              else await api.createAnnouncement(course.id, input);
              dialog.current?.close();
              result.reload();
            } catch (e) {
              setFormError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2 id="announcement-editor-title">
            {editing ? "Edit announcement" : "Create announcement"}
          </h2>
          <label>
            Title
            <input
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Message
            <textarea
              required
              maxLength={20000}
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="announcement-visibility">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
              disabled={busy}
              aria-describedby="announcement-visibility-help"
            />
            <span className="announcement-visibility-copy">
              <strong>
                {visible ? "Visible to students" : "Hidden from students"}
              </strong>
              <small id="announcement-visibility-help">
                {visible
                  ? "Students can read this announcement once published."
                  : "Only instructors and administrators can see this announcement."}
              </small>
            </span>
          </label>
          {formError && <CourseFeedback>{formError}</CourseFeedback>}
          <div className="announcement-actions">
            <Button disabled={busy}>
              {busy
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : visible
                    ? "Publish announcement"
                    : "Save hidden announcement"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
