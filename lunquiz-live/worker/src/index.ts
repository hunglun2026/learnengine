// 即時房間伺服器。
// 每個房間 = 一個 Durable Object 實例，狀態放在記憶體裡，
// 學生作答不必往資料庫來回，老師端看到的延遲才會像現場。
//
// 用 PartyServer（Cloudflare 官方，跑在自己的 Worker 上）而不是 PartyKit CLI，
// 因為部署要走既有的 wrangler / GitHub Actions 流程，不另外接一套部署體系。
//
// 對外公開的服務，所以這裡要擋：
// - 開房：請求大小上限、依 IP 限流（只限開房，學生連線不限，因為整班常共用一個學校 IP）
// - 每則訊息：parseClientMessage 驗格式與長度，不合格直接丟掉
// - 每間房學生人數上限
// - 資料保存期限：結束後 24 小時、或開了沒用 12 小時，整間刪除（含學生姓名）
import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import {
  createRoomState,
  endRoom,
  joinPlayer,
  parseClientMessage,
  parseQuestionBank,
  startRoom,
  submitAnswer,
  submitPaper,
  toPublicQuestions,
} from "@learnengine/engine";
import type { Player, PublicQuestion, QuestionBank, RoomState, ServerMessage } from "@learnengine/engine";

export interface Env {
  QuizRoom: DurableObjectNamespace<QuizRoom>;
  ASSETS?: Fetcher;
  /** 開房限流；沒設定（例如本機沒開）就不限 */
  CREATE_LIMITER?: RateLimit;
  /** 結束後保留幾小時（預設 24）；本機測刪房時用 --var 設成很小的數 */
  KEEP_AFTER_END_HOURS?: string;
  /** 開了不用幾小時後自動收（預設 12） */
  IDLE_LIMIT_HOURS?: string;
}

const HOUR = 3_600_000;
function hours(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return (Number.isFinite(n) && n > 0 ? n : fallback) * HOUR;
}
/** 一間房最多幾位學生：一個班不會超過這個數，超過多半是有人在灌 */
const MAX_PLAYERS = 200;
/** 開房請求本文上限（題庫 JSON） */
const MAX_CREATE_BYTES = 512 * 1024;
/** 房間代碼格式，跟前端 makeRoomCode 的字母表一致 */
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6,8}$/;

interface ConnMeta {
  role: "host" | "player";
  playerId?: string;
}

/** 房間開起來時老師存進來的東西，重啟後要能還原 */
interface Persisted {
  bank: QuestionBank;
  state: RoomState;
  hostToken: string;
  createdAt: number;
}

export class QuizRoom extends Server<Env> {
  // 斷線後房間要能撐一段時間再喚醒，讓學生重整就接回來
  static options = { hibernate: true };

  bank: QuestionBank | null = null;
  state: RoomState | null = null;
  hostToken = "";
  createdAt = 0;
  publicQuestions: PublicQuestion[] = [];
  // connection id -> 這條連線是誰
  meta = new Map<string, ConnMeta>();

  async onStart() {
    const saved = await this.ctx.storage.get<Persisted>("room");
    if (saved) {
      this.bank = saved.bank;
      this.state = saved.state;
      this.hostToken = saved.hostToken;
      this.createdAt = saved.createdAt ?? Date.now();
      this.publicQuestions = toPublicQuestions(saved.bank.questions);
    }
    // 休眠喚醒後連線還在，但記憶體裡的 meta 不見了，從連線自己帶的狀態補回來
    for (const conn of this.getConnections<ConnMeta>()) {
      if (conn.state) this.meta.set(conn.id, conn.state);
    }
  }

  async persist() {
    if (!this.bank || !this.state) return;
    await this.ctx.storage.put<Persisted>("room", {
      bank: this.bank,
      state: this.state,
      hostToken: this.hostToken,
      createdAt: this.createdAt,
    });
  }

  /** 下一次要醒來處理的時間點：時間到收卷，或到期刪房 */
  nextAlarmAt(): number {
    const s = this.state!;
    const idle = hours(this.env.IDLE_LIMIT_HOURS, 12);
    if (s.status === "LOBBY") return this.createdAt + idle;
    if (s.status === "RUNNING") return s.endsAt > 0 ? s.endsAt : s.startedAt + idle;
    return s.endsAt + hours(this.env.KEEP_AFTER_END_HOURS, 24);
  }

  async scheduleAlarm() {
    if (this.state) await this.ctx.storage.setAlarm(this.nextAlarmAt());
  }

  /** 老師開房：把題庫送進來，房間才算存在 */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (request.method === "POST" && url.pathname.endsWith("/create")) {
      if (!ROOM_CODE.test(this.name)) {
        return Response.json({ error: "房間代碼格式不對" }, { status: 400, headers: cors });
      }
      if (this.state) {
        return Response.json({ error: "這個房間代碼已經有人用了，請換一個" }, { status: 409, headers: cors });
      }
      const text = await request.text();
      if (text.length > MAX_CREATE_BYTES) {
        return Response.json({ error: "題庫檔太大了（上限 512KB）" }, { status: 413, headers: cors });
      }
      let body: { bank?: unknown; hostToken?: unknown };
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: "送進來的不是合法的 JSON" }, { status: 400, headers: cors });
      }
      let bank: QuestionBank;
      try {
        bank = parseQuestionBank(body.bank);
      } catch (e) {
        // parseQuestionBank 的訊息是寫給人看的題庫錯誤清單，不含程式堆疊
        return Response.json({ error: (e as Error).message }, { status: 400, headers: cors });
      }
      const token = typeof body.hostToken === "string" && /^[A-Za-z0-9-]{20,100}$/.test(body.hostToken)
        ? body.hostToken
        : crypto.randomUUID();
      this.bank = bank;
      this.hostToken = token;
      this.createdAt = Date.now();
      this.state = createRoomState(this.name, bank);
      this.publicQuestions = toPublicQuestions(bank.questions);
      await this.persist();
      await this.scheduleAlarm();
      return Response.json({ ok: true, roomId: this.name, hostToken: this.hostToken }, { headers: cors });
    }

    // 學生端在輸入代碼後先問一下這個房間在不在，才不會連了 WebSocket 才發現房號打錯
    if (request.method === "GET" && url.pathname.endsWith("/info")) {
      if (!this.state) return Response.json({ exists: false }, { status: 404, headers: cors });
      return Response.json(
        {
          exists: true,
          title: this.state.bankTitle,
          status: this.state.status,
          questionCount: this.state.questionCount,
        },
        { headers: cors }
      );
    }

    return new Response("Not found", { status: 404, headers: cors });
  }

  send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  /** 記下這條連線是誰；同時存進連線自己的狀態，休眠喚醒後才找得回來 */
  remember(conn: Connection, m: ConnMeta) {
    this.meta.set(conn.id, m);
    conn.setState(m);
  }

  broadcastState() {
    if (!this.state) return;
    // 老師要完整名單，學生只要自己的那份，所以分開送
    for (const conn of this.getConnections()) {
      const m = this.meta.get(conn.id);
      if (!m) continue;
      if (m.role === "host") {
        this.send(conn, { type: "STATE", state: this.state, questions: this.publicQuestions });
      } else if (m.playerId) {
        this.send(conn, {
          type: "STATE",
          state: this.playerView(this.state),
          questions: this.publicQuestions,
          you: this.state.players[m.playerId],
        });
      }
    }
  }

  /** 學生看到的狀態不含別人的作答內容，只留姓名與分數（排行榜要用） */
  playerView(state: RoomState): RoomState {
    const players: Record<string, Player> = {};
    for (const [id, p] of Object.entries(state.players)) {
      players[id] = { ...p, answers: {} };
    }
    return { ...state, players };
  }

  broadcastPlayerToHost(player: Player) {
    for (const conn of this.getConnections()) {
      if (this.meta.get(conn.id)?.role === "host") {
        this.send(conn, { type: "PLAYER_UPDATE", player });
      }
    }
  }

  onConnect(_conn: Connection, _ctx: ConnectionContext) {
    // 先不做事，等對方送 JOIN 表明身分（老師要驗 token）
  }

  /** 收卷：結束房間、通知所有人、改成「24 小時後刪除」 */
  async finish(now: number) {
    if (!this.state) return;
    endRoom(this.state, now);
    await this.persist();
    this.broadcastState();
    this.revealToAll();
    await this.scheduleAlarm();
  }

  async onMessage(conn: Connection, raw: string | ArrayBuffer) {
    if (!this.state || !this.bank) {
      this.send(conn, { type: "ERROR", message: "這個房間不存在或已經過期" });
      conn.close();
      return;
    }
    const msg = parseClientMessage(raw);
    if (!msg) return;
    const now = Date.now();

    // 時間到就自動結束，不必等老師按（alarm 是主要機制，這裡是保險）
    if (this.state.status === "RUNNING" && this.state.endsAt > 0 && now >= this.state.endsAt) {
      await this.finish(now);
    }

    switch (msg.type) {
      case "JOIN": {
        if (msg.role === "host") {
          if (msg.hostToken !== this.hostToken) {
            this.send(conn, { type: "ERROR", message: "老師身分驗證失敗" });
            return;
          }
          this.remember(conn, { role: "host" });
          this.send(conn, { type: "STATE", state: this.state, questions: this.publicQuestions });
          if (this.state.status === "ENDED") {
            this.send(conn, { type: "REVEAL", questions: this.bank.questions });
          }
          return;
        }
        const isNew = !this.state.players[msg.playerId];
        if (isNew && Object.keys(this.state.players).length >= MAX_PLAYERS) {
          this.send(conn, { type: "ERROR", message: `這個房間已經滿了（上限 ${MAX_PLAYERS} 人）` });
          conn.close();
          return;
        }
        const player = joinPlayer(this.state, msg.playerId, msg.name, msg.linkedUserId ?? null, now);
        this.remember(conn, { role: "player", playerId: player.id });
        await this.persist();
        this.send(conn, {
          type: "STATE",
          state: this.playerView(this.state),
          questions: this.publicQuestions,
          you: player,
        });
        // 交卷過或房間已結束，重連時要把正解帶回去
        if (player.submitted || this.state.status === "ENDED") {
          this.send(conn, { type: "REVEAL", questions: this.bank.questions });
        }
        this.broadcastPlayerToHost(player);
        return;
      }

      case "ANSWER": {
        const m = this.meta.get(conn.id);
        if (m?.role !== "player" || !m.playerId) return;
        const out = submitAnswer(this.state, this.bank, m.playerId, msg.questionId, msg.value, now);
        if (!out.ok) {
          this.send(conn, { type: "ERROR", message: out.reason });
          return;
        }
        await this.persist();
        // 學生自己要立刻看到分數變化，老師端要即時看到那一格亮起來
        this.send(conn, { type: "PLAYER_UPDATE", player: out.player });
        this.broadcastPlayerToHost(out.player);
        return;
      }

      case "SUBMIT": {
        const m = this.meta.get(conn.id);
        if (m?.role !== "player" || !m.playerId) return;
        const player = submitPaper(this.state, m.playerId, now);
        if (!player) return;
        await this.persist();
        this.send(conn, { type: "PLAYER_UPDATE", player });
        // 交卷後才給正解與解析，交卷前拿不到
        this.send(conn, { type: "REVEAL", questions: this.bank.questions });
        this.broadcastPlayerToHost(player);
        return;
      }

      case "HOST_START": {
        if (this.meta.get(conn.id)?.role !== "host") return;
        startRoom(this.state, this.bank, now);
        await this.persist();
        this.broadcastState();
        await this.scheduleAlarm();
        return;
      }

      case "HOST_END": {
        if (this.meta.get(conn.id)?.role !== "host") return;
        await this.finish(now);
        return;
      }

      case "HOST_KICK": {
        if (this.meta.get(conn.id)?.role !== "host") return;
        delete this.state.players[msg.playerId];
        await this.persist();
        for (const c of this.getConnections()) {
          if (this.meta.get(c.id)?.playerId === msg.playerId) {
            this.send(c, { type: "ERROR", message: "老師已將你移出這個房間" });
            c.close();
          }
        }
        this.broadcastState();
        return;
      }

      case "HOST_EXTEND": {
        if (this.meta.get(conn.id)?.role !== "host") return;
        if (this.state.status === "RUNNING" && this.state.endsAt > 0) {
          this.state.endsAt += msg.minutes * 60_000;
          await this.persist();
          this.broadcastState();
          await this.scheduleAlarm();
        }
        return;
      }
    }
  }

  revealToAll() {
    if (!this.bank) return;
    for (const conn of this.getConnections()) {
      this.send(conn, { type: "REVEAL", questions: this.bank.questions });
    }
  }

  /** 到點：時間到就收卷；到期就整間刪除。不能只靠老師還開著頁面 */
  async alarm() {
    if (!this.state) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const now = Date.now();
    const due = this.nextAlarmAt();
    if (now < due) {
      // 提早醒（例如老師延長了時間），重排就好
      await this.scheduleAlarm();
      return;
    }
    if (this.state.status === "RUNNING") {
      await this.finish(now);
      return;
    }
    // LOBBY 放太久，或結束超過保留期限：刪掉整間，學生姓名與作答不留在伺服器
    await this.purge();
  }

  async purge() {
    for (const conn of this.getConnections()) {
      this.send(conn, { type: "ERROR", message: "這個房間已經過期關閉" });
      conn.close();
    }
    this.bank = null;
    this.state = null;
    this.hostToken = "";
    this.publicQuestions = [];
    this.meta.clear();
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  onClose(conn: Connection) {
    const m = this.meta.get(conn.id);
    if (m?.role === "player" && m.playerId && this.state?.players[m.playerId]) {
      // 只標成離線、不刪資料：學生手機鎖屏或切 App 是常態，回來要接得上
      this.state.players[m.playerId].isOnline = false;
      this.broadcastPlayerToHost(this.state.players[m.playerId]);
      void this.persist();
    }
    this.meta.delete(conn.id);
  }
}

/** 開房要限流：抓 /parties/quiz-room/<代碼>/create */
function isCreateRequest(request: Request): boolean {
  return request.method === "POST" && /^\/parties\/quiz-room\/[^/]+\/create$/.test(new URL(request.url).pathname);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (isCreateRequest(request)) {
      const cors = { "Access-Control-Allow-Origin": "*" };
      // 先看標頭擋掉超大請求，不必把本文讀進來、也不必喚醒房間（房間內還有一道讀完後的檢查）
      const declared = Number(request.headers.get("Content-Length") ?? "0");
      if (declared > MAX_CREATE_BYTES) {
        return Response.json({ error: "題庫檔太大了（上限 512KB）" }, { status: 413, headers: cors });
      }
      if (env.CREATE_LIMITER) {
        const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
        const { success } = await env.CREATE_LIMITER.limit({ key: `create:${ip}` });
        if (!success) {
          return Response.json({ error: "開房太頻繁了，請等一分鐘再試" }, { status: 429, headers: cors });
        }
      }
    }
    const routed = await routePartykitRequest(request, env as unknown as Record<string, unknown>);
    if (routed) return routed;
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
