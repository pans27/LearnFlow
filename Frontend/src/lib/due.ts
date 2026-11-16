export function getDueStatus(dueAt: string, now: number = Date.now()) {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due))
    return { tone: "unknown", label: "Due date unavailable" };
  const remaining = due - now;
  if (remaining <= 0) return { tone: "urgent", label: "Past due" };
  if (remaining <= 72 * 60 * 60 * 1000) {
    const hours = Math.ceil(remaining / (60 * 60 * 1000));
    return {
      tone: "urgent",
      label:
        hours <= 1
          ? "Due within 1 hour"
          : hours < 24
            ? `Due in ${hours} hours`
            : `Due in ${Math.ceil(hours / 24)} days`,
    };
  }
  return { tone: "normal", label: "Scheduled" };
}
