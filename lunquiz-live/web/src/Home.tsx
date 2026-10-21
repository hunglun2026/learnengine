// 首頁：學生輸代碼進場，老師開新房間。
// 兩件事分開放，不要做成同一個輸入框，上課時老師與學生同時在看這一頁。
import { useState } from "react";
import { parseQuestionBank, type QuestionBank } from "@learnengine/engine";
import { WORKER_HOST, makeRoomCode } from "./config";
import { BUILT_IN_BANKS } from "./banks";

export function Home() {
  const [code, setCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pickedIndex, setPickedIndex] = useState(0);
  const [uploaded, setUploaded] = useState<QuestionBank | null>(null);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const room = code.trim().toUpperCase();
    if (!room) return;
    setJoinError(null);
    try {
      const res = await fetch(`${WORKER_HOST}/parties/quiz-room/${room}/info`);
      if (!res.ok) {
        setJoinError("找不到這個房間，請確認代碼有沒有打錯");
        return;
      }
      location.hash = `#/play/${room}`;
    } catch {
      setJoinError("連不上伺服器，檢查一下網路");
    }
  };

  const onFile = async (file: File) => {
    setCreateError(null);
    try {
      const bank = parseQuestionBank(JSON.parse(await file.text()));
      setUploaded(bank);
    } catch (err) {
      setUploaded(null);
      setCreateError((err as Error).message);
    }
  };

  const create = async () => {
    const bank = uploaded ?? BUILT_IN_BANKS[pickedIndex]?.bank;
    if (!bank) return;
    setCreating(true);
    setCreateError(null);
    try {
      const roomId = makeRoomCode();
      const hostToken = crypto.randomUUID();
      const res = await fetch(`${WORKER_HOST}/parties/quiz-room/${roomId}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bank, hostToken }),
      });
      if (!res.ok) {
        setCreateError((await res.json().catch(() => ({}))).error ?? "開房失敗");
        return;
      }
      // token 存在這台裝置：老師重整頁面還是老師，換裝置就要重開房間
      localStorage.setItem(`host_token_${roomId}`, hostToken);
      location.hash = `#/host/${roomId}`;
    } catch {
      setCreateError("連不上伺服器，檢查一下網路");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="home">
      <h1>小綸即時測驗</h1>
      <p className="sub">整份卷子發下去，學生自己寫，老師即時看到誰寫到哪、哪題錯。</p>

      <section className="card">
        <h2>我是學生</h2>
        <form onSubmit={join} className="join-form">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="輸入房間代碼"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
          />
          <button type="submit">進入</button>
        </form>
        {joinError && <p className="error">{joinError}</p>}
      </section>

      <section className="card">
        <h2>我是老師</h2>
        <label className="field">
          <span>選一份題庫</span>
          <select
            value={uploaded ? -1 : pickedIndex}
            onChange={(e) => {
              setUploaded(null);
              setPickedIndex(Number(e.target.value));
            }}
          >
            {BUILT_IN_BANKS.map((b, i) => (
              <option key={b.bank.title} value={i}>
                {b.bank.title}（{b.bank.questions.length} 題）
              </option>
            ))}
            {uploaded && <option value={-1}>{uploaded.title}（上傳的檔案）</option>}
          </select>
        </label>

        <label className="field">
          <span>或上傳自己的題庫檔（.json）</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </label>

        <button className="primary" onClick={create} disabled={creating}>
          {creating ? "開房中…" : "開一個房間"}
        </button>
        {createError && <pre className="error">{createError}</pre>}
      </section>
    </main>
  );
}
