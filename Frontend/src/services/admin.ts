import { request, userFromApi, type BackendUser } from "./api";
import type { AdminCourse, CourseRole, Enrollment, User } from "@/types";

type BackendAdminCourse = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: AdminCourse["status"];
};
type BackendEnrollment = { courseId: number; userId: number; role: CourseRole };
export type UserInput = { name: string; email: string; isAdmin: boolean };
export type CourseInput = {
  name: string;
  courseCode: string;
  description: string;
};
export type CreatedAccount = { user: User; temporaryPassword: string };

function courseFromApi(course: BackendAdminCourse): AdminCourse {
  return {
    id: String(course.id),
    name: course.name,
    code: course.courseCode,
    description: course.description ?? "",
    status: course.status,
  };
}
function enrollmentFromApi(enrollment: BackendEnrollment): Enrollment {
  return {
    ...enrollment,
    courseId: String(enrollment.courseId),
    userId: String(enrollment.userId),
  };
}
const coursePath = (id: string) => `/admin/courses/${encodeURIComponent(id)}`;
const memberPath = (courseId: string, userId: string) =>
  `${coursePath(courseId)}/enrollments/${encodeURIComponent(userId)}`;

export const adminApi = {
  async users() {
    return (await request<BackendUser[]>("/admin/users")).map(userFromApi);
  },
  async createUser(input: UserInput): Promise<CreatedAccount> {
    const result = await request<{
      user: BackendUser;
      temporaryPassword: string;
    }>("/admin/users", "POST", input);
    return {
      user: userFromApi(result.user),
      temporaryPassword: result.temporaryPassword,
    };
  },
  async updateUser(id: string, input: { name: string; isAdmin: boolean }) {
    return userFromApi(
      await request<BackendUser>(
        `/admin/users/${encodeURIComponent(id)}`,
        "PATCH",
        input,
      ),
    );
  },
  async courses() {
    return (await request<BackendAdminCourse[]>("/admin/courses")).map(
      courseFromApi,
    );
  },
  async createCourse(input: CourseInput) {
    return courseFromApi(
      await request<BackendAdminCourse>("/admin/courses", "POST", input),
    );
  },
  async updateCourse(id: string, input: CourseInput) {
    return courseFromApi(
      await request<BackendAdminCourse>(coursePath(id), "PATCH", input),
    );
  },
  async setCourseStatus(id: string, status: AdminCourse["status"]) {
    return courseFromApi(
      await request<BackendAdminCourse>(`${coursePath(id)}/status`, "PATCH", {
        status,
      }),
    );
  },
  async enrollments(courseId: string) {
    return (
      await request<BackendEnrollment[]>(`${coursePath(courseId)}/enrollments`)
    ).map(enrollmentFromApi);
  },
  async enroll(courseId: string, userId: string, role: CourseRole) {
    const numericId = Number(userId);
    if (
      !Number.isInteger(numericId) ||
      numericId < 1 ||
      numericId > 2147483647
    ) {
      throw new Error("Choose a valid user.");
    }
    return enrollmentFromApi(
      await request<BackendEnrollment>(
        `${coursePath(courseId)}/enrollments`,
        "POST",
        { userId: numericId, role },
      ),
    );
  },
  async enrollMany(
    courseId: string,
    members: { userId: string; role: CourseRole }[],
  ) {
    if (!members.length || members.length > 100)
      throw new Error("Select between 1 and 100 users.");
    const enrollments = members.map((member) => {
      const userId = Number(member.userId);
      if (!Number.isInteger(userId) || userId < 1 || userId > 2147483647)
        throw new Error("Choose a valid user.");
      if (member.role !== "student" && member.role !== "instructor")
        throw new Error("Choose a valid course role.");
      return { userId, role: member.role };
    });
    if (
      new Set(enrollments.map((member) => member.userId)).size !==
      enrollments.length
    )
      throw new Error("Select each user only once.");
    return (
      await request<BackendEnrollment[]>(
        `${coursePath(courseId)}/enrollments/bulk`,
        "POST",
        { enrollments },
      )
    ).map(enrollmentFromApi);
  },
  async changeRole(courseId: string, userId: string, role: CourseRole) {
    return enrollmentFromApi(
      await request<BackendEnrollment>(memberPath(courseId, userId), "PATCH", {
        role,
      }),
    );
  },
  removeMember(courseId: string, userId: string) {
    return request<void>(memberPath(courseId, userId), "DELETE");
  },
};
