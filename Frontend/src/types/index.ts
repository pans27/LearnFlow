export type CourseRole = "student" | "instructor";
export interface User {
  id: string;
  name: string;
  email: string;
  systemRole: "user" | "admin";
  mustChangePassword?: boolean;
}
export interface Course {
  id: string;
  code: string;
  name: string;
  description: string;
  role: CourseRole | null;
  status: "active" | "archived";
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: string;
}
export type QuestionKind = "single_choice" | "multiple_choice" | "short_answer";
export interface Question {
  id: string;
  prompt: string;
  options: string[];
  kind?: QuestionKind;
  points?: number;
}
export type QuizQuestionInput = Question & { correctOptions?: string[] };
export interface Quiz {
  id: string;
  title: string;
  dueAt: string;
  questions: Question[];
  releaseGrades?: "manual" | "automatic";
}
export type ResourceType =
  "instructor_material" | "student_note" | "assignment_file";
export interface ResourceUpload {
  file: File;
  title: string;
  resourceType: Exclude<ResourceType, "assignment_file">;
}
export interface ResourceMatch {
  resource: Resource;
  matches: { page: number; snippet: string }[];
}
export interface Resource {
  id: string;
  name: string;
  description: string;
  status: "pending" | "processing" | "ready" | "failed" | "listed";
  resourceType?: ResourceType;
  demoFile?: { url: string; name: string; previewable: boolean };
  createdAt?: string;
}
export type Answers = Record<string, string | string[]>;
export interface Submission {
  id: string;
  submittedAt: string;
  status: "submitted";
  feedback?: string;
  score?: { earned: number; possible: number; manualPending: number };
}
export interface QuizSubmissionRecord extends Submission {
  studentId: string;
  studentName: string;
  answers: Answers;
  marks: Record<string, number>;
  published: boolean;
}
export interface Assessment {
  id: string;
  title: string;
  kind: "assignment" | "quiz" | "exam";
  dueAt: string;
  quizId?: string;
  description: string;
}
export interface Dashboard {
  announcements: Announcement[];
  upcomingAssessments: Assessment[];
  recentResources: Resource[];
}
export interface ApiErrorBody {
  error: { code: string; message: string };
}
export interface LearnFlowApi {
  me(): Promise<User>;
  login(input: { email: string; password: string }): Promise<User>;
  logout(): Promise<void>;
  courses(): Promise<Course[]>;
  course(id: string): Promise<Course>;
  dashboard(id: string): Promise<Dashboard>;
  announcements(id: string): Promise<Announcement[]>;
  createAnnouncement(
    id: string,
    input: { title: string; body: string },
  ): Promise<Announcement>;
  quizzes(id: string): Promise<Quiz[]>;
  createQuiz(
    id: string,
    input: Omit<Quiz, "id" | "questions"> & { questions: QuizQuestionInput[] },
  ): Promise<Quiz>;
  draft(id: string, quizId: string): Promise<Answers>;
  saveDraft(id: string, quizId: string, answers: Answers): Promise<void>;
  submit(id: string, quizId: string, answers: Answers): Promise<Submission>;
  resources(id: string, q?: string): Promise<Resource[]>;
  searchResources(id: string, query: string): Promise<ResourceMatch[]>;
  upload(id: string, input: ResourceUpload): Promise<Resource>;
  adminUsers(): Promise<User[]>;
}

export interface AdminCourse {
  id: string;
  code: string;
  name: string;
  description: string;
  status: "active" | "archived";
}
export interface Enrollment {
  courseId: string;
  userId: string;
  role: CourseRole;
}
