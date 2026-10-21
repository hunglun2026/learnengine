// 學生端：輸姓名 → 整份卷子自己寫 → 交卷 → 看正解。
// 每改一次答案就送到伺服器，這樣老師端才看得到即時進度，
// 而且中途斷線重連答案不會消失（伺服器才是權威）。
import { useEffect, useMemo, useState } from "react";
import { QuestionCard, getOrCreatePlayerId, useRoom } from "@learnengine/engine/react";
import { WORKER_HOST } from "./config";
import { askConfirm } from "./dialog";
import { formatClock, useCountdown } from "./useCountdown";

export function PlayPage({ roomId }: { roomId: string }) {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const [name, setName] = useState(() => localStorage.getItem("learnengine_player_name") ?? "");
  const [entered, setEntered] = useState(() => Boolean(localStorage.getItem("learnengine_player_name")));

  if (!entered) {
    return (
      <main className="play">
        <h1>房間 {roomId}</h1>
        <form
          className="join-form"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            localStorage.setItem("learnengine_player_name", n);
            setEntered(true);
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="輸入你的名字或座號"
            maxLength={20}
          />
          <button type="submit">進入</button>
        </form>
      </main>
    );
  }

  return <PlayRoom roomId={roomId} playerId={playerId} name={name.trim()} />;
}

function PlayRoom({ roomId, playerId, name }: { roomId: string; playerId: string; name: string }) {
  const identity = useMemo(
    () => ({ role: "player" as const, playerId, name, linkedUserId: null }),
    [playerId, name]
  );
  const { status, state, questions, you, revealed, error, setError, send } = useRoom({
    host: WORKER_HOST,
    roomId,
    identity,
  });

  // 本地暫存的作答，讓打字不會被伺服器回來的狀態蓋掉
  const [draft, setDraft] = useState<Record<string, number[] | string>>({});

  // 重連後把伺服器上已存的答案帶回畫面
  useEffect(() => {
    if (!you) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const [qid, rec] of Object.entries(you.answers)) {
        if (next[qid] === undefined) next[qid] = rec.value;
      }
      return next;
    });
  }, [you]);

  const submitted = you?.submitted ?? false;
  const ended = state?.status === "ENDED";
  const locked = submitted || ended || state?.status !== "RUNNING";

  const remain = useCountdown(state);

  const answeredCount = you ? you.answered : 0;

  const change = (qid: string, value: number[] | string) => {
    setDraft((d) => ({ ...d, [qid]: value }));
    // 選擇題點下去就送；文字題等使用者停手（onBlur）再送，避免每打一個字送一次
    const q = questions.find((x) => x.id === qid);
    if (q && (q.type === "single" || q.type === "multiple")) {
      send({ type: "ANSWER", questionId: qid, value });
    }
  };

  const flushText = (qid: string) => {
    const v = draft[qid];
    if (typeof v === "string" && v.trim()) send({ type: "ANSWER", questionId: qid, value: v });
  };

  return (
    <main className="play">
      <header className="play-bar">
        <div>
          <strong>{state?.bankTitle ?? "載入中…"}</strong>
          <span className="who">{name}</span>
        </div>
        <div className="play-meta">
          <span className={`conn ${status}`}>
            {status === "open" ? "已連線" : status === "connecting" ? "連線中…" : "斷線，重連中…"}
          </span>
          <span>
            {answeredCount}/{state?.questionCount ?? 0} 題
          </span>
          {remain !== null && (
            <span className="timer">{formatClock(remain)}</span>
          )}
          {(submitted || ended) && you && (
            <span className="final">
              得分 {you.totalScore}/{state?.totalScore}
            </span>
          )}
        </div>
      </header>

      {error && (
        <p className="error" onClick={() => setError(null)}>
          {error}（點一下關掉）
        </p>
      )}

      {state?.status === "LOBBY" && <p className="waiting">已進入房間，等老師開始。</p>}

      {state?.status !== "LOBBY" &&
        questions.map((q, i) => (
          <div key={q.id} onBlur={() => flushText(q.id)}>
            <QuestionCard
              index={i}
              question={q}
              value={draft[q.id]}
              onChange={(v) => change(q.id, v)}
              disabled={locked}
              record={submitted || ended ? you?.answers[q.id] : undefined}
              revealed={revealed?.find((r) => r.id === q.id)}
            />
          </div>
        ))}

      {state?.status === "RUNNING" && !submitted && (
        <button
          className="primary submit"
          onClick={async () => {
            // 文字題可能還沒送出，交卷前補送一次
            for (const q of questions) if (q.options.length === 0) flushText(q.id);
            const blank = (state?.questionCount ?? 0) - answeredCount;
            const ok = await askConfirm({
              title: "確定要交卷嗎？",
              message:
                blank > 0
                  ? `還有 ${blank} 題沒寫。交卷後就不能再改答案了。`
                  : "交卷後就不能再改答案了。",
              okText: "交卷",
              cancelText: "再檢查一下",
            });
            if (ok) send({ type: "SUBMIT" });
          }}
        >
          交卷
        </button>
      )}
    </main>
  );
}
