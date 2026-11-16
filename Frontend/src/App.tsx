import { Brand } from "@/components/Brand";
import { createContext, useContext, useEffect, useState } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate } from "react-router-dom";
import type { User } from "@/types";
import { api, isMock } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Shell, CourseLayout, AdminLayout } from "@/layouts/Layouts";
import {
  Courses,
  Dashboard,
  Announcements,
  Quizzes,
  Resources,
  Admin,
  NotFound,
} from "@/pages/Pages";
const Auth = createContext<{
  user: User | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}>({ user: null, refresh: async () => {}, logout: async () => {} });
export const useAuth = () => useContext(Auth);
function Protected() {
  return useAuth().user ? <Outlet /> : <Navigate to="/login" replace />;
}
function Login() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/courses" replace />;
  return (
    <div className="login">
      <form
        className="panel login-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api.login({
              email: String(f.get("email")),
              password: String(f.get("password")),
            });
            await refresh();
            nav("/courses");
          } catch (e) {
            setError((e as Error).message);
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
        <label>
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue={isMock ? "alex@learnflow.demo" : ""}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            defaultValue={isMock ? "demo-password" : ""}
            autoComplete="current-password"
          />
        </label>
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
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setUser(await api.me());
  }
  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="loading">Opening your learning space…</p>;
  return (
    <Auth.Provider
      value={{
        user,
        refresh,
        logout: async () => {
          await api.logout();
          setUser(null);
        },
      }}
    >
      <Routes>
        <Route path="/login" element={<Login />} />
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
