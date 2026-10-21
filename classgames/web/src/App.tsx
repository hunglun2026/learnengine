// 畫面流程：首頁（選示範題庫）→ 編輯（用 Gemini 出題、貼回來）→ 審題 → 選遊戲 → 玩。
// 示範題庫跳過審題；學生從分享連結進來時，直接落在「選遊戲」。
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { availableGames, effectivePairs, effectiveQuiz, parseGameSetText, type GameId, type GameSet } from "./lib/gameset.ts";
import { DEMOS } from "./lib/demos.ts";
import { buildPrompt } from "./lib/prompt.ts";
import { decodeHash, shareUrl } from "./lib/share.ts";
import { copyText } from "./lib/clipboard.ts";
import { isMuted, setMuted } from "./lib/sound.ts";
import type { GameProps } from "./games/shared.tsx";
import MatchGame from "./games/MatchGame.tsx";
import MemoryGame from "./games/MemoryGame.tsx";
import SpinnerGame from "./games/SpinnerGame.tsx";
import WhackGame from "./games/WhackGame.tsx";
import QuizGame from "./games/QuizGame.tsx";
import Review from "./Review.tsx";

type View = "home" | "edit" | "review" | "pick" | "play";

const GAMES: { id: GameId; name: string; badge: string; desc: string; need: "pairs" | "quiz"; C: ComponentType<GameProps> }[] = [
  { id: "match", name: "連連看", badge: "連", desc: "左右兩欄，把對應的連起來", need: "pairs", C: MatchGame },
  { id: "memory", name: "記憶翻牌", badge: "翻", desc: "翻兩張牌，找到意思相同的一對", need: "pairs", C: MemoryGame },
  { id: "spinner", name: "轉盤抽題", badge: "轉", desc: "轉到哪格就回答哪一題", need: "quiz", C: SpinnerGame },
  { id: "whack", name: "打地鼠", badge: "打", desc: "60 秒內敲中正確答案的地鼠", need: "quiz", C: WhackGame },
  { id: "quiz", name: "闖關測驗", badge: "闖", desc: "三顆心，一題一題闖，答完看解析", need: "quiz", C: QuizGame },
];

const EXAMPLE = JSON.stringify(
  {
    title: "題庫標題",
    grade: "國小五年級",
    subject: "自然",
    scope: "單元名稱",
    pairs: [
      { a: "左邊的詞", b: "右邊的意思" },
      { a: "詞二", b: "意思二" },
      { a: "詞三", b: "意思三" },
      { a: "詞四", b: "意思四" },
    ],
    questions: [{ text: "題目", options: ["選項一", "選項二", "選項三", "選項四"], answer: 0, explanation: "一句話解析" }],
  },
  null,
  2,
);

export default function App() {
  const fromLink = useMemo(() => decodeHash(location.hash), []);
  const [set, setSet] = useState<GameSet | null>(fromLink);
  const [view, setView] = useState<View>(fromLink ? "pick" : "home");
  const [game, setGame] = useState<GameId | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [muted, setMutedState] = useState(isMuted());

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, game, runKey]);

  const open = (s: GameSet) => {
    setSet(s);
    setView("pick");
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView("home")} aria-label="回到首頁">
          <span className="brand-mark" aria-hidden="true">
            玩
          </span>
          <span>課堂遊戲工坊</span>
        </button>
        <button
          className="btn small ghost"
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
          aria-pressed={muted}
        >
          {muted ? "音效：關" : "音效：開"}
        </button>
      </header>

      <main>
        {view === "home" && <Home onOpen={open} onEdit={() => setView("edit")} />}
        {view === "edit" && (
          <Edit
            initial={set}
            onLoad={(s) => {
              setSet(s);
              setView("review");
            }}
          />
        )}
        {view === "review" && set && <Review set={set} onOk={() => setView("pick")} onEdit={() => setView("edit")} />}
        {view === "pick" && set && (
          <Pick
            set={set}
            onPlay={(g) => {
              setGame(g);
              setRunKey((k) => k + 1);
              setView("play");
            }}
            onEdit={() => setView("edit")}
          />
        )}
        {view === "play" && set && game && (
          <>
            {GAMES.filter((g) => g.id === game).map(({ C, id }) => (
              <C
                key={`${id}-${runKey}`}
                set={set}
                onExit={() => setView("pick")}
                onReplay={() => setRunKey((k) => k + 1)}
              />
            ))}
          </>
        )}
      </main>

      <footer className="foot">
        <span>鴻綸科技股份有限公司　Google for Education 夥伴</span>
        <span>題庫只存在你的瀏覽器，不會上傳</span>
        <span>課堂遊戲工坊 v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}

function Home({ onOpen, onEdit }: { onOpen: (s: GameSet) => void; onEdit: () => void }) {
  return (
    <div className="page">
      <section className="hero">
        <p className="eyebrow">搭配 Gemini 使用的免費教學小工具</p>
        <h1>
          一份題庫，
          <br />
          五款課堂遊戲
        </h1>
        <p className="lead">請 Gemini 幫你出題，貼進來，馬上變成學生搶著玩的連連看、翻牌、轉盤、打地鼠和闖關。免登入，連結傳給學生就能玩。</p>
        <button className="btn primary big" onClick={onEdit}>
          用 Gemini 出一份自己的題庫
        </button>
      </section>

      <section>
        <h2 className="section-title">先玩玩看示範題庫</h2>
        <div className="demo-grid">
          {DEMOS.map((d) => (
            <article className="demo-card" key={d.title}>
              <p className="tag">
                {d.grade}　{d.subject}
              </p>
              <h3>{d.title}</h3>
              <p className="muted">{d.scope}</p>
              <p className="muted small-text">
                {d.pairs.length > 0 && `${d.pairs.length} 組詞對`}
                {d.pairs.length > 0 && d.questions.length > 0 && "　"}
                {d.questions.length > 0 && `${d.questions.length} 題選擇題`}
              </p>
              <button className="btn primary" onClick={() => onOpen(d)}>
                選遊戲來玩
              </button>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">三步驟用在自己的課堂</h2>
        <ol className="steps">
          <li>
            <b>1</b>
            <div>
              <strong>複製出題指令</strong>
              <p>填年級、科目、單元，一鍵複製寫好的指令，貼到 Gemini。</p>
            </div>
          </li>
          <li>
            <b>2</b>
            <div>
              <strong>把 Gemini 的回覆貼回來</strong>
              <p>系統會檢查格式，哪一題有問題會直接告訴你。</p>
            </div>
          </li>
          <li>
            <b>3</b>
            <div>
              <strong>選遊戲，傳連結給學生</strong>
              <p>題庫已經收進連結裡，學生用手機或平板打開就能玩。</p>
            </div>
          </li>
        </ol>
        <p className="note">要一次出好幾份題庫、反覆調整時，額度比較充裕的 Gemini 方案會順手很多（實際額度以 Google 官方說明為準）。</p>
      </section>
    </div>
  );
}

function Edit({ initial, onLoad }: { initial: GameSet | null; onLoad: (s: GameSet) => void }) {
  const [grade, setGrade] = useState(initial?.grade || "國小五年級");
  const [subject, setSubject] = useState(initial?.subject || "自然");
  const [scope, setScope] = useState(initial?.scope || "");
  const [pairCount, setPairCount] = useState(8);
  const [quizCount, setQuizCount] = useState(8);
  const [text, setText] = useState(initial ? JSON.stringify(initial, null, 2) : "");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const prompt = buildPrompt({ grade, subject, scope, pairCount, quizCount });

  async function copyPrompt() {
    setMsg((await copyText(prompt)) ? "已複製，到 Gemini 貼上送出" : "複製失敗，請展開下方指令手動複製");
  }
  function load() {
    try {
      onLoad(parseGameSetText(text));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="page narrow">
      <h1 className="page-title">做一份自己的題庫</h1>

      <section className="panel">
        <h2>
          <span className="step-no">1</span>請 Gemini 出題
        </h2>
        <div className="form-grid">
          <label>
            年級
            <input value={grade} onChange={(e) => setGrade(e.target.value)} />
          </label>
          <label>
            科目
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="wide">
            單元或主題
            <input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="例如：光的折射、分數的加減" />
          </label>
          <label>
            詞對組數
            <select value={pairCount} onChange={(e) => setPairCount(Number(e.target.value))}>
              {[6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} 組
                </option>
              ))}
            </select>
          </label>
          <label>
            選擇題題數
            <select value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))}>
              {[5, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n} 題
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <button className="btn primary" onClick={copyPrompt}>
            複製出題指令
          </button>
          <a className="btn" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">
            打開 Gemini
          </a>
        </div>
        {msg && (
          <p className="ok-text" role="status">
            {msg}
          </p>
        )}
        <details>
          <summary>看看指令長什麼樣</summary>
          <pre className="code">{prompt}</pre>
        </details>
      </section>

      <section className="panel">
        <h2>
          <span className="step-no">2</span>把回覆貼在這裡
        </h2>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError("");
          }}
          rows={12}
          spellCheck={false}
          placeholder="把 Gemini 的整段回覆貼進來就可以，外面有說明文字也沒關係"
          aria-label="貼上題庫 JSON"
        />
        {error && (
          <pre className="error" role="alert">
            {error}
          </pre>
        )}
        <div className="row">
          <button className="btn primary" onClick={load} disabled={!text.trim()}>
            檢查並載入
          </button>
          <button className="btn ghost" onClick={() => setText(EXAMPLE)}>
            填入格式範例
          </button>
        </div>
      </section>
    </div>
  );
}

function Pick({ set, onPlay, onEdit }: { set: GameSet; onPlay: (g: GameId) => void; onEdit: () => void }) {
  const avail = useMemo(() => availableGames(set), [set]);
  const pairs = effectivePairs(set)?.length ?? 0;
  const quiz = effectiveQuiz(set)?.length ?? 0;
  const url = useMemo(() => shareUrl(set), [set]);
  const [msg, setMsg] = useState("");

  return (
    <div className="page">
      <section className="pick-head">
        <p className="tag">
          {[set.grade, set.subject].filter(Boolean).join("　")}
        </p>
        <h1>{set.title}</h1>
        {set.scope && <p className="muted">{set.scope}</p>}
        <p className="muted small-text">
          {pairs > 0 && `${pairs} 組詞對`}
          {pairs > 0 && quiz > 0 && "　"}
          {quiz > 0 && `${quiz} 題選擇題`}
        </p>
      </section>

      <div className="game-grid">
        {GAMES.map((g) => {
          const ok = avail[g.id];
          return (
            <button key={g.id} className="game-card" disabled={!ok} onClick={() => onPlay(g.id)}>
              <span className={`badge b-${g.id}`} aria-hidden="true">
                {g.badge}
              </span>
              <span className="game-name">{g.name}</span>
              <span className="game-desc">{ok ? g.desc : g.need === "pairs" ? "需要至少 4 組不重複的詞對" : "需要至少 3 題選擇題"}</span>
            </button>
          );
        })}
      </div>

      <section className="panel">
        <h2>傳給學生</h2>
        <p className="muted">題庫已經收進連結裡，學生打開連結就能玩，不用登入。</p>
        <div className="share-row">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="分享連結" />
          <button
            className="btn primary"
            onClick={async () => setMsg((await copyText(url)) ? "已複製連結" : "複製失敗，請手動選取連結")}
          >
            複製連結
          </button>
        </div>
        {msg && (
          <p className="ok-text" role="status">
            {msg}
          </p>
        )}
        <button className="btn ghost" onClick={onEdit}>
          修改這份題庫
        </button>
      </section>
    </div>
  );
}
