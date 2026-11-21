export type AssignmentBody = {
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  isVisible?: boolean;
  allowResubmission?: boolean;
  gradesVisible?: boolean;
  maxMark?: number;
};

export type AssignmentCreateData = {
  title: string;
  description?: string | null;
  dueAt?: Date | null;
  isVisible: boolean;
  allowResubmission: boolean;
  gradesVisible: boolean;
  maxMark: number;
};

export type AssignmentUpdateData = Partial<AssignmentCreateData>;

export type AssignmentListOptions = {
  limit?: number;
  dueAfter?: Date;
  includeUndated?: boolean;
};

export type AssignmentRecord = {
  id: number;
  courseId: number;
  createdBy: number;
  title: string;
  description: string | null;
  dueAt: Date | null;
  isVisible: boolean;
  allowResubmission: boolean;
  gradesVisible: boolean;
  maxMark: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AssignmentResponse = Omit<AssignmentRecord, 'dueAt' | 'createdAt' | 'updatedAt'> & {
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssignmentSubmissionRecord = {
  id: number;
  courseId: number;
  assignmentId: number;
  studentId: number;
  s3Key: string;
  originalFilename: string;
  submittedAt: Date;
  mark: number | null;
  student: { id: number; name: string; email: string };
};

export type AssignmentSubmissionResponse = Omit<AssignmentSubmissionRecord, 's3Key' | 'submittedAt'> & {
  submittedAt: string;
};

export type AssignmentSubmissionData = {
  s3Key: string;
  originalFilename: string;
};

export type AssignmentGradeBody = {
  mark?: number | null;
};

export type AssignmentGradeData = {
  mark: number | null;
};
