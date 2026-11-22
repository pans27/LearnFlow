import { courseErrorMessage } from "@/lib/course-errors";
const base = import.meta.env.VITE_API_BASE_URL || "/api";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
  onResponse?: (response: Response) => void,
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
    const message =
      data?.error?.message ??
      data?.message ??
      `Request failed (${response.status})`;
    throw new ApiError(
      response.status,
      courseErrorMessage(response.status, message, path, method),
    );
  }
  onResponse?.(response);
  return response.status === 204 ? (undefined as T) : response.json();
}
