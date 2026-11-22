import { request, ApiError } from "./http";
import { validateBackendResourceFile } from "@/lib/resource-files";
export interface Assignment {
  id: number;
  courseId: number;
  title: string;
  description: string | null;
  dueAt: string | null;
  isVisible: boolean;
  allowResubmission: boolean;
  gradesVisible: boolean;
  maxMark: number;
}
export interface AssignmentSubmission {
  id: number;
  studentId: number;
  originalFilename: string;
  submittedAt: string;
  mark: number | null;
  student: { id: number; name: string; email: string };
}
export type AssignmentInput = Pick<
  Assignment,
  | "title"
  | "description"
  | "dueAt"
  | "isVisible"
  | "allowResubmission"
  | "maxMark"
>;
const path = (course: string, id?: string | number) =>
  `/courses/${encodeURIComponent(course)}/assignments${id === undefined ? "" : "/" + encodeURIComponent(id)}`;
export const assignmentsApi = {
  remove: (course: string, id: number) =>
    request<void>(path(course, id), "DELETE"),
  list: (course: string) => request<Assignment[]>(path(course)),
  get: (course: string, id: string | number) =>
    request<Assignment>(path(course, id)),
  create: (course: string, input: AssignmentInput) =>
    request<Assignment>(path(course), "POST", {
      ...input,
      isVisible: false,
      gradesVisible: false,
    }),
  update: (course: string, id: number, input: Partial<AssignmentInput>) =>
    request<Assignment>(path(course, id), "PATCH", input),
  publishAssignment: (course: string, id: number) =>
    request<Assignment>(path(course, id), "PATCH", { isVisible: true }),
  async mine(course: string, id: string | number) {
    try {
      return await request<AssignmentSubmission>(
        path(course, id) + "/submissions/me",
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 404 &&
        error.message === "Submission not found"
      )
        return null;
      throw error;
    }
  },
  submissions: (course: string, id: number) =>
    request<AssignmentSubmission[]>(path(course, id) + "/submissions"),
  async submit(course: string, id: number, file: File) {
    validateBackendResourceFile(file);
    const data = new FormData();
    data.append("file", file);
    return request<AssignmentSubmission>(
      path(course, id) + "/submissions",
      "POST",
      data,
    );
  },
  async grade(
    course: string,
    assignment: Assignment,
    submission: number,
    value: string,
  ) {
    const mark = Number(value);
    if (
      !value.trim() ||
      !Number.isFinite(mark) ||
      mark < 0 ||
      mark > assignment.maxMark
    )
      throw new Error(`Enter a score between 0 and ${assignment.maxMark}.`);
    return request<AssignmentSubmission>(
      path(course, assignment.id) + `/submissions/${submission}`,
      "PATCH",
      { mark },
    );
  },
  async publish(course: string, assignment: Assignment) {
    const submissions = await assignmentsApi.submissions(course, assignment.id);
    if (!submissions.length)
      throw new Error("There are no submissions to publish.");
    if (submissions.some((row) => row.mark === null))
      throw new Error(
        "Save a score for every submission before publishing grades.",
      );
    return request<Assignment>(path(course, assignment.id), "PATCH", {
      gradesVisible: true,
    });
  },
  async preview(course: string, id: number, submission: number) {
    const result = await request<{ url: string; expiresAt: string }>(
      path(course, id) + `/submissions/${submission}/preview`,
    );
    if (new URL(result.url).protocol !== "https:")
      throw new Error("The preview link is invalid.");
    return result.url;
  },
  async download(course: string, id: number, submission: number) {
    const result = await request<{ url: string; expiresAt: string }>(
      path(course, id) + `/submissions/${submission}/download`,
    );
    if (new URL(result.url).protocol !== "https:")
      throw new Error("The download link is invalid.");
    return result.url;
  },
};
