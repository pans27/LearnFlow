import { request } from "./http";
import type {
  Answers,
  Quiz,
  QuizQuestionInput,
  QuizSubmissionRecord,
} from "@/types";
const path = (course: string, quiz?: string) =>
  `/courses/${encodeURIComponent(course)}/quizzes${quiz ? "/" + encodeURIComponent(quiz) : ""}`;
export type BackendQuiz = {
  id: number;
  title: string;
  dueAt: string | null;
  opensAt: string | null;
  status: "draft" | "published" | "closed";
  showResults: boolean;
  maxAttempts?: number;
  isVisible?: boolean;
  questions?: {
    id: number;
    type: string;
    prompt: string;
    options: string[] | null;
    allowMultiple: boolean;
    points: number;
    answerKey?: string | string[] | null;
  }[];
};
type Attempt = {
  attemptNumber?: number;
  id: number;
  studentId: number;
  student: { name: string };
  status: string;
  answers: Answers;
  submittedAt: string | null;
  score: number | null;
  feedback: string | null;
  questionMarks: Record<string, { mark: number; source: string }> | null;
};
export function quizFromApi(item: BackendQuiz): Quiz {
  return {
    id: String(item.id),
    maxAttempts: item.maxAttempts ?? 1,
    title: item.title,
    dueAt: item.dueAt ?? "",
    opensAt: item.opensAt,
    status: item.status,
    isVisible: item.isVisible,
    showResults: item.showResults,
    releaseGrades: item.showResults ? "automatic" : "manual",
    questions: (item.questions ?? []).map((q) => ({
      id: String(q.id),
      correctOptions: Array.isArray(q.answerKey) ? q.answerKey : undefined,
      prompt: q.prompt,
      points: q.points,
      options: q.options ?? [],
      kind:
        q.type === "short_answer"
          ? "short_answer"
          : q.allowMultiple
            ? "multiple_choice"
            : "single_choice",
    })),
  };
}
function normalizeAnswers(
  quiz: Quiz,
  answers: Answers,
  outgoing: boolean,
): Answers {
  return Object.fromEntries(
    Object.entries(answers).map(([id, answer]) => {
      const kind = quiz.questions.find((q) => q.id === id)?.kind;
      return [
        id,
        kind === "single_choice"
          ? outgoing
            ? Array.isArray(answer)
              ? answer
              : answer
                ? [answer]
                : []
            : Array.isArray(answer)
              ? (answer[0] ?? "")
              : answer
          : answer,
      ];
    }),
  );
}
function recordFromApi(quiz: Quiz, attempt: Attempt): QuizSubmissionRecord {
  const possible = quiz.questions.reduce((sum, q) => sum + (q.points ?? 1), 0);
  return {
    id: String(attempt.id),
    attemptNumber: attempt.attemptNumber ?? 1,
    attemptState: attempt.status,
    studentId: String(attempt.studentId),
    studentName: attempt.student.name,
    status: "submitted",
    submittedAt: attempt.submittedAt ?? "",
    answers: normalizeAnswers(quiz, attempt.answers, false),
    marks: Object.fromEntries(
      Object.entries(attempt.questionMarks ?? {}).map(([id, value]) => [
        id,
        value.mark,
      ]),
    ),
    published: quiz.showResults === true && attempt.score !== null,
    feedback: attempt.feedback ?? undefined,
    score:
      attempt.score === null
        ? undefined
        : { earned: attempt.score, possible, manualPending: 0 },
  };
}
export const liveQuizzes = {
  removeQuestion: (course: string, id: string, question: string) =>
    request<void>(
      path(course, id) + "/questions/" + encodeURIComponent(question),
      "DELETE",
    ),
  remove: (course: string, id: string) =>
    request<void>(path(course, id), "DELETE"),
  async list(course: string) {
    const rows = await request<BackendQuiz[]>(path(course));
    return Promise.all(
      rows.map((row) => liveQuizzes.get(course, String(row.id))),
    );
  },
  async get(course: string, id: string) {
    return quizFromApi(await request<BackendQuiz>(path(course, id)));
  },
  async create(
    course: string,
    input: Omit<Quiz, "id" | "questions"> & { questions: QuizQuestionInput[] },
  ) {
    if (!input.questions.length || input.questions.length > 100)
      throw new Error("Provide between 1 and 100 questions.");
    const row = await request<BackendQuiz>(path(course), "POST", {
      title: input.title,
      dueAt: input.dueAt,
      status: "draft",
      maxAttempts: input.maxAttempts ?? 1,
      isVisible: false,
      showResults:
        input.releaseGrades === "automatic" &&
        !input.questions.some((q) => q.kind === "short_answer"),
    });
    try {
      for (const q of input.questions)
        await request(path(course, String(row.id)) + "/questions", "POST", {
          type: q.kind === "short_answer" ? "short_answer" : "multiple_choice",
          prompt: q.prompt,
          points: q.points ?? 1,
          options: q.kind === "short_answer" ? null : q.options,
          answerKey: q.kind === "short_answer" ? null : q.correctOptions,
          allowMultiple: q.kind === "multiple_choice",
        });
      return await liveQuizzes.get(course, String(row.id));
    } catch (error) {
      try {
        await request(path(course, String(row.id)), "DELETE");
      } catch {
        throw new Error(
          `Quiz ${row.id} was saved as an incomplete draft. Please contact your course administrator before retrying. ${(error as Error).message}`,
        );
      }
      throw error;
    }
  },
  async publishQuiz(course: string, id: string) {
    return quizFromApi(
      await request<BackendQuiz>(path(course, id), "PATCH", {
        status: "published",
        isVisible: true,
      }),
    );
  },
  async updateDraft(
    course: string,
    quiz: Quiz,
    input: Omit<Quiz, "id" | "questions"> & { questions: QuizQuestionInput[] },
  ) {
    if (quiz.status !== "draft")
      throw new Error("Only draft quizzes can be edited here.");
    await request(path(course, quiz.id), "PATCH", {
      title: input.title,
      dueAt: input.dueAt,
      maxAttempts: input.maxAttempts ?? 1,
      showResults:
        input.releaseGrades === "automatic" &&
        !input.questions.some((q) => q.kind === "short_answer"),
    });
    for (const q of input.questions) {
      const existing = quiz.questions.some((item) => item.id === q.id);
      await request(
        path(course, quiz.id) +
          "/questions" +
          (existing ? "/" + encodeURIComponent(q.id) : ""),
        existing ? "PATCH" : "POST",
        {
          type: q.kind === "short_answer" ? "short_answer" : "multiple_choice",
          prompt: q.prompt,
          points: q.points ?? 1,
          options: q.kind === "short_answer" ? null : q.options,
          answerKey: q.kind === "short_answer" ? null : q.correctOptions,
          allowMultiple: q.kind === "multiple_choice",
        },
      );
    }
    for (const q of quiz.questions)
      if (!input.questions.some((item) => item.id === q.id))
        await liveQuizzes.removeQuestion(course, quiz.id, q.id);
    return liveQuizzes.get(course, quiz.id);
  },
  async attempts(course: string, quiz: Quiz) {
    return (
      await request<Attempt[]>(path(course, quiz.id) + "/submissions/me")
    ).map((row) => recordFromApi(quiz, row));
  },
  async draft(course: string, id: string): Promise<Answers> {
    const quiz = await liveQuizzes.get(course, id);
    const row = await request<Attempt | null>(path(course, id) + "/draft");
    return normalizeAnswers(quiz, row?.answers ?? {}, false);
  },
  async saveDraft(course: string, id: string, answers: Answers) {
    const quiz = await liveQuizzes.get(course, id);
    await request(path(course, id) + "/draft", "PUT", {
      answers: normalizeAnswers(quiz, answers, true),
    });
  },
  async submit(course: string, id: string, answers: Answers) {
    const quiz = await liveQuizzes.get(course, id);
    return recordFromApi(
      quiz,
      await request<Attempt>(path(course, id) + "/submissions", "POST", {
        answers: normalizeAnswers(quiz, answers, true),
      }),
    );
  },
  async mine(course: string, quiz: Quiz) {
    const rows = await request<Attempt[]>(
      path(course, quiz.id) + "/submissions/me",
    );
    const row = rows.find((attempt) => attempt.status !== "draft");
    return row ? recordFromApi(quiz, row) : null;
  },
  async submissions(course: string, quiz: Quiz) {
    return (
      await request<Attempt[]>(path(course, quiz.id) + "/submissions")
    ).map((row) => recordFromApi(quiz, row));
  },
  async grade(
    course: string,
    quiz: Quiz,
    id: string,
    marks: Record<string, number>,
    feedback: string,
  ) {
    const grades = Object.entries(marks).map(([questionId, mark]) => ({
      questionId: Number(questionId),
      mark,
    }));
    if (!grades.length)
      throw new Error("Enter at least one question score before saving.");
    await request(
      path(course, quiz.id) + `/submissions/${encodeURIComponent(id)}/grade`,
      "PATCH",
      { grades, feedback: feedback.trim() || null },
    );
  },
  async publish(course: string, quiz: Quiz) {
    const records = await liveQuizzes.submissions(course, quiz);
    if (!records.length)
      throw new Error("There are no submissions to publish.");
    if (
      records.some((record) =>
        quiz.questions.some((q) => record.marks[q.id] === undefined),
      )
    )
      throw new Error(
        "Save scores for every question in every submission before publishing grades.",
      );
    await request(path(course, quiz.id), "PATCH", { showResults: true });
  },
};
