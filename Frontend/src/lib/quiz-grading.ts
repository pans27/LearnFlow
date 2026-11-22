import type { Question } from "@/types";

export function readQuestionMarks(questions: Question[], data: FormData) {
  const marks: Record<string, number> = {};
  questions.forEach((question, index) => {
    const value = data.get(question.id);
    if (typeof value !== "string" || !value.trim()) return;
    const mark = Number(value);
    const max = question.points ?? 1;
    if (!Number.isFinite(mark) || mark < 0 || mark > max) {
      throw new Error(
        `Question ${index + 1}: enter a score between 0 and ${max}.`,
      );
    }
    if (Math.abs(mark * 100 - Math.round(mark * 100)) > 0.000001) {
      throw new Error(
        `Question ${index + 1}: use no more than two decimal places.`,
      );
    }
    marks[question.id] = mark;
  });
  return marks;
}
