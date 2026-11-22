import type { Quiz } from "@/types";
const kindLabels = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  short_answer: "Short answer",
};
export function QuizPreview({ quiz }: { quiz: Quiz }) {
  return (
    <details className="panel quiz-preview" open>
      <summary>
        Quiz preview · {quiz.questions.length}{" "}
        {quiz.questions.length === 1 ? "question" : "questions"}
      </summary>
      <p className="quiz-preview-note">
        Instructor preview. Correct answers are marked below and are not shown
        to students.
      </p>
      {quiz.questions.map((question, index) => (
        <article className="question quiz-preview-question" key={question.id}>
          <h2 className="quiz-question-heading">
            {index + 1}. {question.prompt}
          </h2>
          <p className="quiz-question-meta">
            {kindLabels[question.kind ?? "single_choice"]} ·{" "}
            {question.points ?? 1}{" "}
            {(question.points ?? 1) === 1 ? "point" : "points"}
          </p>
          {question.kind === "short_answer" ? (
            <div className="quiz-preview-short">
              Short answer · manually graded
            </div>
          ) : (
            question.options.map((option) => {
              const correct = question.correctOptions?.includes(option);
              return (
                <div
                  className={`option quiz-preview-option ${correct ? "quiz-preview-correct" : ""}`}
                  key={option}
                >
                  <span
                    className={`quiz-preview-choice ${question.kind === "multiple_choice" ? "quiz-preview-multiple" : ""}`}
                    aria-hidden="true"
                  >
                    {correct ? "✓" : ""}
                  </span>
                  <span>{option}</span>
                  {correct && (
                    <span className="quiz-answer-key">Correct answer</span>
                  )}
                </div>
              );
            })
          )}
        </article>
      ))}
    </details>
  );
}
