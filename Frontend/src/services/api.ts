import type { LearnFlowApi, Resource, ResourceMatch } from "@/types";
import { mockApi } from "./mock";
const base = import.meta.env.VITE_API_BASE_URL || "/api";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(base + path, {
    method,
    credentials: "include",
    headers: body && !form ? { "Content-Type": "application/json" } : undefined,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      data?.error?.message ??
        data?.message ??
        `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const c = (id: string) => `/courses/${encodeURIComponent(id)}`;
type ApiResource = {
  id: string;
  title: string;
  resourceType: Resource["resourceType"];
  createdAt?: string;
  extractionStatus: "pending" | "processing" | "completed" | "failed";
};
function resourceFromApi(resource: ApiResource): Resource {
  return {
    id: resource.id,
    name: resource.title,
    createdAt: resource.createdAt,
    description: "",
    resourceType: resource.resourceType,
    status:
      resource.extractionStatus === "completed"
        ? "ready"
        : resource.extractionStatus,
  };
}
export const httpApi: LearnFlowApi = {
  me: () => request("/auth/me"),
  login: (input) => request("/auth/login", "POST", input),
  logout: () => request("/auth/logout", "POST"),
  courses: () => request("/courses"),
  course: (id) => request(c(id)),
  dashboard: (id) => request(c(id) + "/dashboard"),
  announcements: (id) => request(c(id) + "/announcements"),
  createAnnouncement: (id, input) =>
    request(c(id) + "/announcements", "POST", input),
  quizzes: (id) => request(c(id) + "/quizzes"),
  createQuiz: (id, input) => request(c(id) + "/quizzes", "POST", input),
  draft: (id, q) => request(c(id) + `/quizzes/${encodeURIComponent(q)}/draft`),
  saveDraft: (id, q, answers) =>
    request(c(id) + `/quizzes/${encodeURIComponent(q)}/draft`, "PUT", {
      answers,
    }),
  submit: (id, q, answers) =>
    request(c(id) + `/quizzes/${encodeURIComponent(q)}/submissions`, "POST", {
      answers,
    }),
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
  upload: async (id, { file, title, resourceType }) => {
    const data = new FormData();
    data.append("file", file);
    data.append("title", title);
    data.append("resourceType", resourceType);
    return resourceFromApi(
      await request<ApiResource>(c(id) + "/resources", "POST", data),
    );
  },
  adminUsers: () => request("/admin/users"),
};
export const isMock = import.meta.env.VITE_USE_MOCK !== "false";
export const api: LearnFlowApi = isMock ? mockApi : httpApi;
