import type { ReactNode } from "react";
import type { GameSet } from "../lib/gameset.ts";

export interface GameProps {
  set: GameSet;
  /** 回到選遊戲畫面 */
  onExit: () => void;
  /** 再玩一次（App 用 key 重新掛載，所有狀態自然歸零） */
  onReplay: () => void;
}

export function starsFor(ratio: number): number {
  return ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
}

export function Stars({ n }: { n: number }) {
  return (
    <div className="stars" aria-label={`${n} 顆星`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "star on" : "star"} aria-hidden="true">
          ★
        </span>
      ))}
    </div>
  );
}

export function Result(props: {
  headline: string;
  ratio: number;
  lines: string[];
  onReplay: () => void;
  onExit: () => void;
}) {
  return (
    <div className="result" role="status">
      <h2>{props.headline}</h2>
      <Stars n={starsFor(props.ratio)} />
      <ul>
        {props.lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="row">
        <button className="btn primary" onClick={props.onReplay}>
          再玩一次
        </button>
        <button className="btn" onClick={props.onExit}>
          換一款遊戲
        </button>
      </div>
    </div>
  );
}

export function Stage(props: { title: string; status?: ReactNode; onExit: () => void; children: ReactNode }) {
  return (
    <section className="stage">
      <header className="stage-head">
        <button className="btn small" onClick={props.onExit} aria-label="返回選遊戲">
          ← 返回
        </button>
        <h2>{props.title}</h2>
        <div className="status">{props.status}</div>
      </header>
      {props.children}
    </section>
  );
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
