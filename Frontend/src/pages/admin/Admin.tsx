import { useRef, useState, type ReactNode, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { useData } from "@/lib/use-data";
import { api, ApiError, isMock } from "@/services/api";
import {
  adminApi,
  type CreatedAccount,
  type UserInput,
  type CourseInput,
} from "@/services/admin";
import type { AdminCourse, CourseRole, Enrollment, User } from "@/types";

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return "Your session expired. Sign out and sign in again.";
    if (error.status === 403)
      return "Administrator permission is required. Sign out and sign in again.";
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "Unable to complete the request. Please try again.";
}

function DataState({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="panel" role={error ? "alert" : "status"}>
      <p>{error || "Loading…"}</p>
      {error && (
        <Button onClick={reload} variant="outline">
          Retry
        </Button>
      )}
    </div>
  );
}

function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <dialog
      className="admin-dialog"
      aria-labelledby="admin-dialog-title"
      ref={(element) => {
        ref.current = element;
        if (element && !element.open) element.showModal();
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="admin-dialog-heading">
        <h2 id="admin-dialog-title">{title}</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Close dialog"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "courses" ? "courses" : "users";
  if (user?.systemRole !== "admin")
    return <p className="panel">Administrator access required.</p>;
  if (isMock) return <MockAdmin />;
  return (
    <div className="admin-content">
      <h1>Administration</h1>
      <nav className="admin-tabs" aria-label="Administration sections">
        <Link to="/admin" aria-current={tab === "users" ? "page" : undefined}>
          Users
        </Link>
        <Link
          to="/admin?tab=courses"
          aria-current={tab === "courses" ? "page" : undefined}
        >
          Courses & members
        </Link>
      </nav>
      {tab === "users" ? (
        <Users />
      ) : (
        <Courses
          selectedId={params.get("course")}
          onSelect={(id) =>
            setParams(id ? { tab: "courses", course: id } : { tab: "courses" })
          }
        />
      )}
    </div>
  );
}

function MockAdmin() {
  const result = useData(() => api.adminUsers(), []);
  return (
    <>
      <h1>Administration</h1>
      <p className="notice">
        User and course management uses the connected backend. Enable real
        backend mode to manage accounts and enrollments.
      </p>
      {!result.data ? (
        <DataState {...result} />
      ) : (
        <div className="panel">
          <h2>Demo users</h2>
          {result.data.map((user) => (
            <p key={user.id}>
              {user.name} · {user.email}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <div className="admin-copy-value">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("Copied.");
          } catch {
            setMessage("Select the text above and copy it manually.");
          }
        }}
      >
        {label}
      </Button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}

function Users() {
  const { user: current, refresh } = useAuth();
  const result = useData(() => adminApi.users(), []);
  const [editor, setEditor] = useState<User | "new" | null>(null);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const users = result.data?.filter((user) =>
    `${user.name} ${user.email}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="admin-section-heading">
        <h2>Users</h2>
        <Button onClick={() => setEditor("new")}>
          <Plus size={16} /> Create user
        </Button>
      </div>
      <label className="admin-search">
        Find a user
        <input
          type="search"
          value={query}
          placeholder="Name or email"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {notice && <p role="status">{notice}</p>}
      {!result.data ? (
        <DataState {...result} />
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">System role</th>
                <th scope="col">Password</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    {user.id === current?.id && (
                      <span className="pill admin-inline-badge">You</span>
                    )}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    {user.systemRole === "admin" ? "Administrator" : "User"}
                  </td>
                  <td>{user.mustChangePassword ? "Change required" : "Set"}</td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditor(user)}
                      aria-label={`Edit ${user.name}`}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users?.length && (
            <p className="admin-empty">
              {query ? "No matching users." : "No users yet."}
            </p>
          )}
        </div>
      )}
      {editor && (
        <UserEditor
          key={editor === "new" ? "new" : editor.id}
          user={editor === "new" ? undefined : editor}
          self={editor !== "new" && editor.id === current?.id}
          onClose={() => setEditor(null)}
          onCreated={(account) => {
            setEditor(null);
            setCreated(account);
            result.reload();
          }}
          onUpdated={async (user) => {
            setEditor(null);
            setNotice("User updated.");
            result.reload();
            if (user.id === current?.id) {
              try {
                await refresh();
              } catch {
                setNotice(
                  "User updated. Sign out and sign in again to refresh your session.",
                );
              }
            }
          }}
        />
      )}
      {created && (
        <Dialog
          title="User created"
          busy={false}
          onClose={() => setCreated(null)}
        >
          <p>
            Save this temporary password before closing. The user must replace
            it on first sign-in.
          </p>
          <dl className="admin-credentials">
            <dt>Email</dt>
            <dd>
              {created.user.email}
              <CopyValue value={created.user.email} label="Copy email" />
            </dd>
            <dt>Temporary password</dt>
            <dd>
              <code>{created.temporaryPassword}</code>
              <CopyValue
                value={created.temporaryPassword}
                label="Copy temporary password"
              />
            </dd>
          </dl>
          <Button onClick={() => setCreated(null)}>Done</Button>
        </Dialog>
      )}
    </>
  );
}

function UserEditor({
  user,
  self,
  onClose,
  onCreated,
  onUpdated,
}: {
  user?: User;
  self: boolean;
  onClose: () => void;
  onCreated: (account: CreatedAccount) => void;
  onUpdated: (user: User) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(user?.systemRole === "admin");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    if (!name) {
      setError("Enter a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (user)
        await onUpdated(await adminApi.updateUser(user.id, { name, isAdmin }));
      else {
        const input: UserInput = {
          name,
          email: String(data.get("email")).trim(),
          isAdmin,
        };
        onCreated(await adminApi.createUser(input));
      }
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={user ? "Edit user" : "Create user"}
      busy={busy}
      onClose={onClose}
    >
      <form className="stack" onSubmit={submit}>
        <fieldset disabled={busy} className="admin-form-fields">
          <label>
            Name
            <input
              name="name"
              defaultValue={user?.name}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          {user ? (
            <p>{user.email}</p>
          ) : (
            <label>
              Email
              <input
                name="email"
                type="email"
                maxLength={320}
                required
                autoComplete="off"
              />
            </label>
          )}
          <label>
            System role
            <select
              value={isAdmin ? "admin" : "user"}
              onChange={(event) => setIsAdmin(event.target.value === "admin")}
            >
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <p className="admin-help">
            Student and instructor roles are assigned separately within each
            course.
          </p>
          {self && user?.systemRole === "admin" && !isAdmin && (
            <p className="notice">
              Saving will remove your administrator access. The backend protects
              the last active administrator.
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : user ? "Save user" : "Create user"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function Courses({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const result = useData(() => adminApi.courses(), []);
  const [editor, setEditor] = useState<AdminCourse | "new" | null>(null);
  const [statusTarget, setStatusTarget] = useState<AdminCourse | null>(null);
  const [notice, setNotice] = useState("");
  if (!result.data) return <DataState {...result} />;
  if (selectedId) {
    const course = result.data.find((course) => course.id === selectedId);
    if (!course)
      return (
        <div className="panel">
          <p>Course not found.</p>
          <Button onClick={() => onSelect(null)}>Back to courses</Button>
        </div>
      );
    return (
      <Members
        key={course.id + course.status}
        course={course}
        onBack={() => onSelect(null)}
      />
    );
  }
  return (
    <>
      <div className="admin-section-heading">
        <h2>Courses</h2>
        <Button onClick={() => setEditor("new")}>
          <Plus size={16} /> Create course
        </Button>
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Course</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((course) => (
              <tr key={course.id}>
                <td>
                  <strong>
                    {course.code} · {course.name}
                  </strong>
                  {course.description && (
                    <p className="admin-course-description">
                      {course.description}
                    </p>
                  )}
                </td>
                <td>
                  <span className="pill">{course.status}</span>
                </td>
                <td>
                  <div className="admin-row-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelect(course.id)}
                      aria-label={`Manage members of ${course.code}`}
                    >
                      Members
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={course.status === "archived"}
                      onClick={() => setEditor(course)}
                      aria-label={`Edit ${course.code}`}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setStatusTarget(course)}
                    >
                      {course.status === "active" ? "Archive" : "Restore"}
                    </Button>
                    <Link
                      className="admin-text-link"
                      to={`/courses/${course.id}`}
                      state={{ fromAdmin: true }}
                    >
                      View course ↗
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result.data.length && (
          <p className="admin-empty">
            No courses yet. Create a course to get started.
          </p>
        )}
      </div>
      {editor && (
        <CourseEditor
          key={editor === "new" ? "new" : editor.id}
          course={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice(editor === "new" ? "Course created." : "Course updated.");
            result.reload();
          }}
        />
      )}
      {statusTarget && (
        <CourseStatusDialog
          course={statusTarget}
          onClose={() => setStatusTarget(null)}
          onSaved={() => {
            setStatusTarget(null);
            setNotice("Course status updated.");
            result.reload();
          }}
        />
      )}
    </>
  );
}

function CourseEditor({
  course,
  onClose,
  onSaved,
}: {
  course?: AdminCourse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const input: CourseInput = {
      name: String(data.get("name")).trim(),
      courseCode: String(data.get("code")).trim(),
      description: String(data.get("description")).trim(),
    };
    if (!input.name || !input.courseCode) {
      setError("Enter a course name and code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (course) await adminApi.updateCourse(course.id, input);
      else await adminApi.createCourse(input);
      onSaved();
    } catch (error) {
      setError(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={course ? "Edit course" : "Create course"}
      busy={busy}
      onClose={onClose}
    >
      <form className="stack" onSubmit={submit}>
        <fieldset className="admin-form-fields" disabled={busy}>
          <label>
            Course code
            <input
              name="code"
              required
              maxLength={50}
              defaultValue={course?.code}
              placeholder="ECE1779"
              autoFocus
            />
          </label>
          <label>
            Course name
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={course?.name}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              maxLength={10000}
              defaultValue={course?.description}
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Saving…" : course ? "Save course" : "Create course"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CourseStatusDialog({
  course,
  onClose,
  onSaved,
}: {
  course: AdminCourse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const archive = course.status === "active";
  return (
    <Dialog
      title={archive ? "Archive course" : "Restore course"}
      busy={busy}
      onClose={onClose}
    >
      <p>
        {archive
          ? `Archive ${course.code}? Members will lose access and course settings and enrollments will become read-only.`
          : `Restore ${course.code} to allow member access and editing again?`}
      </p>
      {error && (
        <p role="alert" className="admin-error">
          {error}
        </p>
      )}
      <div className="admin-dialog-actions">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await adminApi.setCourseStatus(
                course.id,
                archive ? "archived" : "active",
              );
              onSaved();
            } catch (error) {
              setError(errorMessage(error));
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : archive ? "Archive course" : "Restore course"}
        </Button>
      </div>
    </Dialog>
  );
}

function Members({
  course,
  onBack,
}: {
  course: AdminCourse;
  onBack: () => void;
}) {
  const result = useData(async () => {
    const [users, enrollments] = await Promise.all([
      adminApi.users(),
      adminApi.enrollments(course.id),
    ]);
    return { users, enrollments };
  }, [course.id]);
  const [selected, setSelected] = useState<string[]>([]);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [target, setTarget] = useState<{
    member: Enrollment;
    action: "role" | "remove";
  } | null>(null);
  const [notice, setNotice] = useState("");
  const archived = course.status === "archived";
  if (!result.data) return <DataState {...result} />;
  const { users, enrollments } = result.data;
  const available = users.filter(
    (user) => !enrollments.some((member) => member.userId === user.id),
  );
  return (
    <>
      <button type="button" className="admin-text-link" onClick={onBack}>
        ← Courses
      </button>
      <div className="admin-section-heading">
        <h2>
          {course.code} · {course.name}
        </h2>
        <Button
          disabled={archived || !available.length}
          onClick={() => setAddOpen(true)}
        >
          <Plus size={16} /> Add members
        </Button>
      </div>
      {archived && (
        <p className="notice">
          Archived course. Restore it from Courses to change members or roles.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!archived && enrollments.length > 0 && (
        <div className="admin-bulk-toolbar">
          <span role="status">
            {selected.length} selected · up to 100 per batch
          </span>
          <Button
            variant="outline"
            disabled={!selected.length}
            onClick={() => setRemoveOpen(true)}
          >
            Remove selected ({selected.length})
          </Button>
        </div>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" className="admin-selection-cell">
                <input
                  type="checkbox"
                  aria-label="Select up to 100 members"
                  disabled={archived || !enrollments.length}
                  checked={
                    enrollments.length > 0 &&
                    enrollments
                      .slice(0, 100)
                      .every((member) => selected.includes(member.userId))
                  }
                  ref={(element) => {
                    if (element)
                      element.indeterminate =
                        selected.length > 0 &&
                        !enrollments
                          .slice(0, 100)
                          .every((member) => selected.includes(member.userId));
                  }}
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? enrollments
                            .slice(0, 100)
                            .map((member) => member.userId)
                        : [],
                    )
                  }
                />
              </th>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Course role</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.map((member) => {
              const account = users.find((user) => user.id === member.userId);
              return (
                <tr key={member.userId}>
                  <td className="admin-selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`Select ${account?.name ?? member.userId}`}
                      checked={selected.includes(member.userId)}
                      disabled={
                        archived ||
                        (!selected.includes(member.userId) &&
                          selected.length >= 100)
                      }
                      onChange={(event) =>
                        setSelected((ids) =>
                          event.target.checked
                            ? [...ids, member.userId]
                            : ids.filter((id) => id !== member.userId),
                        )
                      }
                    />
                  </td>
                  <td>{account?.name ?? `User ${member.userId}`}</td>
                  <td>{account?.email ?? "—"}</td>
                  <td>{member.role}</td>
                  <td>
                    <div className="admin-row-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={archived}
                        onClick={() => setTarget({ member, action: "role" })}
                        aria-label={`Change role for ${account?.name ?? member.userId}`}
                      >
                        Change role
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={archived}
                        onClick={() => setTarget({ member, action: "remove" })}
                        aria-label={`Remove ${account?.name ?? member.userId}`}
                      >
                        Remove
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!enrollments.length && (
          <p className="admin-empty">
            No members yet. Add a student or instructor.
          </p>
        )}
      </div>
      {removeOpen && (
        <RemoveMembers
          course={course}
          users={selected.map(
            (id) =>
              users.find((user) => user.id === id) ?? {
                id,
                name: `User ${id}`,
                email: "",
                systemRole: "user",
              },
          )}
          onClose={() => setRemoveOpen(false)}
          onSaved={() => {
            setNotice(`${selected.length} members removed.`);
            setSelected([]);
            setRemoveOpen(false);
            result.reload();
          }}
        />
      )}
      {addOpen && (
        <AddMember
          course={course}
          users={available}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            setNotice("Selected members added.");
            setSelected([]);
            result.reload();
          }}
        />
      )}
      {target && (
        <MemberEditor
          course={course}
          member={target.member}
          name={
            users.find((user) => user.id === target.member.userId)?.name ??
            target.member.userId
          }
          action={target.action}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setTarget(null);
            setNotice(
              target.action === "remove" ? "Member removed." : "Role updated.",
            );
            setSelected([]);
            result.reload();
          }}
        />
      )}
    </>
  );
}

function AddMember({
  course,
  users,
  onClose,
  onSaved,
}: {
  course: AdminCourse;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, CourseRole>>({});
  const selectedCount = Object.keys(selected).length;
  const filtered = users.filter((user) =>
    `${user.name} ${user.email}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Dialog title="Add course members" busy={busy} onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !selectedCount) return;
          setBusy(true);
          setError("");
          try {
            await adminApi.enrollMany(
              course.id,
              Object.entries(selected).map(([userId, role]) => ({
                userId,
                role,
              })),
            );
            onSaved();
          } catch (error) {
            setError(errorMessage(error));
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="admin-form-fields">
          <label>
            Find users
            <input
              type="search"
              placeholder="Name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </label>
          <p className="admin-help">
            Choose up to 100 users. Set a course role for each selected user.
          </p>
          <div
            className="admin-member-picker"
            role="group"
            aria-label="Available users"
          >
            {filtered.map((user) => (
              <div className="admin-member-choice" key={user.id}>
                <label className="admin-member-checkbox">
                  <input
                    type="checkbox"
                    checked={selected[user.id] !== undefined}
                    disabled={
                      selectedCount >= 100 && selected[user.id] === undefined
                    }
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected((current) => {
                        const next = { ...current };
                        if (checked) next[user.id] = "student";
                        else delete next[user.id];
                        return next;
                      });
                    }}
                  />
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </span>
                </label>
                {selected[user.id] !== undefined && (
                  <select
                    aria-label={`Course role for ${user.name}`}
                    value={selected[user.id]}
                    onChange={(event) => {
                      const role = event.target.value as CourseRole;
                      setSelected((current) => ({
                        ...current,
                        [user.id]: role,
                      }));
                    }}
                  >
                    <option value="student">Student</option>
                    <option value="instructor">Instructor</option>
                  </select>
                )}
              </div>
            ))}
            {!filtered.length && (
              <p className="admin-empty">No matching users available to add.</p>
            )}
          </div>
          <p className="admin-help" role="status">
            {selectedCount} selected
            {Object.keys(selected).some(
              (id) => !filtered.some((user) => user.id === id),
            )
              ? " · includes users outside this search"
              : ""}
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy || selectedCount === 0}>
            {busy ? "Adding…" : `Add selected (${selectedCount})`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MemberEditor({
  course,
  member,
  name,
  action,
  onClose,
  onSaved,
}: {
  course: AdminCourse;
  member: Enrollment;
  name: string;
  action: "role" | "remove";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={action === "remove" ? "Remove member" : "Change course role"}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            if (action === "remove")
              await adminApi.removeMember(course.id, member.userId);
            else
              await adminApi.changeRole(
                course.id,
                member.userId,
                data.get("role") as CourseRole,
              );
            onSaved();
          } catch (error) {
            setError(errorMessage(error));
            setBusy(false);
          }
        }}
      >
        <p>
          {action === "remove"
            ? `Remove ${name} from this course? Their authored content and submission history will be retained.`
            : `Set the course role for ${name}.`}
        </p>
        {action === "role" && (
          <label>
            Course role
            <select name="role" defaultValue={member.role} disabled={busy}>
              <option value="student">Student</option>
              <option value="instructor">Instructor</option>
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy
              ? "Saving…"
              : action === "remove"
                ? "Remove member"
                : "Save role"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RemoveMembers({
  course,
  users,
  onClose,
  onSaved,
}: {
  course: AdminCourse;
  users: User[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Dialog
      title={`Remove ${users.length} members`}
      busy={busy}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await adminApi.removeMembers(
              course.id,
              users.map((user) => user.id),
            );
            onSaved();
          } catch (error) {
            setError(errorMessage(error));
            setBusy(false);
          }
        }}
      >
        <p>
          Remove these members from {course.code}? They will lose course access.
          Their accounts, authored content, and submission history will be
          retained.
        </p>
        <ul className="admin-removal-list">
          {users.map((user) => (
            <li key={user.id}>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="admin-error">
            {error}
          </p>
        )}
        <div className="admin-dialog-actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button disabled={busy}>
            {busy ? "Removing…" : `Remove ${users.length} members`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
