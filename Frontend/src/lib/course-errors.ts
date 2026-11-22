export function courseErrorMessage(
  status: number,
  message: string,
  path: string,
  method: string,
) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403)
    return "You do not have permission to perform this action.";
  if (!path.startsWith("/courses/")) return message;
  if (status === 409 && /reactivate|archived/i.test(message))
    return "This course is archived. Restore it before making changes.";
  if (status === 409 && method === "DELETE") {
    if (/\/quizzes\/[^/]+\/questions\//.test(path))
      return "This question cannot be deleted because a student has already started the quiz or saved a draft.";
    if (/\/quizzes\//.test(path))
      return "This quiz cannot be deleted because a student has already started an attempt or saved a draft. Student records must be retained.";
    if (/\/assignments\//.test(path))
      return "This assignment cannot be deleted because students have already submitted work. Student records must be retained.";
  }
  return message;
}
