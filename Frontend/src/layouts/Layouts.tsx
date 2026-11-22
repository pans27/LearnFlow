import { useEffect, useRef } from "react";
import { Brand } from "@/components/Brand";
import {
  Link,
  useMatch,
  useNavigate,
  useLocation,
  NavLink,
  Outlet,
  useParams,
  useOutletContext,
} from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  ClipboardList,
  FileText,
  FolderOpen,
  LogOut,
} from "lucide-react";
import type { Course } from "@/types";
import { useAuth } from "@/App";
import { api, isMock } from "@/services/api";
import { useData } from "@/lib/use-data";
import { Button } from "@/components/ui/button";
import { State } from "@/pages/Pages";
export function Shell() {
  const { user, logout } = useAuth();
  return (
    <div className="app top-navigation-app">
      <header className="global-nav">
        <div className="brand">
          <Brand />
        </div>
        <div className="global-account">
          <span className="account-name">{user?.name}</span>
          <Button
            variant="ghost"
            onClick={() => void logout().catch((e) => alert(e.message))}
          >
            <LogOut size={16} /> Sign out
          </Button>
        </div>
      </header>
      <div className="workspace">
        <main>
          <Outlet />
        </main>
        <footer>
          LearnFlow{" "}
          <span>{isMock ? "Demo workspace" : "Course workspace"}</span>
        </footer>
      </div>
    </div>
  );
}

function CourseNav({ fromAdmin = false }: { fromAdmin?: boolean }) {
  const { courseId } = useParams();
  if (!courseId) return null;
  return (
    <nav className="course-tabs" aria-label="Course navigation">
      {[
        ["", "Overview", LayoutDashboard],
        ["announcements", "Announcements", Megaphone],
        ["quizzes", "Quizzes", ClipboardList],
        ["assignments", "Assignments", FileText],
        ["resources", "Resources", FolderOpen],
      ].map(([path, label, Icon]) => {
        const I = Icon as typeof LayoutDashboard;
        return (
          <NavLink
            key={String(path)}
            end
            state={fromAdmin ? { fromAdmin: true } : undefined}
            to={`/courses/${courseId}${path ? "/" + path : ""}`}
          >
            <I size={18} />
            {String(label)}
          </NavLink>
        );
      })}
    </nav>
  );
}
export function CourseLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const enteredFromAdmin = useRef(location.state?.fromAdmin === true);
  const navigate = useNavigate();
  if (typeof location.state?.fromAdmin === "boolean") {
    enteredFromAdmin.current = location.state.fromAdmin;
  }
  useEffect(() => {
    if (enteredFromAdmin.current && location.state?.fromAdmin !== true) {
      navigate(location.pathname + location.search, {
        replace: true,
        state: { ...location.state, fromAdmin: true },
      });
    }
  }, [location.pathname, location.search, location.state, navigate]);
  const { courseId = "" } = useParams();
  const quizDetail = useMatch("/courses/:courseId/quizzes/:quizId");
  const assignmentDetail = useMatch(
    "/courses/:courseId/assignments/:assignmentId",
  );
  const result = useData(() => api.course(courseId), [courseId]);
  if (!result.data) return <State {...result} />;
  const fromAdmin =
    user?.systemRole === "admin" &&
    (enteredFromAdmin.current ||
      location.state?.fromAdmin === true ||
      result.data.role === null);
  const backState = fromAdmin ? { fromAdmin: true } : undefined;
  return (
    <>
      <div className="course-breadcrumb">
        {quizDetail ? (
          <Link
            to={`/courses/${encodeURIComponent(courseId)}/quizzes`}
            state={backState}
          >
            ← Quizzes
          </Link>
        ) : assignmentDetail ? (
          <Link
            to={`/courses/${encodeURIComponent(courseId)}/assignments`}
            state={backState}
          >
            ← Assignments
          </Link>
        ) : fromAdmin ? (
          <Link to="/admin?tab=courses">← Back to administration</Link>
        ) : (
          <Link to="/courses">← My courses</Link>
        )}
        <span className="pill">
          {fromAdmin ? "Admin · read-only" : result.data.role}
        </span>
      </div>
      <div className="course-heading">
        <h1>
          {result.data.code} · {result.data.name}
        </h1>
      </div>
      <CourseNav fromAdmin={fromAdmin} />
      {fromAdmin && (
        <p className="notice">
          Read-only administrator view. Use the course workspace as an
          instructor to manage teaching content.
        </p>
      )}
      <Outlet context={{ ...result.data, readOnly: fromAdmin }} />
    </>
  );
}
export const useCourse = () =>
  useOutletContext<Course & { readOnly?: boolean }>();

export function AdminLayout() {
  const { user, logout } = useAuth();
  if (user?.systemRole !== "admin")
    return (
      <div className="admin-workspace">
        <main>
          <h1>Administrator access required</h1>
          <Link to="/courses">Return to courses</Link>
        </main>
      </div>
    );
  return (
    <div className="admin-workspace">
      <header className="admin-header">
        <Link to="/admin">
          <Brand />
        </Link>
        <span className="pill">Administration</span>
        <nav>
          <Link to="/courses">Course workspace ↗</Link>
          <Button
            variant="ghost"
            onClick={() => void logout().catch((e) => alert(e.message))}
          >
            Sign out
          </Button>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
