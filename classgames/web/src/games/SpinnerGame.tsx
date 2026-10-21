// 轉盤抽題：轉盤上每一格是一題，轉到哪格就回答哪一題，答完那格變灰。
import { useEffect, useMemo, useRef, useState } from "react";
import { effectiveQuiz, shuffle, shuffleOptions, type Quiz } from "../lib/gameset.ts";
import { sfx } from "../lib/sound.ts";
import { Result, Stage, type GameProps } from "./shared.tsx";

const MAX = 8;
const COLORS = ["#ff6b4a", "#ffc93c", "#2dd4bf", "#60a5fa", "#a78bfa", "#f472b6", "#34d399", "#fb923c"];
const R = 100;
const SPIN_MS = 3000;

function wedge(i: number, n: number): string {
  const a0 = ((i / n) * 360 - 90) * (Math.PI / 180);
  const a1 = (((i + 1) / n) * 360 - 90) * (Math.PI / 180);
  const p = (a: number) => `${(R + R * Math.cos(a)).toFixed(2)} ${(R + R * Math.sin(a)).toFixed(2)}`;
  return `M${R} ${R} L${p(a0)} A${R} ${R} 0 ${1 / n > 0.5 ? 1 : 0} 1 ${p(a1)} Z`;
}

export default function SpinnerGame({ set, onExit, onReplay }: GameProps) {
  const qs = useMemo<Quiz[]>(() => shuffle(effectiveQuiz(set)!).slice(0, MAX).map((q) => shuffleOptions(q)), [set]);
  const n = qs.length;
  const [rot, setRot] = useState(0);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [spinning, setSpinning] = useState(false);
  const [cur, setCur] = useState<number | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const finished = used.size === n && cur === null;
  useEffect(() => {
    if (finished) sfx.win();
  }, [finished]);

  function spin() {
    if (spinning || cur !== null) return;
    const free = qs.map((_, i) => i).filter((i) => !used.has(i));
    const target = free[Math.floor(Math.random() * free.length)]!;
    const seg = 360 / n;
    // 指針在正上方：要讓目標格的中心轉到 0 度
    const want = (360 - (target + 0.5) * seg) % 360;
    const delta = (want - (rot % 360) + 360) % 360;
    setRot(rot + 360 * 4 + delta);
    setSpinning(true);
    sfx.tick();
    timer.current = window.setTimeout(() => {
      setSpinning(false);
      setCur(target);
    }, SPIN_MS + 100);
  }

  function choose(idx: number) {
    if (cur === null || picked !== null) return;
    setPicked(idx);
    if (idx === qs[cur]!.answer) {
      sfx.ok();
      setRight((r) => r + 1);
    } else sfx.bad();
  }
  function done() {
    setUsed((u) => new Set([...u, cur!]));
    setCur(null);
    setPicked(null);
  }

  if (finished) {
    return (
      <Stage title="轉盤抽題" onExit={onExit}>
        <Result headline="轉盤清空了！" ratio={right / n} lines={[`答對 ${right}/${n} 題`]} onReplay={onReplay} onExit={onExit} />
      </Stage>
    );
  }

  const q = cur !== null ? qs[cur]! : null;

  return (
    <Stage
      title="轉盤抽題"
      onExit={onExit}
      status={
        <>
          已答 {used.size}/{n}　答對 {right}
        </>
      }
    >
      {q ? (
        <>
          <div className="question">
            <small>第 {cur! + 1} 格</small>
            {q.text}
          </div>
          <div className="options">
            {q.options.map((o, idx) => {
              let cls = "opt";
              if (picked !== null) {
                if (idx === q.answer) cls += " right";
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
            <div className={`feedback ${picked === q.answer ? "ok" : "bad"}`} role="status">
              <strong>{picked === q.answer ? "答對了！" : `答錯了，正解是「${q.options[q.answer]}」`}</strong>
              {q.explanation && <p>{q.explanation}</p>}
              <button className="btn primary" onClick={done}>
                {used.size + 1 >= n ? "看結果" : "繼續轉"}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="wheel-wrap">
          <div className="pointer" aria-hidden="true" />
          <svg
            className="wheel"
            viewBox="-3 -3 206 206"
            style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.15,.7,.1,1)` : "none" }}
            role="img"
            aria-label={`有 ${n} 格的轉盤`}
          >
            {qs.map((_, i) => {
              const mid = (((i + 0.5) / n) * 360 - 90) * (Math.PI / 180);
              const x = R + R * 0.66 * Math.cos(mid);
              const y = R + R * 0.66 * Math.sin(mid);
              const dead = used.has(i);
              return (
                <g key={i}>
                  <path d={wedge(i, n)} fill={dead ? "#d9d4c7" : COLORS[i % COLORS.length]} stroke="#1d2b2a" strokeWidth="1.6" />
                  <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="900" fill="#1d2b2a">
                    {i + 1}
                  </text>
                </g>
              );
            })}
            <circle cx={R} cy={R} r="9" fill="#fff8ec" stroke="#1d2b2a" strokeWidth="2" />
          </svg>
          <button className="btn primary big" onClick={spin} disabled={spinning}>
            {spinning ? "轉動中…" : "轉！"}
          </button>
        </div>
      )}
    </Stage>
  );
}
