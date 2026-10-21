// 題庫檔驗證。手寫或 AI 生成的 JSON 進來一律先過這一關，
// 壞掉的題庫要在開房前就被擋下，不要等上課時才炸。
import { z } from "zod";
import type { ClientMessage, QuestionBank } from "./types.ts";

// 字數上限：正常題目遠用不到，只是不讓上傳的題庫塞進超大內容拖垮房間
const questionBase = {
  id: z.string().min(1).max(100),
  text: z.string().min(1).max(2000),
  score: z.number().positive().max(100),
  explanation: z.string().max(2000).optional(),
};

const choiceQuestion = z.object({
  ...questionBase,
  type: z.enum(["single", "multiple"]),
  options: z.array(z.string().min(1).max(300)).min(2).max(8),
  answer: z.array(z.number().int().nonnegative()).min(1),
});

const textQuestion = z.object({
  ...questionBase,
  type: z.enum(["fill", "short"]),
  options: z.array(z.string()).max(0).default([]),
  answer: z.array(z.string().min(1).max(300)).min(1).max(20),
});

export const questionSchema = z
  .union([choiceQuestion, textQuestion])
  .superRefine((q, ctx) => {
    if (q.type === "single" && q.answer.length !== 1) {
      ctx.addIssue({ code: "custom", message: `單選題 ${q.id} 的正解必須剛好一個` });
    }
    if ((q.type === "single" || q.type === "multiple") && Array.isArray(q.answer)) {
      for (const i of q.answer as number[]) {
        if (i >= q.options.length) {
          ctx.addIssue({ code: "custom", message: `題目 ${q.id} 的正解索引 ${i} 超出選項數量` });
        }
      }
    }
  });

export const questionBankSchema = z.object({
  title: z.string().min(1).max(100),
  meta: z.object({
    grade: z.string().min(1),
    subject: z.string().min(1),
    publisher: z.string().optional(),
    scope: z.string().optional(),
    difficulty: z.string().optional(),
    language: z.string().optional(),
    source: z.string().optional(),
    createdAt: z.string().optional(),
  }),
  timeLimitMinutes: z.number().int().min(0).max(300).default(0),
  questions: z.array(questionSchema).min(1).max(200),
});

/** zod 預設訊息是英文，老師看不懂；常見的幾種改成中文，其餘退回預設 */
const zhErrorMap: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case "invalid_type":
      return { message: issue.received === "undefined" ? "缺少這個欄位" : `格式不對（應該是 ${issue.expected}，收到 ${issue.received}）` };
    case "too_small":
      return {
        message: issue.type === "string" ? `至少要 ${issue.minimum} 個字` : issue.type === "array" ? `至少要 ${issue.minimum} 項` : `不能小於 ${issue.minimum}`,
      };
    case "too_big":
      return {
        message: issue.type === "string" ? `最多 ${issue.maximum} 個字` : issue.type === "array" ? `最多 ${issue.maximum} 項` : `不能大於 ${issue.maximum}`,
      };
    case "invalid_enum_value":
      return { message: `只能是 ${issue.options.join("／")} 其中之一` };
    case "invalid_union":
      return { message: "題目格式不對：選擇題要有 options 與數字 answer，填充／簡答題要有文字 answer" };
    default:
      return { message: ctx.defaultError };
  }
};

/** 驗證並回傳題庫；壞掉時丟出人看得懂的錯誤訊息 */
export function parseQuestionBank(raw: unknown): QuestionBank {
  const result = questionBankSchema.safeParse(raw, { errorMap: zhErrorMap });
  if (!result.success) {
    const lines = result.error.issues.map((i) => `- ${i.path.join(".") || "(根層)"}：${i.message}`);
    throw new Error(`題庫檔格式有問題：\n${lines.join("\n")}`);
  }
  const bank = result.data;
  const ids = new Set<string>();
  for (const q of bank.questions) {
    if (ids.has(q.id)) throw new Error(`題庫檔格式有問題：題號 ${q.id} 重複了`);
    ids.add(q.id);
  }
  return bank as QuestionBank;
}

// ---- 前端送來的訊息 ----
// 伺服器對外公開，任何人都能直接連 WebSocket 亂送，所以每則訊息都要過這關，
// 長度上限也統一定在這裡（前端輸入框的 maxLength 只是方便，擋不住人）。

export const LIMITS = {
  /** 學生姓名或座號 */
  name: 20,
  /** 填充／簡答一題的作答字數 */
  answerText: 500,
  /** 一則 WebSocket 訊息的字元數 */
  message: 4_000,
  /** 老師一次最多延長幾分鐘 */
  extendMinutes: 30,
} as const;

// playerId 由前端 crypto.randomUUID() 產生；限制字元避免拿來塞怪東西
const idString = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

// JOIN 有老師與學生兩種，type 欄位重複，所以用 union 逐一比對，不用 discriminatedUnion
const clientMessageSchema = z.union([
  z.object({
    type: z.literal("JOIN"),
    role: z.literal("player"),
    name: z.string().trim().min(1).max(LIMITS.name),
    playerId: idString,
    linkedUserId: idString.nullable().optional(),
  }),
  z.object({ type: z.literal("JOIN"), role: z.literal("host"), hostToken: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("ANSWER"),
    questionId: z.string().min(1).max(100),
    value: z.union([z.array(z.number().int().min(0).max(7)).max(8), z.string().max(LIMITS.answerText)]),
  }),
  z.object({ type: z.literal("SUBMIT") }),
  z.object({ type: z.literal("HOST_START") }),
  z.object({ type: z.literal("HOST_END") }),
  z.object({ type: z.literal("HOST_KICK"), playerId: idString }),
  z.object({ type: z.literal("HOST_EXTEND"), minutes: z.number().int().min(1).max(LIMITS.extendMinutes) }),
]);

/** 解析一則前端訊息；格式不對、超過長度一律回 null，由呼叫端直接丟掉 */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== "string" || raw.length > LIMITS.message) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = clientMessageSchema.safeParse(data);
  return r.success ? (r.data as ClientMessage) : null;
}
