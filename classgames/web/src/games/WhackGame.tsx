// 打地鼠：題目在上面，每個洞裡冒出一個選項，敲中正解得分。60 秒限時。
import { useEffect, useMemo, useRef, useState } from "react";
import { effectiveQuiz, shuffle, shuffleOptions } from "../lib/gameset.ts";
import { sfx } from "../lib/sound.ts";
import { Result, Stage, type GameProps } from "./shared.tsx";

const SECONDS = 60;

export default function WhackGame({ set, onExit, onReplay }: GameProps) {
  const pool = useMemo(() => shuffle(effectiveQuiz(set)!).map((q) => shuffleOptions(q)), [set]);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(SECONDS);
  const [score, setScore] = useState(0);
  const [tries, setTries] = useState(0);
  const [hit, setHit] = useState<{ idx: number; ok: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // 題目用完就從頭再來一輪，限時內不會沒題目
  const q = pool[i % pool.length]!;
  // 洞最多 4 個。選項超過 4 個時保證正解還在裡面
  const holes = useMemo(() => {
    if (q.options.length <= 4) return q.options.map((text, idx) => ({ text, idx }));
    const all = q.options.map((text, idx) => ({ text, idx }));
    const right = all[q.answer]!;
    return shuffle([right, ...shuffle(all.filter((_, k) => k !== q.answer)).slice(0, 3)]);
  }, [q]);
  const over = left <= 0;

  useEffect(() => {
    if (over) return;
    const t = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [over]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (over && score > 0) sfx.win();
  }, [over, score]);

  function whack(optIdx: number) {
    if (hit || over) return;
    const ok = optIdx === q.answer;
    setTries((t) => t + 1);
    setHit({ idx: optIdx, ok });
    if (ok) {
      sfx.ok();
      setScore((s) => s + 1);
    } else {
      sfx.bad();
    }
    timer.current = window.setTimeout(
      () => {
        setHit(null);
        if (ok) setI((n) => n + 1);
      },
      ok ? 350 : 500,
    );
  }

  if (over) {
    return (
      <Stage title="打地鼠" onExit={onExit}>
        <Result
          headline="時間到！"
          ratio={tries ? score / tries : 0}
          lines={[`答對 ${score} 題`, `出手 ${tries} 次，命中率 ${tries ? Math.round((score / tries) * 100) : 0}%`]}
          onReplay={onReplay}
          onExit={onExit}
        />
      </Stage>
    );
  }

  return (
    <Stage title="打地鼠" onExit={onExit} status={<>剩 {left} 秒　得分 {score}</>}>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(left / SECONDS) * 100}%` }} />
      </div>
      <div className="question">{q.text}</div>
      <p className="hint">點正確答案的地鼠</p>
      <div className="holes" key={i}>
        {holes.map((h, k) => {
          const state = hit && hit.idx === h.idx ? (hit.ok ? " hit-ok" : " hit-bad") : "";
          return (
            <div className="hole" key={h.idx}>
              <button className={`mole${state}`} style={{ animationDelay: `${k * 90}ms` }} onClick={() => whack(h.idx)}>
                {h.text}
              </button>
              <div className="dirt" aria-hidden="true" />
            </div>
          );
        })}
      </div>
    </Stage>
  );
}
