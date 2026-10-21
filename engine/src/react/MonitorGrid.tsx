// 老師端的即時監控牆：一列一個學生、一欄一題，格子顏色就是對錯。
// 這是這套引擎跟 Kahoot 最大的差別：不是全班卡在同一題，
// 老師要能一眼看出「誰卡住了」「哪一題整班都錯」。
import type { PublicQuestion, RoomState } from "../types.ts";
import { ranking } from "../room.ts";

export interface MonitorGridProps {
  state: RoomState;
  questions: PublicQuestion[];
  onKick?: (playerId: string) => void;
}

export function MonitorGrid({ state, questions, onKick }: MonitorGridProps) {
  const players = ranking(state);

  // 每一題的答對率，讓老師知道哪一題要回頭講
  const perQuestion = questions.map((q) => {
    let answered = 0;
    let correct = 0;
    for (const p of players) {
      const a = p.answers[q.id];
      if (a) {
        answered++;
        if (a.isCorrect) correct++;
      }
    }
    return { answered, correct, rate: answered ? correct / answered : 0 };
  });

  return (
    <div className="monitor">
      <table className="monitor-table">
        <thead>
          <tr>
            <th className="sticky-col">學生（{players.length}）</th>
            <th>分數</th>
            <th>進度</th>
            {questions.map((q, i) => (
              <th key={q.id} title={q.text}>
                {i + 1}
              </th>
            ))}
            {onKick && <th />}
          </tr>
          <tr className="rate-row">
            <th className="sticky-col">全班答對率</th>
            <th />
            <th />
            {perQuestion.map((s, i) => (
              <th key={i} className={s.answered && s.rate < 0.5 ? "low" : ""}>
                {s.answered ? `${Math.round(s.rate * 100)}%` : "–"}
              </th>
            ))}
            {onKick && <th />}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className={p.isOnline ? "" : "offline"}>
              <td className="sticky-col">
                <span className={`dot${p.isOnline ? " on" : ""}`} />
                {p.name}
                {p.submitted && <span className="tag">已交卷</span>}
              </td>
              <td className="score">{p.totalScore}</td>
              <td className="progress">
                {p.answered}/{questions.length}
              </td>
              {questions.map((q) => {
                const a = p.answers[q.id];
                return (
                  <td
                    key={q.id}
                    className={`cell ${a ? (a.isCorrect ? "ok" : "bad") : "empty"}`}
                    title={a ? `作答：${Array.isArray(a.value) ? a.value.map((i) => String.fromCharCode(65 + i)).join("") : a.value}` : "未作答"}
                  />
                );
              })}
              {onKick && (
                <td>
                  <button type="button" className="kick" onClick={() => onKick(p.id)}>
                    移出
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {players.length === 0 && <p className="empty-hint">還沒有人進來。把房間代碼給學生。</p>}
    </div>
  );
}
