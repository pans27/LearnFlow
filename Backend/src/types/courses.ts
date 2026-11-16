import type { CourseRole } from './enrollments';

// Course request bodies, validated data, database records, and responses.
export type CourseStatus = 'active' | 'archived';

// Raw course fields are optional because request data may be incomplete.
export type CourseBody = {
  name?: string;
  courseCode?: string;
  description?: string | null;
};

export type CourseStatusBody = {
  status?: string;
};

export type CourseCreateData = {
  name: string;
  courseCode?: string;
  description?: string | null;
};

export type CourseUpdateData = {
  name?: string;
  courseCode?: string;
  description?: string | null;
};

export type CourseInsertData = {
  name: string;
  courseCode: string;
  description?: string | null;
};

export type CourseSaveData = {
  name?: string;
  courseCode?: string;
  description?: string | null;
  status?: CourseStatus;
};

export type CourseRecord = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: string;
};

export type LockedCourse = {
  id: number;
  status: string;
};

export type CourseLockRow = {
  course_id: number;
  status: string;
};

export type CourseResponse = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: string;
};

export type AccessibleCourseResponse = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: string;
  role: CourseRole | null;
};

export type CourseAccessRecord = {
  id: number;
  name: string;
  courseCode: string;
  description: string | null;
  status: string;
  enrollments: { role: string }[];
};
