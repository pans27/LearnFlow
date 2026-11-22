import Assignments from "@/pages/Assignments";
import { Eye, EyeOff } from "lucide-react";
import Admin from "@/pages/admin/Admin";
import { Brand } from "@/components/Brand";
import { createContext, useContext, useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import type { User } from "@/types";
import { api, isMock, ApiError, changePassword } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Shell, CourseLayout, AdminLayout } from "@/layouts/Layouts";
import {
  Courses,
  Dashboard,
  Announcements,
  Quizzes,
  Resources,
  NotFound,
} from "@/pages/Pages";
const Auth = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
}>({
  user: null,
  refresh: async () => {},
  logout: async () => {},
  clearSession: () => {},
});
export const useAuth = () => useContext(Auth);
function homeFor(user: User) {
  if (user.mustChangePassword) return "/change-password";
  return user.systemRole === "admin" ? "/admin" : "/courses";
}
function Protected() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword)
    return <Navigate to="/change-password" replace />;
  return <Outlet />;
}
function Login() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <div className="login">
      <form
        className="panel login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            const signedIn = await api.login({
              email: String(f.get("email")),
              password: String(f.get("password")),
            });
            await refresh();
            nav(homeFor(signedIn), { replace: true });
          } catch (e) {
            setError(
              e instanceof ApiError && e.status === 401
                ? "Email or password is incorrect."
                : "Unable to sign in. Check that the backend is running and try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <Brand />
        <div className="login-heading">
          <h1>Sign in</h1>
          <p>Access your courses and resources.</p>
        </div>
        {params.get("sessionExpired") === "1" && (
          <p role="status">Your session expired. Please sign in again.</p>
        )}
        {params.get("passwordChanged") === "1" && (
          <p role="status">Password updated. Sign in with your new password.</p>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={isMock ? "alex@learnflow.demo" : ""}
            autoComplete="username"
            maxLength={320}
          />
        </label>
        <div className="login-password-field">
          <label htmlFor="login-password">Password</label>
          <div className="login-password-control">
            <input
              name="password"
              id="login-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              type={showPassword ? "text" : "password"}
              required
              defaultValue={isMock ? "demo-password" : ""}
              autoComplete="current-password"
              maxLength={128}
            />
            <button
              type="button"
              className="login-password-toggle"
              aria-controls="login-password"
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? (
                <EyeOff size={20} aria-hidden="true" />
              ) : (
                <Eye size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <Button className="gloss-button login-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in →"}
        </Button>
        {isMock && (
          <small>
            Demo: alex@learnflow.demo teaches ECE 1779. Use
            student@learnflow.demo to join as Jamie. Password: demo-password.
          </small>
        )}
      </form>
    </div>
  );
}
function ChangePassword() {
  const { user, clearSession, logout } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to={homeFor(user)} replace />;
  return (
    <div className="login">
      <form
        className="panel login-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const data = new FormData(event.currentTarget);
          const currentPassword = String(data.get("currentPassword"));
          const newPassword = String(data.get("newPassword"));
          setError("");
          if (newPassword !== data.get("confirmation")) {
            setError("New passwords do not match.");
            return;
          }
          if (newPassword === currentPassword) {
            setError(
              "Choose a password different from your temporary password.",
            );
            return;
          }
          setBusy(true);
          try {
            await changePassword({ currentPassword, newPassword });
            clearSession();
            navigate("/login?passwordChanged=1", { replace: true });
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              clearSession();
              navigate("/login?sessionExpired=1", { replace: true });
            } else {
              setError(
                error instanceof ApiError && error.status === 400
                  ? error.message
                  : "Unable to change your password. Please try again.",
              );
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <Brand />
        <div className="login-heading">
          <h1>Set your password</h1>
          <p>Replace your temporary password to continue.</p>
        </div>
        <label>
          Temporary password
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          New password (12–128 characters)
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            name="confirmation"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void logout().catch(() =>
              setError("Unable to sign out. Please try again."),
            )
          }
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [retry, setRetry] = useState(0);
  async function refresh() {
    setUser(await api.me());
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setSessionError("");
    api
      .me()
      .then((account) => {
        if (active) setUser(account);
      })
      .catch((error) => {
        if (!active) return;
        setUser(null);
        if (!isMock && !(error instanceof ApiError && error.status === 401))
          setSessionError(
            "Unable to connect to LearnFlow. Check that the backend is running.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  if (loading) return <p className="loading">Opening your learning space…</p>;
  if (sessionError)
    return (
      <div className="login">
        <div className="panel login-form">
          <Brand />
          <p role="alert">{sessionError}</p>
          <Button onClick={() => setRetry((value) => value + 1)}>
            Retry connection
          </Button>
        </div>
      </div>
    );
  return (
    <Auth.Provider
      value={{
        user,
        refresh,
        clearSession: () => setUser(null),
        logout: async () => {
          await api.logout();
          setUser(null);
        },
      }}
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<Protected />}>
          <Route element={<Shell />}>
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:courseId" element={<CourseLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="announcements" element={<Announcements />} />
              <Route
                path="announcements/:announcementId"
                element={<Announcements />}
              />
              <Route path="quizzes" element={<Quizzes />} />
              <Route path="quizzes/:quizId" element={<Quizzes />} />
              <Route path="resources" element={<Resources />} />
              <Route path="assignments" element={<Assignments />} />
              <Route
                path="assignments/:assignmentId"
                element={<Assignments />}
              />
            </Route>
          </Route>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/courses" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Auth.Provider>
  );
}
