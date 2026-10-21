// 老師審題：貼上的題庫通過格式檢查後，先把每一題、每組詞對連同正解列出來給老師看過，才能選遊戲與分享。
// 為什麼要這一步：2026-10-21 規模測試，專業版與免費版都把「光碟、肥皂泡泡的七彩」說成色散（實為干涉與繞射），
// 6 份有 4 份犯錯，改出題指令也擋不掉。格式可以自動檢查，事實只能靠老師。
// 示範題庫與學生從分享連結進來都不經過這一頁。
import type { GameSet } from "./lib/gameset.ts";

const LETTERS = "ABCDEF";

export default function Review({ set, onOk, onEdit }: { set: GameSet; onOk: () => void; onEdit: () => void }) {
  return (
    <div className="page narrow">
      <h1 className="page-title">請先審題</h1>

      <p className="review-warn" role="note">
        這份題庫是 AI 產生的，<strong>AI 會出錯</strong>，例如把現象的原因講錯、用到還沒教的內容、出現大陸用語。
        請把下面每一題的正解與解析看過一次，確認沒問題再給學生。
      </p>

      <section className="panel">
        <p className="tag">{[set.grade, set.subject].filter(Boolean).join("　") || "未填年級科目"}</p>
        <h2>{set.title}</h2>
        {set.scope && <p className="muted">{set.scope}</p>}
      </section>

      {set.pairs.length > 0 && (
        <section className="panel">
          <h2>詞對（{set.pairs.length} 組）</h2>
          <div className="review-table-wrap">
            <table className="review-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">左邊</th>
                  <th scope="col">右邊（配對的答案）</th>
                </tr>
              </thead>
              <tbody>
                {set.pairs.map((p, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{p.a}</td>
                    <td>{p.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {set.questions.length > 0 && (
        <section className="panel">
          <h2>選擇題（{set.questions.length} 題）</h2>
          <ol className="review-quiz">
            {set.questions.map((q) => (
              <li key={q.id}>
                <p className="review-q">{q.text}</p>
                <ul>
                  {q.options.map((o, i) => (
                    <li key={i} className={i === q.answer ? "review-correct" : undefined}>
                      <b>{LETTERS[i]}</b> {o}
                      {i === q.answer && <span className="review-badge">正解</span>}
                    </li>
                  ))}
                </ul>
                {q.explanation && <p className="muted small-text">解析：{q.explanation}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="row review-actions">
        <button className="btn primary big" onClick={onOk}>
          看過了，沒問題，選遊戲
        </button>
        <button className="btn ghost" onClick={onEdit}>
          回去修改
        </button>
      </div>
    </div>
  );
}
