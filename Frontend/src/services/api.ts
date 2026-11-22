import type {
  LearnFlowApi,
  Resource,
  ResourceMatch,
  User,
  Course,
  Dashboard,
  Announcement,
} from "@/types";
import { liveQuizzes } from "./quizzes";
import { mockApi } from "./mock";
import { request } from "./http";
export { request, ApiError } from "./http";
const c = (id: string) => `/courses/${encodeURIComponent(id)}`;
type ApiResource = {
  id: number | string;
  title: string;
  resourceType: Resource["resourceType"];
  ownerId?: number;
  visibility?: "visible" | "hidden";
  createdAt?: string;
  extractionStatus: "pending" | "processing" | "completed" | "failed";
};
function resourceFromApi(resource: ApiResource): Resource {
  return {
    id: String(resource.id),
    name: resource.title,
    visibility: resource.visibility,
    ownerId:
      resource.ownerId === undefined ? undefined : String(resource.ownerId),
    createdAt: resource.createdAt,
    description: "",
    resourceType: resource.resourceType,
    status:
      resource.extractionStatus === "completed"
        ? "ready"
        : resource.extractionStatus,
  };
}
export type BackendUser = {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
};
export function userFromApi(user: BackendUser): User {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    systemRole: user.isAdmin ? "admin" : "user",
    mustChangePassword: user.mustChangePassword,
  };
}
type BackendCourse = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: Course["status"];
  role: Course["role"];
};
function courseFromApi(course: BackendCourse): Course {
  return {
    ...course,
    id: String(course.id),
    code: course.courseCode,
    description: course.description ?? "",
  };
}
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  await request<void>("/auth/change-password", "POST", input);
}
type BackendAnnouncement = Omit<Announcement, "id" | "author"> & {
  id: number;
  authorId: number;
};
export function announcementFromApi(item: BackendAnnouncement): Announcement {
  return {
    id: String(item.id),
    title: item.title,
    body: item.body,
    createdAt: item.createdAt,
    isVisible: item.isVisible,
    author: "",
  };
}
export function deleteResource(courseId: string, resourceId: string) {
  return request<void>(
    c(courseId) + "/resources/" + encodeURIComponent(resourceId),
    "DELETE",
  );
}
export async function resourceFileUrl(
  courseId: string,
  resourceId: string,
  action: "preview" | "download",
) {
  const result = await request<{ url: string; expiresAt: string }>(
    c(courseId) + "/resources/" + encodeURIComponent(resourceId) + "/" + action,
  );
  const url = new URL(result.url);
  if (url.protocol !== "https:")
    throw new Error("The file link is invalid. Please try again.");
  return result;
}
export const httpApi: LearnFlowApi = {
  me: async () => userFromApi(await request<BackendUser>("/auth/me")),
  login: async (input) =>
    userFromApi(await request<BackendUser>("/auth/login", "POST", input)),
  logout: () => request("/auth/logout", "POST"),
  courses: async () =>
    (await request<BackendCourse[]>("/courses")).map(courseFromApi),
  course: async (id) => courseFromApi(await request<BackendCourse>(c(id))),
  dashboard: async (id) => {
    const data = await request<{
      recentAnnouncements: {
        id: number;
        title: string;
        body: string;
        createdAt: string;
      }[];
      upcomingAssessments: {
        id: number;
        title: string;
        type: "assignment" | "quiz";
        dueAt: string;
        submissionStatus?: string;
      }[];
      recentResources: (ApiResource & { description?: string })[];
    }>(c(id) + "/dashboard");
    return {
      announcements: data.recentAnnouncements.map((item) => ({
        ...item,
        id: String(item.id),
        author: "",
      })),
      upcomingAssessments: data.upcomingAssessments.map((item) => ({
        ...item,
        id: String(item.id),
        kind: item.type,
        quizId: item.type === "quiz" ? String(item.id) : undefined,
        assignmentId: item.type === "assignment" ? String(item.id) : undefined,
        description: "",
      })),
      recentResources: data.recentResources.map(resourceFromApi),
    } satisfies Dashboard;
  },
  announcements: async (id) => {
    const items: Announcement[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    do {
      const query =
        "?limit=100" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      let next: string | null = null;
      const page = await request<BackendAnnouncement[]>(
        c(id) + "/announcements" + query,
        "GET",
        undefined,
        (response) => {
          next = response.headers.get("X-Next-Cursor");
        },
      );
      items.push(...page.map(announcementFromApi));
      cursor = next;
      if (cursor && seen.has(cursor))
        throw new Error("Invalid announcement pagination. Please retry.");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return items;
  },
  createAnnouncement: async (id, input) =>
    announcementFromApi(
      await request<BackendAnnouncement>(
        c(id) + "/announcements",
        "POST",
        input,
      ),
    ),
  updateAnnouncement: async (id, announcementId, input) =>
    announcementFromApi(
      await request<BackendAnnouncement>(
        c(id) + "/announcements/" + encodeURIComponent(announcementId),
        "PATCH",
        input,
      ),
    ),
  deleteAnnouncement: (id, announcementId) =>
    request(
      c(id) + "/announcements/" + encodeURIComponent(announcementId),
      "DELETE",
    ),
  quizzes: liveQuizzes.list,
  createQuiz: liveQuizzes.create,
  draft: liveQuizzes.draft,
  saveDraft: liveQuizzes.saveDraft,
  submit: liveQuizzes.submit,
  resources: async (id) =>
    (await request<ApiResource[]>(c(id) + "/resources")).map(resourceFromApi),
  searchResources: async (id, query) => {
    const results = await request<
      { resource: ApiResource; matches: ResourceMatch["matches"] }[]
    >(c(id) + "/resources/search?q=" + encodeURIComponent(query));
    return results.map(({ resource, matches }) => ({
      resource: resourceFromApi(resource),
      matches,
    }));
  },
  upload: async (id, { file, title, resourceType, visibility }) => {
    const data = new FormData();
    data.append("file", file);
    data.append("title", title);
    data.append("resourceType", resourceType);
    if (visibility) data.append("visibility", visibility);
    return resourceFromApi(
      await request<ApiResource>(c(id) + "/resources", "POST", data),
    );
  },
  adminUsers: async () =>
    (await request<BackendUser[]>("/admin/users")).map(userFromApi),
};
export const isMock = import.meta.env.VITE_USE_MOCK !== "false";
export const api: LearnFlowApi = isMock ? mockApi : httpApi;
