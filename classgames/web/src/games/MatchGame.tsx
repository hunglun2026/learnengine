// 連連看：左右兩欄，先點一邊再點另一邊，對了就鎖住。每輪最多 6 組。
import { useEffect, useMemo, useRef, useState } from "react";
import { chunk, effectivePairs, shuffle, type Pair } from "../lib/gameset.ts";
import { sfx } from "../lib/sound.ts";
import { Result, Stage, fmtTime, type GameProps } from "./shared.tsx";

interface Item {
  key: number;
  pair: Pair;
}
type Side = "a" | "b";

export default function MatchGame({ set, onExit, onReplay }: GameProps) {
  const rounds = useMemo(() => chunk(shuffle(effectivePairs(set)!), 6), [set]);
  const [round, setRound] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<{ side: Side; key: number } | null>(null);
  const [wrong, setWrong] = useState<{ a: number; b: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [sec, setSec] = useState(0);
  const [finished, setFinished] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const items = useMemo<Item[]>(() => rounds[round]!.map((pair, key) => ({ key, pair })), [rounds, round]);
  const left = useMemo(() => shuffle(items), [items]);
  const right = useMemo(() => shuffle(items), [items]);

  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [finished]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function pick(side: Side, key: number) {
    if (done.has(key) || wrong) return;
    if (!sel || sel.side === side) {
      sfx.tick();
      setSel({ side, key });
      return;
    }
    const a = side === "a" ? key : sel.key;
    const b = side === "b" ? key : sel.key;
    // effectivePairs 已確保左右都不重複，所以只要編號相同就是配對成功
    if (a === b) {
      sfx.ok();
      const next = new Set(done);
      next.add(a);
      next.add(b);
      setDone(next);
      setCorrect((c) => c + 1);
      setSel(null);
      if (items.every((it) => next.has(it.key))) {
        timer.current = window.setTimeout(() => {
          if (round + 1 < rounds.length) {
            setRound(round + 1);
            setDone(new Set());
          } else {
            sfx.win();
            setFinished(true);
          }
        }, 700);
      }
    } else {
      sfx.bad();
      setMistakes((m) => m + 1);
      setWrong({ a, b });
      setSel(null);
      timer.current = window.setTimeout(() => setWrong(null), 450);
    }
  }

  if (finished) {
    const total = correct + mistakes;
    return (
      <Stage title="連連看" onExit={onExit}>
        <Result
          headline="全部連對了！"
          ratio={total ? correct / total : 1}
          lines={[`用時 ${fmtTime(sec)}`, `連錯 ${mistakes} 次`]}
          onReplay={onReplay}
          onExit={onExit}
        />
      </Stage>
    );
  }

  const cls = (side: Side, it: Item) => {
    if (done.has(it.key)) return "match-card done";
    if (wrong && wrong[side] === it.key) return "match-card wrong";
    if (sel && sel.side === side && sel.key === it.key) return "match-card picked";
    return "match-card";
  };

  return (
    <Stage
      title="連連看"
      onExit={onExit}
      status={
        <>
          第 {round + 1}/{rounds.length} 輪　{fmtTime(sec)}　錯 {mistakes}
        </>
      }
    >
      <p className="hint">先點左邊，再點右邊對應的那一個</p>
      <div className="match-cols">
        <div className="match-col">
          {left.map((it) => (
            <button key={it.key} className={cls("a", it)} onClick={() => pick("a", it.key)}>
              {it.pair.a}
            </button>
          ))}
        </div>
        <div className="match-col">
          {right.map((it) => (
            <button key={it.key} className={cls("b", it)} onClick={() => pick("b", it.key)}>
              {it.pair.b}
            </button>
          ))}
        </div>
      </div>
    </Stage>
  );
}
