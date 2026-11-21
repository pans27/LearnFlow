import type { Prisma } from '../../generated/prisma/client';

export type QuizStatus = 'draft' | 'published' | 'closed';
export type QuizQuestionType = 'short_answer' | 'multiple_choice';
export type QuizData = {
  title: string;
  description?: string | null;
  opensAt?: Date | null;
  dueAt?: Date | null;
  isVisible: boolean;
  status: QuizStatus;
  maxAttempts: number;
  showResults: boolean;
};
export type QuizUpdateData = Partial<QuizData>;
export type QuizListOptions = {
  limit?: number;
  dueAfter?: Date;
  activeAt?: Date;
};
export type QuizBody = Omit<QuizUpdateData, 'opensAt' | 'dueAt'> & {
  opensAt?: string | null;
  dueAt?: string | null;
};
export type QuizQuestionData = {
  type: QuizQuestionType;
  prompt: string;
  options: string[] | null;
  answerKey: string | string[] | null;
  allowMultiple: boolean;
  points: number;
};
export type QuizAnswers = Record<string, string | string[]>;
export type QuizQuestionMark = { mark: number; source: 'auto' | 'manual' };
export type QuizQuestionMarks = Record<string, QuizQuestionMark>;
export type QuizGradeData = {
  grades: { questionId: number; mark: number }[];
  feedback?: string | null;
};
export type QuizRecord = {
  id: number; courseId: number; createdBy: number; title: string; description: string | null;
  opensAt: Date | null; dueAt: Date | null; isVisible: boolean; status: string;
  maxAttempts: number; showResults: boolean; createdAt: Date; updatedAt: Date;
};
export type QuizQuestionResponse = {
  id: number; position: number; type: string; prompt: string; options: string[] | null;
  allowMultiple: boolean; points: number; answerKey?: string | string[] | null;
};
export type QuizResponse = Omit<QuizRecord, 'opensAt' | 'dueAt' | 'createdAt' | 'updatedAt'> & {
  opensAt: string | null; dueAt: string | null; createdAt: string; updatedAt: string;
  questions?: QuizQuestionResponse[];
};
export type QuizSubmissionResponse = {
  id: number; courseId: number; quizId: number; studentId: number; attemptNumber: number;
  status: string; answers: QuizAnswers; score: number | null; questionMarks: QuizQuestionMarks | null;
  feedback: string | null; submittedAt: string | null; updatedAt: string;
  student: { id: number; name: string; email: string };
};

export type QuizQuestionRecord = {
  id: number; position: number; questionType: string; prompt: string; options: Prisma.JsonValue;
  answerKey: Prisma.JsonValue; allowMultiple: boolean; points: Prisma.Decimal;
};
export type QuizWithQuestions = QuizRecord & { questions: QuizQuestionRecord[] };
export type QuizAttemptRecord = {
  id: number; courseId: number; quizId: number; studentId: number; attemptNumber: number;
  status: string; draftAnswers: Prisma.JsonValue; questionMarks: Prisma.JsonValue;
  score: Prisma.Decimal | null; feedback: string | null; s3Key: string | null;
  submittedAt: Date | null; updatedAt: Date;
  student: { id: number; name: string; email: string };
};
