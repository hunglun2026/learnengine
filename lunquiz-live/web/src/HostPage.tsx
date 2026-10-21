// 老師端：房號、開始／結束、即時監控牆、下載 Excel。
import { useMemo, useState } from "react";
import { parseQuestionBank, type QuestionBank } from "@learnengine/engine";
import { MonitorGrid, useRoom } from "@learnengine/engine/react";
import { WORKER_HOST } from "./config";
import { askConfirm } from "./dialog";
import { formatClock, useCountdown } from "./useCountdown";

export function HostPage({ roomId }: { roomId: string }) {
  const hostToken = localStorage.getItem(`host_token_${roomId}`) ?? "";
  const identity = useMemo(() => ({ role: "host" as const, hostToken }), [hostToken]);
  const { status, state, questions, revealed, error, setError, send } = useRoom({
    host: WORKER_HOST,
    roomId,
    identity,
  });
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const remain = useCountdown(state);

  const playUrl = `${location.origin}${location.pathname}#/play/${roomId}`;

  if (!hostToken) {
    return (
      <main className="host">
        <p className="error">
          這台裝置沒有這個房間的老師權限。老師端的權杖只存在開房的那台裝置上，請回首頁重新開一間。
        </p>
        <a href="#/">回首頁</a>
      </main>
    );
  }

  /** 下載成績需要完整題庫（含正解），伺服器在結束後才送 REVEAL 過來 */
  const canDownload = Boolean(state && revealed) && !downloading;

  const download = async () => {
    if (!state || !revealed) return;
    const bank: QuestionBank = parseQuestionBank({
      title: state.bankTitle,
      meta: { grade: "－", subject: "－" },
      timeLimitMinutes: 0,
      questions: revealed,
    });
    setDownloading(true);
    try {
      // xlsx 很大，只有老師按下載才載入，學生手機不必下載它
      const { downloadGradebook } = await import("@learnengine/engine/export");
      downloadGradebook(state, bank);
    } catch {
      setError("成績檔產生失敗，請再按一次；還是不行就重新整理頁面再下載");
    } finally {
      setDownloading(false);
    }
  };

  const endRoom = async () => {
    const ok = await askConfirm({
      title: "結束作答並公布答案？",
      message: "所有學生會立刻被收卷，看到正解與解析。結束後不能再開始。",
      okText: "結束並公布",
      danger: true,
    });
    if (ok) send({ type: "HOST_END" });
  };

  const kick = async (playerId: string) => {
    const who = state?.players[playerId]?.name ?? "這位學生";
    const ok = await askConfirm({
      title: `移出 ${who}？`,
      message: "移出後這位學生的作答與分數會一起刪除，成績檔裡也不會留下這筆資料。",
      okText: "移出",
      danger: true,
    });
    if (ok) send({ type: "HOST_KICK", playerId });
  };

  return (
    <main className="host">
      <header className="host-bar">
        <div className="room-code">
          <span className="label">房間代碼</span>
          <strong>{roomId}</strong>
        </div>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(playUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "已複製連結" : "複製學生連結"}
        </button>
        <span className={`conn ${status}`}>
          {status === "open" ? "已連線" : status === "connecting" ? "連線中…" : "斷線，重連中…"}
        </span>
        {remain !== null && (
          <span className="timer">剩餘 {formatClock(remain)}</span>
        )}
      </header>

      {error && (
        <p className="error" onClick={() => setError(null)}>
          {error}（點一下關掉）
        </p>
      )}

      {state && (
        <>
          <div className="host-actions">
            <h2>{state.bankTitle}</h2>
            {state.status === "LOBBY" && (
              <button className="primary" onClick={() => send({ type: "HOST_START" })}>
                開始作答
              </button>
            )}
            {state.status === "RUNNING" && (
              <>
                <button onClick={() => send({ type: "HOST_EXTEND", minutes: 5 })}>延長 5 分鐘</button>
                <button className="danger" onClick={endRoom}>
                  結束並公布答案
                </button>
              </>
            )}
            {state.status === "ENDED" && (
              <button className="primary" onClick={download} disabled={!canDownload}>
                {downloading ? "產生中…" : "下載成績 Excel"}
              </button>
            )}
          </div>

          {state.status === "ENDED" && (
            <p className="notice">伺服器只保留這場的成績 24 小時，之後會整間刪除，請記得下載 Excel。</p>
          )}

          {/* 結束後不給移出：移出會連成績一起刪，老師下載前誤按就救不回來 */}
          <MonitorGrid
            state={state}
            questions={questions}
            onKick={state.status === "ENDED" ? undefined : kick}
          />
        </>
      )}
    </main>
  );
}
