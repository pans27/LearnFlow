import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { getDueStatus } from "@/lib/due";
export function DueDate({ dueAt }: { dueAt: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const { tone, label } = getDueStatus(dueAt, now);
  const valid = Number.isFinite(Date.parse(dueAt));
  return (
    <div className={`due-date due-${tone}`}>
      <span className="due-date-value">
        <Clock size={16} aria-hidden="true" />
        {valid ? (
          <time dateTime={dueAt}>
            Due{" "}
            {new Date(dueAt).toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </time>
        ) : (
          label
        )}
      </span>
      {valid && <span className="due-status">{label}</span>}
    </div>
  );
}
