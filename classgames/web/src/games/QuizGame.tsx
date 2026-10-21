// 闖關測驗：一題一題過，三顆心，答完立刻看解析。
import { useEffect, useMemo, useState } from "react";
import { effectiveQuiz, shuffle, shuffleOptions } from "../lib/gameset.ts";
import { sfx } from "../lib/sound.ts";
import { Result, Stage, type GameProps } from "./shared.tsx";

const LIVES = 3;

export default function QuizGame({ set, onExit, onReplay }: GameProps) {
  const qs = useMemo(() => shuffle(effectiveQuiz(set)!).slice(0, 12).map((q) => shuffleOptions(q)), [set]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [lives, setLives] = useState(LIVES);
  const [right, setRight] = useState(0);
  const q = qs[i];
  // 回饋還在顯示時（picked 不是 null）不算結束，不然最後一題答錯會看不到正解與解析
  const over = picked === null && (lives <= 0 || i >= qs.length);
  const cleared = over && lives > 0;

  useEffect(() => {
    if (cleared) sfx.win();
  }, [cleared]);

  function choose(idx: number) {
    if (picked !== null || !q) return;
    setPicked(idx);
    if (idx === q.answer) {
      sfx.ok();
      setRight((r) => r + 1);
    } else {
      sfx.bad();
      setLives((l) => l - 1);
    }
  }
  function next() {
    setPicked(null);
    setI((n) => n + 1);
  }

  if (over) {
    // 按「下一題／看結果」才會 i + 1，所以走到這裡時 i 就是已作答題數
    const answered = i;
    return (
      <Stage title="闖關測驗" onExit={onExit}>
        <Result
          headline={cleared ? "闖關成功！" : "挑戰結束"}
          ratio={right / Math.max(1, answered)}
          lines={[`答對 ${right} 題，共作答 ${answered} 題`, cleared ? `剩下 ${lives} 顆心` : "三顆心都用完了"]}
          onReplay={onReplay}
          onExit={onExit}
        />
      </Stage>
    );
  }

  return (
    <Stage
      title="闖關測驗"
      onExit={onExit}
      status={
        <>
          第 {i + 1}/{qs.length} 題　<span aria-label={`剩 ${lives} 顆心`}>{"♥".repeat(lives) + "♡".repeat(LIVES - lives)}</span>
        </>
      }
    >
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>
      <div className="question">{q!.text}</div>
      <div className="options">
        {q!.options.map((o, idx) => {
          let cls = "opt";
          if (picked !== null) {
            if (idx === q!.answer) cls += " right";
            else if (idx === picked) cls += " wrong";
          }
          return (
            <button key={idx} className={cls} onClick={() => choose(idx)} disabled={picked !== null}>
              <b>{String.fromCharCode(65 + idx)}</b> {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className={`feedback ${picked === q!.answer ? "ok" : "bad"}`} role="status">
          <strong>{picked === q!.answer ? "答對了！" : `答錯了，正解是「${q!.options[q!.answer]}」`}</strong>
          {q!.explanation && <p>{q!.explanation}</p>}
          <button className="btn primary" onClick={next}>
            {lives <= 0 || i + 1 >= qs.length ? "看結果" : "下一題"}
          </button>
        </div>
      )}
    </Stage>
  );
}
