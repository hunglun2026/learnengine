// 房間邏輯：只做狀態轉換，不碰 WebSocket 也不碰儲存。
// 這樣同一套規則可以被 worker 呼叫，也可以直接寫測試，
// 以後若要掛回 el 平台（不同的傳輸層）也不用重寫。
import { gradeAnswer, totalScoreOf } from "./grade.ts";
import type {
  AnswerRecord,
  Player,
  PublicQuestion,
  Question,
  QuestionBank,
  RoomState,
} from "./types.ts";

export function toPublicQuestions(questions: Question[]): PublicQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    options: q.options,
    score: q.score,
  }));
}

export function createRoomState(roomId: string, bank: QuestionBank): RoomState {
  return {
    roomId,
    status: "LOBBY",
    bankTitle: bank.title,
    startedAt: 0,
    endsAt: 0,
    players: {},
    questionCount: bank.questions.length,
    totalScore: totalScoreOf(bank.questions),
  };
}

export function createPlayer(id: string, name: string, linkedUserId: string | null, now: number): Player {
  return {
    id,
    name,
    linkedUserId,
    isOnline: true,
    joinedAt: now,
    lastActive: now,
    answers: {},
    totalScore: 0,
    answered: 0,
    submitted: false,
    submittedAt: null,
  };
}

/**
 * 學生加入。
 * 同一個 playerId 重新連線視為「重連」，保留原本的分數與作答，
 * 這是上課現場最常發生的事（手機鎖屏、切到別的 App、不小心重整）。
 */
export function joinPlayer(
  state: RoomState,
  playerId: string,
  name: string,
  linkedUserId: string | null,
  now: number
): Player {
  const existing = state.players[playerId];
  if (existing) {
    existing.isOnline = true;
    existing.lastActive = now;
    // 名字允許改（換裝置重新輸入），但不清空作答
    if (name) existing.name = name;
    if (linkedUserId) existing.linkedUserId = linkedUserId;
    return existing;
  }
  // 中途加入是允許的：前面沒作答的題目就是 0 分，不擋人進來
  const player = createPlayer(playerId, name, linkedUserId, now);
  state.players[playerId] = player;
  return player;
}

export function startRoom(state: RoomState, bank: QuestionBank, now: number): void {
  if (state.status !== "LOBBY") return;
  state.status = "RUNNING";
  state.startedAt = now;
  state.endsAt = bank.timeLimitMinutes > 0 ? now + bank.timeLimitMinutes * 60_000 : 0;
}

export function endRoom(state: RoomState, now: number): void {
  if (state.status === "ENDED") return;
  state.status = "ENDED";
  state.endsAt = now;
  for (const p of Object.values(state.players)) {
    if (!p.submitted) {
      p.submitted = true;
      p.submittedAt = now;
    }
  }
}

/** 時間到了沒？由伺服器判斷，前端的倒數只是顯示用 */
export function isExpired(state: RoomState, now: number): boolean {
  return state.status === "RUNNING" && state.endsAt > 0 && now >= state.endsAt;
}

export type AnswerOutcome =
  | { ok: true; record: AnswerRecord; player: Player }
  | { ok: false; reason: string };

/**
 * 記錄一題作答。
 * 交卷前可以改答案（整份卷子自由作答的常態），改答案就重算該題分數。
 */
export function submitAnswer(
  state: RoomState,
  bank: QuestionBank,
  playerId: string,
  questionId: string,
  value: number[] | string,
  now: number
): AnswerOutcome {
  if (state.status !== "RUNNING") return { ok: false, reason: "現在不是作答時間" };
  if (isExpired(state, now)) return { ok: false, reason: "作答時間已經結束" };

  const player = state.players[playerId];
  if (!player) return { ok: false, reason: "找不到這位學生" };
  if (player.submitted) return { ok: false, reason: "已經交卷了，不能再改答案" };

  const q = bank.questions.find((x) => x.id === questionId);
  if (!q) return { ok: false, reason: "找不到這一題" };

  const { isCorrect, score } = gradeAnswer(q, value);
  const record: AnswerRecord = { questionId, value, isCorrect, score, at: now };
  player.answers[questionId] = record;
  player.answered = Object.keys(player.answers).length;
  player.totalScore = Object.values(player.answers).reduce((s, a) => s + a.score, 0);
  player.lastActive = now;

  return { ok: true, record, player };
}

export function submitPaper(state: RoomState, playerId: string, now: number): Player | null {
  const player = state.players[playerId];
  if (!player || player.submitted) return null;
  player.submitted = true;
  player.submittedAt = now;
  player.lastActive = now;
  return player;
}

/** 老師端排行榜：分數高的在前，同分時先交卷的在前 */
export function ranking(state: RoomState): Player[] {
  return Object.values(state.players).sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const at = a.submittedAt ?? a.lastActive;
    const bt = b.submittedAt ?? b.lastActive;
    return at - bt;
  });
}
