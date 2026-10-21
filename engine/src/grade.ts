// 判分。純函式、沒有任何 I/O，因為它同時要跑在 worker 端（權威判分）
// 與測試裡，也可能被 el 平台重用。
import type { Question } from "./types.ts";

/**
 * 填充／簡答的比對只做「去空白、統一全半形、忽略大小寫」後的字面相等。
 * 這是刻意的限制：課堂即時監看需要立即出分數，等 AI 判斷意思對不對再回來太慢。
 * 老師端看得到學生原始作答，判錯了可以自己在成績檔上改。
 */
export function normalizeText(s: string): string {
  return s
    .trim()
    .toLowerCase()
    // 全形英數與全形空白轉半形
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ")
    // 中間的空白一律收成一個
    .replace(/\s+/g, " ")
    // 常見的中文標點差異不該影響對錯
    .replace(/[，、。．,.]/g, "");
}

export interface GradeResult {
  isCorrect: boolean;
  score: number;
}

export function gradeAnswer(q: Question, value: number[] | string): GradeResult {
  const wrong: GradeResult = { isCorrect: false, score: 0 };

  if (q.type === "single" || q.type === "multiple") {
    if (!Array.isArray(value)) return wrong;
    const correct = (q.answer as number[]).map(Number).sort((a, b) => a - b);
    const got = Array.from(new Set(value.map(Number))).sort((a, b) => a - b);
    // 複選題採全對才給分，不做部分分數：課堂即時排行榜要能一眼看懂
    const same = correct.length === got.length && correct.every((v, i) => v === got[i]);
    return same ? { isCorrect: true, score: q.score } : wrong;
  }

  if (typeof value !== "string") return wrong;
  const got = normalizeText(value);
  if (!got) return wrong;
  const accepted = (q.answer as string[]).map(normalizeText);
  return accepted.includes(got) ? { isCorrect: true, score: q.score } : wrong;
}

/** 整份卷子的總分，開房時算一次 */
export function totalScoreOf(questions: Question[]): number {
  return questions.reduce((sum, q) => sum + (Number(q.score) || 0), 0);
}
