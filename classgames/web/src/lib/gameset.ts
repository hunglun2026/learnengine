// 題庫格式（GameSet）：一份教材資料，五款遊戲共用。
// 設計重點：老師貼進來的多半是 Gemini 產的 JSON，格式常有小瑕疵（外面包 ```json、
// 答案寫成選項文字而不是編號），所以解析要寬鬆，但錯誤訊息要講清楚是哪一題、哪裡不對。
import { z } from "zod";

/** 詞對：左右兩邊要連起來的東西，例如「單字 / 意思」「詞語 / 定義」 */
export interface Pair {
  a: string;
  b: string;
}

/** 單選題 */
export interface Quiz {
  id: string;
  text: string;
  options: string[];
  /** 正解在 options 裡的索引（從 0 開始） */
  answer: number;
  explanation?: string;
}

export interface GameSet {
  title: string;
  grade: string;
  subject: string;
  scope: string;
  pairs: Pair[];
  questions: Quiz[];
}

export const LIMITS = {
  minPairs: 4,
  maxPairs: 40,
  minQuestions: 3,
  maxQuestions: 60,
  maxTextLen: 120,
  /** 詞對文字太長，卡片放不下 */
  maxPairLen: 40,
  /** 從題目推出詞對時，文字要短到能放進卡片 */
  derivedPairLen: 24,
} as const;

const text = (what: string) => z.string({ required_error: `缺少${what}`, invalid_type_error: `${what}要是文字` }).trim();

const pairSchema = z.object({
  a: text("詞對左邊").min(1, "詞對左邊不能是空的").max(LIMITS.maxPairLen, `詞對文字太長（超過 ${LIMITS.maxPairLen} 字）`),
  b: text("詞對右邊").min(1, "詞對右邊不能是空的").max(LIMITS.maxPairLen, `詞對文字太長（超過 ${LIMITS.maxPairLen} 字）`),
});

const quizSchema = z
  .object({
    id: z.string(),
    text: text("題目").min(1, "題目不能是空的").max(LIMITS.maxTextLen, `題目太長（超過 ${LIMITS.maxTextLen} 字）`),
    options: z
      .array(text("選項").min(1, "選項不能是空的").max(60, "選項太長（超過 60 字）"))
      .min(2, "選項至少要 2 個")
      .max(6, "選項最多 6 個"),
    answer: z.number().int(),
    explanation: z.string().trim().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.answer < 0 || q.answer >= q.options.length) {
      ctx.addIssue({ code: "custom", path: ["answer"], message: "正解對不到任何一個選項" });
    }
    if (new Set(q.options).size !== q.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "有重複的選項" });
    }
  });

const gameSetSchema = z
  .object({
    title: text("標題").min(1, "標題不能是空的").max(60, "標題太長（超過 60 字）"),
    grade: z.string().trim().default(""),
    subject: z.string().trim().default(""),
    scope: z.string().trim().default(""),
    pairs: z.array(pairSchema).max(LIMITS.maxPairs, `詞對最多 ${LIMITS.maxPairs} 組`).default([]),
    questions: z.array(quizSchema).max(LIMITS.maxQuestions, `題目最多 ${LIMITS.maxQuestions} 題`).default([]),
  })
  .superRefine((s, ctx) => {
    if (s.pairs.length < LIMITS.minPairs && s.questions.length < LIMITS.minQuestions) {
      ctx.addIssue({
        code: "custom",
        message: `內容不夠玩：至少要有 ${LIMITS.minPairs} 組詞對，或 ${LIMITS.minQuestions} 題選擇題`,
      });
    }
    if (s.pairs.length > 0 && s.pairs.length < LIMITS.minPairs) {
      ctx.addIssue({ code: "custom", path: ["pairs"], message: `詞對至少要 ${LIMITS.minPairs} 組才能玩（目前 ${s.pairs.length} 組）` });
    }
  });

/** 把各種常見的「差不多」寫法整理成標準格式，再交給 zod 檢查 */
function normalize(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...r };
  // 有些模型把 meta 包在裡面
  const meta = (r.meta && typeof r.meta === "object" ? r.meta : {}) as Record<string, unknown>;
  for (const k of ["grade", "subject", "scope"]) {
    if (out[k] === undefined && meta[k] !== undefined) out[k] = meta[k];
  }
  if (Array.isArray(r.pairs)) {
    out.pairs = r.pairs.map((p) => {
      if (Array.isArray(p) && p.length === 2) return { a: String(p[0] ?? ""), b: String(p[1] ?? "") };
      if (p && typeof p === "object") {
        const o = p as Record<string, unknown>;
        // 容許 term/definition、left/right、q/a 這類別名
        const a = o.a ?? o.term ?? o.left ?? o.q ?? o.word;
        const b = o.b ?? o.definition ?? o.right ?? o.meaning;
        return { a: typeof a === "number" ? String(a) : a, b: typeof b === "number" ? String(b) : b };
      }
      return p;
    });
  }
  if (Array.isArray(r.questions)) {
    out.questions = r.questions.map((q, i) => {
      if (!q || typeof q !== "object") return q;
      const o = { ...(q as Record<string, unknown>) };
      o.id = typeof o.id === "string" && o.id ? o.id : `q${i + 1}`;
      o.text = o.text ?? o.question ?? o.q;
      const opts = Array.isArray(o.options) ? (o.options as unknown[]).map((x) => String(x ?? "")) : o.options;
      o.options = opts;
      // 答案可能是索引、數字字串、A/B/C/D 或選項文字
      let ans = o.answer ?? o.correct ?? o.answerIndex;
      if (Array.isArray(ans) && ans.length === 1) ans = ans[0];
      if (typeof ans === "string" && Array.isArray(opts)) {
        const s = ans.trim();
        const byText = opts.indexOf(s);
        if (byText >= 0) ans = byText;
        else if (/^[A-Fa-f]$/.test(s)) ans = s.toUpperCase().charCodeAt(0) - 65;
        else if (/^\d+$/.test(s)) ans = Number(s);
      }
      o.answer = ans;
      return o;
    });
  }
  return out;
}

/** 驗證並回傳題庫；壞掉時丟出人看得懂的中文訊息 */
export function parseGameSet(raw: unknown): GameSet {
  const result = gameSetSchema.safeParse(normalize(raw));
  if (!result.success) {
    const lines = result.error.issues.slice(0, 8).map((i) => {
      const p = i.path;
      let where = "整份題庫";
      if (p[0] === "pairs" && typeof p[1] === "number") where = `第 ${p[1] + 1} 組詞對`;
      else if (p[0] === "questions" && typeof p[1] === "number") where = `第 ${p[1] + 1} 題`;
      else if (p[0] === "pairs") where = "詞對";
      else if (p[0] === "questions") where = "題目";
      else if (p[0] === "title") where = "標題";
      return `・${where}：${i.message}`;
    });
    const more = result.error.issues.length > 8 ? `\n・還有 ${result.error.issues.length - 8} 個問題沒列出` : "";
    throw new Error(`題庫格式有問題：\n${lines.join("\n")}${more}`);
  }
  const set = result.data as GameSet;
  const ids = new Set<string>();
  for (const q of set.questions) {
    if (ids.has(q.id)) throw new Error(`題庫格式有問題：\n・題號 ${q.id} 重複了`);
    ids.add(q.id);
  }
  return set;
}

/** 從貼上的文字解析：容許外面包 ```json 或前後有說明文字 */
export function parseGameSetText(input: string): GameSet {
  const s = input.trim();
  if (!s) throw new Error("還沒貼任何內容");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("找不到 JSON：內容要從 { 開始、到 } 結束");
  let raw: unknown;
  try {
    raw = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    throw new Error(`JSON 讀不懂：${(e as Error).message}\n常見原因：最後一項後面多了逗號，或引號不成對`);
  }
  return parseGameSet(raw);
}

export type Rng = () => number;

/** Fisher-Yates 洗牌；rng 可注入，測試時才能固定結果 */
export function shuffle<T>(arr: readonly T[], rng: Rng = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 給配對、翻牌用的詞對。
 * 有寫詞對就直接用；沒有的話，從「題目短、正解也短」的選擇題推出來；都沒有就回 null。
 */
export function effectivePairs(set: GameSet): Pair[] | null {
  let list: Pair[] = set.pairs;
  if (list.length < LIMITS.minPairs) {
    list = [];
    for (const q of set.questions) {
      const right = q.options[q.answer]!;
      if (q.text.length <= LIMITS.derivedPairLen && right.length <= LIMITS.derivedPairLen) {
        list.push({ a: q.text, b: right });
      }
    }
  }
  // 左右兩邊都不能重複，不然「點哪個才對」會有兩個答案，配對與翻牌都會亂
  const seenA = new Set<string>();
  const seenB = new Set<string>();
  const unique = list.filter((p) => {
    if (seenA.has(p.a) || seenB.has(p.b)) return false;
    seenA.add(p.a);
    seenB.add(p.b);
    return true;
  });
  return unique.length >= LIMITS.minPairs ? unique : null;
}

/**
 * 給測驗、轉盤、打地鼠用的選擇題。
 * 有題目就直接用；沒有的話，用詞對自動出題：干擾項取自其他詞對的右邊。
 */
export function effectiveQuiz(set: GameSet, rng: Rng = Math.random): Quiz[] | null {
  if (set.questions.length >= LIMITS.minQuestions) return set.questions;
  if (set.pairs.length < LIMITS.minPairs) return null;
  return set.pairs.map((p, i) => {
    const others = shuffle(
      Array.from(new Set(set.pairs.filter((x, j) => j !== i && x.b !== p.b).map((x) => x.b))),
      rng,
    ).slice(0, 3);
    const options = shuffle([p.b, ...others], rng);
    return { id: `p${i + 1}`, text: p.a, options, answer: options.indexOf(p.b) };
  });
}

export type GameId = "match" | "memory" | "spinner" | "whack" | "quiz";

export function availableGames(set: GameSet): Record<GameId, boolean> {
  const hasPairs = effectivePairs(set) !== null;
  const hasQuiz = effectiveQuiz(set) !== null;
  return { match: hasPairs, memory: hasPairs, spinner: hasQuiz, whack: hasQuiz, quiz: hasQuiz };
}

/** 洗選項順序並重算正解索引，避免每次都是同一個位置 */
export function shuffleOptions(q: Quiz, rng: Rng = Math.random): Quiz {
  const right = q.options[q.answer]!;
  const options = shuffle(q.options, rng);
  return { ...q, options, answer: options.indexOf(right) };
}

/** 把陣列切成每組最多 size 個；最後一組太小（< min）就併進前一組 */
export function chunk<T>(arr: readonly T[], size: number, min = 3): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  if (out.length > 1 && out[out.length - 1]!.length < min) {
    const last = out.pop()!;
    out[out.length - 1]!.push(...last);
  }
  return out;
}
