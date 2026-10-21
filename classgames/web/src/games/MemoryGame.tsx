// 記憶翻牌：把詞對的兩邊各做成一張牌，翻到同一組就留下。最多 6 組（12 張牌）。
import { useEffect, useMemo, useRef, useState } from "react";
import { effectivePairs, shuffle } from "../lib/gameset.ts";
import { sfx } from "../lib/sound.ts";
import { Result, Stage, fmtTime, type GameProps } from "./shared.tsx";

interface Card {
  id: number;
  pair: number;
  text: string;
}

export default function MemoryGame({ set, onExit, onReplay }: GameProps) {
  const cards = useMemo<Card[]>(() => {
    const picked = shuffle(effectivePairs(set)!).slice(0, 6);
    const all = picked.flatMap((p, i) => [
      { pair: i, text: p.a },
      { pair: i, text: p.b },
    ]);
    return shuffle(all).map((c, id) => ({ ...c, id }));
  }, [set]);

  const [open, setOpen] = useState<number[]>([]);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [moves, setMoves] = useState(0);
  const [sec, setSec] = useState(0);
  const lock = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const finished = matched.size === cards.length;

  useEffect(() => {
    if (finished) return;
    const t = window.setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [finished]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (finished) sfx.win();
  }, [finished]);

  function flip(id: number) {
    if (lock.current || open.includes(id) || matched.has(id)) return;
    sfx.flip();
    const next = [...open, id];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    lock.current = true;
    const [x, y] = next as [number, number];
    if (cards[x]!.pair === cards[y]!.pair) {
      timer.current = window.setTimeout(() => {
        sfx.ok();
        setMatched((m) => new Set([...m, x, y]));
        setOpen([]);
        lock.current = false;
      }, 450);
    } else {
      timer.current = window.setTimeout(() => {
        sfx.bad();
        setOpen([]);
        lock.current = false;
      }, 900);
    }
  }

  if (finished) {
    const pairs = cards.length / 2;
    return (
      <Stage title="記憶翻牌" onExit={onExit}>
        <Result
          headline="全部配對成功！"
          ratio={pairs / Math.max(moves, pairs)}
          lines={[`翻了 ${moves} 次（最少 ${pairs} 次）`, `用時 ${fmtTime(sec)}`]}
          onReplay={onReplay}
          onExit={onExit}
        />
      </Stage>
    );
  }

  return (
    <Stage title="記憶翻牌" onExit={onExit} status={<>{fmtTime(sec)}　翻 {moves} 次</>}>
      <p className="hint">翻開兩張，意思對得起來的就會留下</p>
      <div className="memory-grid">
        {cards.map((c) => {
          const isOpen = open.includes(c.id) || matched.has(c.id);
          return (
            <button
              key={c.id}
              className={`mem-card${isOpen ? " open" : ""}${matched.has(c.id) ? " matched" : ""}`}
              onClick={() => flip(c.id)}
              aria-label={isOpen ? c.text : "未翻開的牌"}
            >
              <span className="mem-face back" aria-hidden="true">
                ?
              </span>
              <span className="mem-face front">{c.text}</span>
            </button>
          );
        })}
      </div>
    </Stage>
  );
}
