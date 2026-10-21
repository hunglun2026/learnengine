// 引擎核心的測試。判分與房間狀態是「算錯了學生分數就錯」的地方，
// 這一層一定要有測試擋著。
import test from "node:test";
import assert from "node:assert/strict";
import { gradeAnswer } from "../src/grade.ts";
import { readdirSync, readFileSync } from "node:fs";
import { parseClientMessage, parseQuestionBank } from "../src/schema.ts";
import { createRoomState, endRoom, joinPlayer, ranking, startRoom, submitAnswer, submitPaper } from "../src/room.ts";
import type { Question, QuestionBank } from "../src/types.ts";
import { gradebookFileName } from "../src/export.ts";

const bank: QuestionBank = parseQuestionBank({
  title: "測試卷",
  meta: { grade: "國小五年級", subject: "自然科學" },
  timeLimitMinutes: 10,
  questions: [
    { id: "q1", type: "single", text: "1+1=?", options: ["1", "2", "3", "4"], answer: [1], score: 25 },
    { id: "q2", type: "multiple", text: "哪些是偶數", options: ["1", "2", "3", "4"], answer: [1, 3], score: 25 },
    { id: "q3", type: "fill", text: "台灣最高的山", options: [], answer: ["玉山"], score: 25 },
    { id: "q4", type: "short", text: "水的化學式", options: [], answer: ["H2O", "h₂o"], score: 25 },
  ],
});

const q = (id: string) => bank.questions.find((x) => x.id === id) as Question;

test("單選題只有完全相符才給分", () => {
  assert.equal(gradeAnswer(q("q1"), [1]).score, 25);
  assert.equal(gradeAnswer(q("q1"), [0]).score, 0);
  assert.equal(gradeAnswer(q("q1"), "2").score, 0, "型別不對不能給分");
});

test("複選題全對才給分、順序不影響", () => {
  assert.equal(gradeAnswer(q("q2"), [3, 1]).isCorrect, true);
  assert.equal(gradeAnswer(q("q2"), [1]).isCorrect, false, "只選一半不給分");
  assert.equal(gradeAnswer(q("q2"), [1, 3, 0]).isCorrect, false, "多選也不給分");
  assert.equal(gradeAnswer(q("q2"), [1, 1, 3]).isCorrect, true, "重複選同一個不該被判錯");
});

test("填充題會吸收空白與全形差異", () => {
  assert.equal(gradeAnswer(q("q3"), " 玉山 ").isCorrect, true);
  assert.equal(gradeAnswer(q("q3"), "玉山。").isCorrect, true, "句號不該影響對錯");
  assert.equal(gradeAnswer(q("q3"), "阿里山").isCorrect, false);
  assert.equal(gradeAnswer(q("q3"), "").isCorrect, false, "空字串不算答對");
});

test("簡答題大小寫與全形英數視為相同", () => {
  assert.equal(gradeAnswer(q("q4"), "h2o").isCorrect, true);
  assert.equal(gradeAnswer(q("q4"), "Ｈ２Ｏ").isCorrect, true, "全形輸入是手機常態");
});

test("題庫格式錯誤要擋下來", () => {
  assert.throws(
    () =>
      parseQuestionBank({
        title: "壞卷",
        meta: { grade: "一年級", subject: "數學" },
        timeLimitMinutes: 0,
        questions: [{ id: "q1", type: "single", text: "x", options: ["a", "b"], answer: [5], score: 10 }],
      }),
    /超出選項數量/
  );
  assert.throws(
    () =>
      parseQuestionBank({
        title: "重複題號",
        meta: { grade: "一年級", subject: "數學" },
        timeLimitMinutes: 0,
        questions: [
          { id: "q1", type: "single", text: "x", options: ["a", "b"], answer: [0], score: 10 },
          { id: "q1", type: "single", text: "y", options: ["a", "b"], answer: [0], score: 10 },
        ],
      }),
    /重複/
  );
});

test("作答流程：改答案重算分數、交卷後不能再改", () => {
  const state = createRoomState("ABC123", bank);
  const now = Date.now();
  joinPlayer(state, "p1", "小明", null, now);

  // 還沒開始不能作答
  assert.equal(submitAnswer(state, bank, "p1", "q1", [1], now).ok, false);

  startRoom(state, bank, now);
  assert.equal(submitAnswer(state, bank, "p1", "q1", [0], now).ok, true);
  assert.equal(state.players.p1.totalScore, 0, "答錯是 0 分");

  assert.equal(submitAnswer(state, bank, "p1", "q1", [1], now + 1).ok, true);
  assert.equal(state.players.p1.totalScore, 25, "改成正解要重算成 25");
  assert.equal(state.players.p1.answered, 1, "改答案不應該讓作答題數變成 2");

  submitPaper(state, "p1", now + 2);
  const after = submitAnswer(state, bank, "p1", "q2", [1, 3], now + 3);
  assert.equal(after.ok, false, "交卷後不能再作答");
});

test("斷線重連保留分數，中途加入的人不擋", () => {
  const state = createRoomState("ABC123", bank);
  const now = Date.now();
  joinPlayer(state, "p1", "小明", null, now);
  startRoom(state, bank, now);
  submitAnswer(state, bank, "p1", "q1", [1], now);

  // 模擬斷線後重整回來
  state.players.p1.isOnline = false;
  const again = joinPlayer(state, "p1", "小明", null, now + 5000);
  assert.equal(again.totalScore, 25, "重連不能把分數清掉");
  assert.equal(again.isOnline, true);

  const late = joinPlayer(state, "p2", "小華", null, now + 6000);
  assert.equal(late.totalScore, 0, "中途加入從 0 開始，但可以進來");
});

test("時間到自動結束會把沒交的人標成交卷", () => {
  const state = createRoomState("ABC123", bank);
  const now = Date.now();
  joinPlayer(state, "p1", "小明", null, now);
  startRoom(state, bank, now);
  endRoom(state, now + 60_000);
  assert.equal(state.status, "ENDED");
  assert.equal(state.players.p1.submitted, true);
});

test("排行榜：分數高的在前，同分先交卷的在前", () => {
  const state = createRoomState("ABC123", bank);
  const now = Date.now();
  joinPlayer(state, "p1", "小明", null, now);
  joinPlayer(state, "p2", "小華", null, now);
  joinPlayer(state, "p3", "小美", null, now);
  startRoom(state, bank, now);

  submitAnswer(state, bank, "p1", "q1", [1], now + 100);
  submitAnswer(state, bank, "p2", "q1", [1], now + 50);
  submitAnswer(state, bank, "p3", "q1", [0], now + 10);
  submitPaper(state, "p1", now + 300);
  submitPaper(state, "p2", now + 200);

  const order = ranking(state).map((p) => p.id);
  assert.deepEqual(order, ["p2", "p1", "p3"]);
});

test("前端訊息驗證：合法的放行，亂送的擋掉", () => {
  const ok = (m: unknown) => parseClientMessage(JSON.stringify(m));
  assert.equal(ok({ type: "JOIN", role: "player", name: "小明", playerId: "a1-b2" })?.type, "JOIN");
  assert.equal(ok({ type: "JOIN", role: "host", hostToken: "x".repeat(36) })?.type, "JOIN");
  assert.equal(ok({ type: "ANSWER", questionId: "q1", value: [0, 2] })?.type, "ANSWER");
  assert.equal(ok({ type: "ANSWER", questionId: "q3", value: "光合作用" })?.type, "ANSWER");
  assert.equal(ok({ type: "HOST_EXTEND", minutes: 5 })?.type, "HOST_EXTEND");

  assert.equal(ok({ type: "JOIN", role: "player", name: "x".repeat(21), playerId: "a1" }), null, "姓名超過 20 字");
  assert.equal(ok({ type: "JOIN", role: "player", name: "   ", playerId: "a1" }), null, "姓名只有空白");
  assert.equal(ok({ type: "JOIN", role: "player", name: "小明", playerId: "<script>" }), null, "playerId 有怪字元");
  assert.equal(ok({ type: "ANSWER", questionId: "q1", value: { a: 1 } }), null, "答案型別不對");
  assert.equal(ok({ type: "ANSWER", questionId: "q3", value: "字".repeat(501) }), null, "作答太長");
  assert.equal(ok({ type: "HOST_EXTEND", minutes: 99999 }), null, "延長太多");
  assert.equal(ok({ type: "DROP_TABLE" }), null, "不認識的訊息");
  assert.equal(parseClientMessage("not json"), null);
  assert.equal(parseClientMessage("x".repeat(5000)), null, "整則訊息太大");
  assert.equal(parseClientMessage(new ArrayBuffer(8)), null, "二進位訊息");
});

test("題庫錯誤訊息是中文，並指出哪個欄位", () => {
  const bad = { ...bank, title: "標".repeat(101) };
  assert.throws(() => parseQuestionBank(bad), /title：最多 100 個字/);
  const noMeta = { title: "x", questions: bank.questions };
  assert.throws(() => parseQuestionBank(noMeta), /meta：缺少這個欄位/);
});

test("成績檔名用當地時間，標題的非法字元會被換掉", () => {
  const at = new Date(2026, 9, 21, 10, 53);
  assert.equal(gradebookFileName("光的折射", at), "光的折射_成績_2026-10-21_1053.xlsx");
  assert.equal(gradebookFileName("五年級/自然: 第1課?", at), "五年級＿自然＿ 第1課＿_成績_2026-10-21_1053.xlsx");
});

test("questions 資料夾的每份題庫都要通過驗證（含字數上限）", () => {
  const dir = new URL("../../lunquiz-live/questions/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.doesNotThrow(() => parseQuestionBank(JSON.parse(readFileSync(new URL(f, dir), "utf8"))), f);
  }
});
