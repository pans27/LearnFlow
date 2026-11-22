import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
export function CourseFeedback({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  if (!children) return null;
  const Icon =
    tone === "error" ? AlertCircle : tone === "success" ? CheckCircle2 : Info;
  return (
    <div
      className={`course-feedback course-feedback-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function VisibilityBadge({
  visible,
  draft = false,
}: {
  visible: boolean;
  draft?: boolean;
}) {
  return (
    <span
      className={`course-visibility ${visible ? "course-visible" : "course-hidden"}`}
    >
      {draft
        ? "Draft · hidden from students"
        : visible
          ? "Visible to students"
          : "Hidden from students"}
    </span>
  );
}
