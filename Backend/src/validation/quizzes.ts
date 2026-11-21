import { HttpError } from '../errors';
import { id } from './admin';
import type { QuizData, QuizUpdateData, QuizQuestionData, QuizAnswers, QuizGradeData } from '../types';

// Require an object containing only the specified fields.
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Body must be a JSON object');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowed.includes(key))) throw new HttpError(400, 'Unknown body field');
  return result;
}

// Validate bounded text without accepting empty required values.
function text(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${field} must be nonempty text of at most ${max} characters`);
  return value.trim();
}

// Validate editable quiz metadata and instructor-controlled availability settings.
export function updateQuizBody(value: unknown): QuizUpdateData {
  const input = object(value, ['title', 'description', 'opensAt', 'dueAt', 'isVisible', 'status', 'maxAttempts', 'showResults']);
  if (!Object.keys(input).length) throw new HttpError(400, 'Body must contain at least one field');
  const data: QuizUpdateData = {};
  if ('title' in input) data.title = text(input.title, 200, 'title');
  if ('description' in input) data.description = input.description === null ? null : text(input.description, 20000, 'description');
  for (const key of ['opensAt', 'dueAt'] as const) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new HttpError(400, `${key} must be an ISO timestamp with timezone or null`);
    data[key] = value === null ? null : new Date(value as string);
  }
  for (const key of ['isVisible', 'showResults'] as const) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'boolean') throw new HttpError(400, `${key} must be boolean`);
    data[key] = input[key];
  }
  if ('maxAttempts' in input) {
    if (typeof input.maxAttempts !== 'number' || !Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > 2147483647) throw new HttpError(400, 'maxAttempts must be a positive int32 integer');
    data.maxAttempts = input.maxAttempts;
  }
  if ('status' in input) {
    if (!['draft', 'published', 'closed'].includes(input.status as string)) throw new HttpError(400, 'Invalid quiz status');
    data.status = input.status as QuizData['status'];
  }
  return data;
}

// Require a title and default new quizzes to hidden drafts with one attempt.
export function createQuizBody(value: unknown): QuizData {
  const data = updateQuizBody(value);
  if (!data.title) throw new HttpError(400, 'title is required');
  return { ...data, title: data.title, isVisible: data.isVisible ?? false, status: data.status ?? 'draft', maxAttempts: data.maxAttempts ?? 1, showResults: data.showResults ?? false };
}

// Validate a textbox or choice question and its optional private answer key.
export function quizQuestionBody(value: unknown): QuizQuestionData {
  const input = object(value, ['type', 'prompt', 'options', 'answerKey', 'allowMultiple', 'points']);
  if (input.type !== 'short_answer' && input.type !== 'multiple_choice') throw new HttpError(400, 'type must be short_answer or multiple_choice');
  const prompt = text(input.prompt, 20000, 'prompt');
  const points = input.points === undefined ? 1 : input.points;
  if (typeof points !== 'number' || !Number.isFinite(points) || points < 0 || points > 999999.99 || Math.abs(points * 100 - Math.round(points * 100)) > 0.000001) throw new HttpError(400, 'points must be between 0 and 999999.99 with at most two decimals');
  if (input.allowMultiple !== undefined && typeof input.allowMultiple !== 'boolean') throw new HttpError(400, 'allowMultiple must be boolean');
  const allowMultiple = input.allowMultiple ?? false;
  if (input.type === 'short_answer') {
    if (allowMultiple || (input.options !== undefined && input.options !== null)) throw new HttpError(400, 'Textbox questions cannot have choices or multiple selections');
    return { type: input.type, prompt, points, allowMultiple: false, options: null,
      answerKey: input.answerKey == null ? null : text(input.answerKey, 20000, 'answerKey') };
  }
  if (!Array.isArray(input.options) || input.options.length < 2 || input.options.length > 20) throw new HttpError(400, 'Provide between 2 and 20 unique options');
  const options = input.options.map((option) => text(option, 1000, 'option'));
  if (new Set(options).size !== options.length) throw new HttpError(400, 'Options must be unique');
  let answerKey: string[] | null = null;
  if (input.answerKey != null) {
    if (!Array.isArray(input.answerKey) || !input.answerKey.length || input.answerKey.some((answer) => typeof answer !== 'string' || !options.includes(answer)) || new Set(input.answerKey).size !== input.answerKey.length || (!allowMultiple && input.answerKey.length !== 1)) throw new HttpError(400, 'answerKey must contain valid unique options matching the selection mode');
    answerKey = input.answerKey;
  }
  return { type: input.type, prompt, options, answerKey, allowMultiple, points };
}

// Validate bounded question-to-answer mappings before checking them against quiz questions.
export function quizAnswersBody(value: unknown): QuizAnswers {
  const input = object(value, ['answers']);
  if (!input.answers || typeof input.answers !== 'object' || Array.isArray(input.answers)) throw new HttpError(400, 'answers must be an object');
  const answers = input.answers as Record<string, unknown>;
  if (Object.keys(answers).length > 100) throw new HttpError(400, 'Too many answers');
  const result: QuizAnswers = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (String(id(key)) !== key) throw new HttpError(400, 'Invalid question ID');
    if (typeof answer === 'string' && answer.length <= 20000) result[key] = answer;
    else if (Array.isArray(answer) && answer.length <= 20 && answer.every((item) => typeof item === 'string' && item.length <= 1000)) result[key] = answer;
    else throw new HttpError(400, 'Invalid answer');
  }
  return result;
}

// Validate explicit per-question manual marks and optional submission feedback.
export function quizGradeBody(value: unknown): QuizGradeData {
  const input = object(value, ['grades', 'feedback']);
  if (!Array.isArray(input.grades) || !input.grades.length || input.grades.length > 100) throw new HttpError(400, 'Provide between 1 and 100 question grades');
  const grades = input.grades.map((value) => {
    const grade = object(value, ['questionId', 'mark']);
    const questionId = id(grade.questionId);
    if (typeof grade.mark !== 'number' || !Number.isFinite(grade.mark) || grade.mark < 0 || grade.mark > 999999.99 || Math.abs(grade.mark * 100 - Math.round(grade.mark * 100)) > 0.000001) throw new HttpError(400, 'Invalid question mark');
    return { questionId, mark: grade.mark };
  });
  if (new Set(grades.map((grade) => grade.questionId)).size !== grades.length) throw new HttpError(400, 'Duplicate question grade');
  return { grades, ...('feedback' in input ? { feedback: input.feedback === null ? null : text(input.feedback, 20000, 'feedback') } : {}) };
}
