import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGameSet,
  parseGameSetText,
  effectivePairs,
  effectiveQuiz,
  availableGames,
  shuffle,
} from "../src/lib/gameset.ts";

const pairs = [
  { a: "apple", b: "蘋果" },
  { a: "banana", b: "香蕉" },
  { a: "cat", b: "貓" },
  { a: "dog", b: "狗" },
  { a: "egg", b: "蛋" },
];
const quizzes = [
  { text: "1 + 1 = ?", options: ["1", "2", "3"], answer: 1 },
  { text: "2 + 2 = ?", options: ["3", "4", "5"], answer: "4" },
  { text: "3 + 3 = ?", options: ["6", "7"], answer: "A" },
];

test("只有詞對：可玩配對與翻牌，也能自動出選擇題", () => {
  const set = parseGameSet({ title: "英文單字", pairs });
  assert.deepEqual(availableGames(set), { match: true, memory: true, spinner: true, whack: true, quiz: true });
  const qs = effectiveQuiz(set)!;
  assert.equal(qs.length, 5);
  for (const q of qs) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4, "選項不能重複");
    const p = pairs.find((x) => x.a === q.text)!;
    assert.equal(q.options[q.answer], p.b, "正解要對到詞對右邊");
  }
});

test("只有選擇題：答案可寫成索引、選項文字、A/B/C", () => {
  const set = parseGameSet({ title: "數學", questions: quizzes });
  assert.deepEqual(set.questions.map((q) => q.answer), [1, 1, 0]);
  assert.equal(set.questions[0]!.id, "q1");
});

test("短題目的選擇題可推出詞對，長題目不行", () => {
  const set = parseGameSet({ title: "數學", questions: [...quizzes, { text: "4 + 4 = ?", options: ["8", "9"], answer: 0 }] });
  assert.equal(effectivePairs(set)!.length, 4);
  const longSet = parseGameSet({
    title: "長題",
    questions: [1, 2, 3].map((i) => ({
      text: "這是一個非常非常非常非常非常長的題目，不適合放在卡片上" + i,
      options: ["甲", "乙"],
      answer: 0,
    })),
  });
  assert.equal(effectivePairs(longSet), null);
  assert.equal(availableGames(longSet).match, false);
  assert.equal(availableGames(longSet).quiz, true);
});

test("Gemini 常見外框與別名都能讀", () => {
  const text = "好的，這是題庫：\n```json\n" + JSON.stringify({ title: "T", meta: { grade: "五年級", subject: "自然" }, pairs: pairs.map((p) => ({ term: p.a, definition: p.b })) }) + "\n```\n祝順利";
  const set = parseGameSetText(text);
  assert.equal(set.grade, "五年級");
  assert.equal(set.pairs[0]!.a, "apple");
});

test("錯誤訊息要指出哪一題", () => {
  assert.throws(
    () => parseGameSet({ title: "T", questions: [{ text: "x", options: ["a", "b"], answer: 5 }, ...quizzes] }),
    /第 1 題：正解對不到任何一個選項/,
  );
  assert.throws(() => parseGameSet({ title: "T", pairs: pairs.slice(0, 2) }), /詞對至少要 4 組/);
  assert.throws(() => parseGameSet({ title: "T" }), /內容不夠玩/);
  assert.throws(() => parseGameSetText("沒有 JSON"), /找不到 JSON/);
  assert.throws(() => parseGameSetText('{"title": "T",}'), /JSON 讀不懂/);
});

test("洗牌不遺失元素，且可用固定亂數重現", () => {
  const arr = [1, 2, 3, 4, 5, 6];
  const rng = () => 0.3;
  assert.deepEqual(shuffle(arr, rng), shuffle(arr, rng));
  assert.deepEqual([...shuffle(arr)].sort(), arr);
});

import { shuffleOptions, chunk } from "../src/lib/gameset.ts";

test("洗選項後正解仍指向同一段文字", () => {
  const q = { id: "q", text: "t", options: ["甲", "乙", "丙", "丁"], answer: 2 };
  for (let i = 0; i < 30; i++) {
    const s = shuffleOptions(q);
    assert.equal(s.options[s.answer], "丙");
    assert.deepEqual([...s.options].sort(), [...q.options].sort());
  }
});

test("切組：最後一組太小就併進前一組", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7], 6).map((g) => g.length), [7]);
  assert.deepEqual(chunk([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 6).map((g) => g.length), [6, 4]);
  assert.deepEqual(chunk([1, 2, 3], 6).map((g) => g.length), [3]);
});

test("詞對左右重複的會被去掉，剩下不夠就不能玩配對", () => {
  const dup = parseGameSet({
    title: "重複",
    pairs: [
      { a: "甲", b: "一" },
      { a: "乙", b: "一" },
      { a: "甲", b: "二" },
      { a: "丙", b: "三" },
      { a: "丁", b: "四" },
    ],
  });
  assert.equal(effectivePairs(dup), null, "去重後只剩 3 組，不夠 4 組");
  assert.equal(availableGames(dup).match, false);
  assert.equal(availableGames(dup).quiz, true, "選擇題仍可由詞對自動產生");
});

import { readFileSync } from "node:fs";

test("真實 Gemini 回覆（網頁複製帶出單獨一行「JSON」標籤）可直接解析並玩五款遊戲", () => {
  for (const f of ["gemini-real-light-1.txt", "gemini-real-light-2.txt"]) {
    const raw = readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf-8");
    assert.ok(raw.trimStart().startsWith("JSON"), "這份樣本本來就帶著多餘的 JSON 標籤");
    const set = parseGameSetText(raw);
    assert.equal(set.pairs.length, 8);
    assert.equal(set.questions.length, 8);
    assert.deepEqual(availableGames(set), { match: true, memory: true, spinner: true, whack: true, quiz: true });
  }
});

import { buildPrompt } from "../src/lib/prompt.ts";

test("出題指令帶入數量與年級，並包含品質規則（防最長選項、臺灣用語、超綱）", () => {
  const p = buildPrompt({ grade: "國小五年級", subject: "自然", scope: "光", pairCount: 40, quizCount: 30 });
  assert.match(p, /pairs 共 40 組/);
  assert.match(p, /questions 共 30 題/);
  assert.match(p, /國小五年級/);
  assert.match(p, /正解不能特別長/);
  assert.match(p, /不要用中國大陸用語/);
  assert.match(p, /超出該年級的內容不要出/);
});
