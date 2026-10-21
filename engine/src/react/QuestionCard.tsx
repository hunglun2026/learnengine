// 題目卡片。四種題型共用一個元件，之後新增題型只改這裡，
// 各專案不必各自寫一套作答介面。
import type { AnswerRecord, PublicQuestion, Question } from "../types.ts";

export interface QuestionCardProps {
  index: number;
  question: PublicQuestion;
  /** 這一題目前填的內容 */
  value: number[] | string | undefined;
  onChange: (value: number[] | string) => void;
  disabled?: boolean;
  /** 交卷後才有：伺服器判的結果 */
  record?: AnswerRecord;
  /** 交卷後才有：正解與解析 */
  revealed?: Question;
}

const TYPE_LABEL: Record<PublicQuestion["type"], string> = {
  single: "單選",
  multiple: "複選",
  fill: "填充",
  short: "簡答",
};

export function QuestionCard({
  index,
  question,
  value,
  onChange,
  disabled,
  record,
  revealed,
}: QuestionCardProps) {
  const selected = Array.isArray(value) ? value : [];
  const text = typeof value === "string" ? value : "";

  const toggle = (i: number) => {
    if (disabled) return;
    if (question.type === "single") {
      onChange([i]);
    } else {
      onChange(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i]);
    }
  };

  const correctSet = new Set(
    revealed && (revealed.type === "single" || revealed.type === "multiple")
      ? (revealed.answer as number[])
      : []
  );

  return (
    <section className={`q-card${record ? (record.isCorrect ? " is-correct" : " is-wrong") : ""}`}>
      <header className="q-head">
        <span className="q-no">第 {index + 1} 題</span>
        <span className="q-type">{TYPE_LABEL[question.type]}</span>
        <span className="q-score">{question.score} 分</span>
        {record && <span className="q-mark">{record.isCorrect ? "✓ 答對" : "✗ 答錯"}</span>}
      </header>

      <p className="q-text">{question.text}</p>

      {question.options.length > 0 ? (
        <ul className="q-options">
          {question.options.map((opt, i) => {
            const picked = selected.includes(i);
            const isAnswer = revealed ? correctSet.has(i) : false;
            return (
              <li key={i}>
                <button
                  type="button"
                  className={`q-opt${picked ? " picked" : ""}${revealed && isAnswer ? " answer" : ""}`}
                  onClick={() => toggle(i)}
                  disabled={disabled}
                >
                  <span className="q-opt-key">{String.fromCharCode(65 + i)}</span>
                  <span>{opt}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <input
          className="q-input"
          type="text"
          value={text}
          placeholder="在這裡作答"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {revealed && (
        <div className="q-reveal">
          <div>
            <strong>正解：</strong>
            {revealed.type === "single" || revealed.type === "multiple"
              ? (revealed.answer as number[])
                  .slice()
                  .sort((a, b) => a - b)
                  .map((i) => String.fromCharCode(65 + i))
                  .join("")
              : (revealed.answer as string[]).join(" / ")}
          </div>
          {revealed.explanation && <p className="q-exp">{revealed.explanation}</p>}
        </div>
      )}
    </section>
  );
}
