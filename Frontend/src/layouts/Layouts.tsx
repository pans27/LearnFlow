import { Brand } from "@/components/Brand";
import {
  Link,
  useMatch,
  NavLink,
  Outlet,
  useParams,
  useOutletContext,
} from "react-router-dom";
import {
  LayoutDashboard,
  Megaphone,
  ClipboardList,
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

function CourseNav() {
  const { courseId } = useParams();
  if (!courseId) return null;
  return (
    <nav className="course-tabs" aria-label="Course navigation">
      {[
        ["", "Overview", LayoutDashboard],
        ["announcements", "Announcements", Megaphone],
        ["quizzes", "Quizzes", ClipboardList],
        ["resources", "Resources", FolderOpen],
      ].map(([path, label, Icon]) => {
        const I = Icon as typeof LayoutDashboard;
        return (
          <NavLink
            key={String(path)}
            end
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
  const { courseId = "" } = useParams();
  const quizDetail = useMatch("/courses/:courseId/quizzes/:quizId");
  const result = useData(() => api.course(courseId), [courseId]);
  if (!result.data) return <State {...result} />;
  return (
    <>
      <div className="course-breadcrumb">
        {quizDetail ? (
          <Link to={`/courses/${encodeURIComponent(courseId)}/quizzes`}>
            ← Quizzes
          </Link>
        ) : (
          <Link to="/courses">← My courses</Link>
        )}
        <span className="pill">{result.data.role}</span>
      </div>
      <div className="course-heading">
        <h1>
          {result.data.code} · {result.data.name}
        </h1>
      </div>
      <CourseNav />
      <Outlet context={result.data} />
    </>
  );
}
export const useCourse = () => useOutletContext<Course>();

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
