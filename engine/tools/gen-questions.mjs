#!/usr/bin/env node --experimental-strip-types
/**
 * 離線生題：呼叫 Gemini API 產生題庫檔，存成 questions/*.json。
 * 上課現場不呼叫 API——題目先生好、人工看過再進 repo，
 * 才不會因為 API 掛掉或生出爛題而毀掉一堂課。
 *
 * 用法（在 learnengine 根目錄）：
 *   $env:GEMINI_API_KEY="xxx"
 *   node engine/tools/gen-questions.mjs --grade "國小五年級" --subject "自然科學" `
 *     --scope "光的折射" --count 10 --type 全部單選題 --difficulty 普通 `
 *     --out lunquiz-live/questions/light.json
 *
 * 參數名稱刻意跟 lunquiz 出題小幫手一致，兩邊的設定可以互相搬。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith("--") ? next : "true";
  }
}

const cfg = {
  grade: args.grade ?? "國小五年級",
  subject: args.subject ?? "自然科學",
  publisher: args.publisher ?? "",
  scope: args.scope ?? "",
  count: Number(args.count ?? 10),
  type: args.type ?? "全部單選題",
  difficulty: args.difficulty ?? "普通",
  language: args.language ?? "繁體中文",
  timeLimit: Number(args.timeLimit ?? 0),
  out: args.out ?? "questions/output.json",
};

const KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS?.split(",")[0]?.trim();
if (!KEY) {
  console.error("找不到金鑰。請先設定環境變數 GEMINI_API_KEY（或 GEMINI_API_KEYS，逗號分隔多組）");
  process.exit(1);
}

// 比照 lunquiz 的雙模型容錯：前者失敗就退到後者，不要整批失敗
const MODELS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

const TYPE_HINT = {
  "全部單選題": '全部都是 type="single"（四個選項、一個正解）',
  "全部複選題": 'type="multiple"（四到五個選項、兩個以上正解）',
  "智慧混搭(單選+複選各半)": "single 與 multiple 各約一半",
  "全部填充題": 'type="fill"（沒有選項，answer 放可接受的答案字串，包含常見的同義寫法）',
  "全部簡答題(計算題)": 'type="short"（沒有選項，answer 放可接受的答案字串）',
};

const DIFFICULTY_HINT = {
  "基礎": "課本原文、觀念複習，看過課本就答得出來",
  "普通": "標準段考難度",
  "進階": "需要跨概念推理",
  "挑戰": "多步驟思考、情境轉換",
};

const perScore = Math.max(1, Math.round(100 / cfg.count));

const prompt = `你是台灣中小學的命題老師。請依下列條件出一份測驗題庫。

年級：${cfg.grade}
科目：${cfg.subject}
${cfg.publisher ? `版本：${cfg.publisher}\n` : ""}${cfg.scope ? `範圍：${cfg.scope}\n` : ""}題數：${cfg.count} 題
題型：${TYPE_HINT[cfg.type] ?? cfg.type}
難度：${DIFFICULTY_HINT[cfg.difficulty] ?? cfg.difficulty}
輸出語言：${cfg.language}

只回傳 JSON 陣列，不要任何說明文字、不要 markdown 圍欄。格式：
[
  {
    "id": "q1",
    "type": "single",
    "text": "題目文字",
    "options": ["選項A", "選項B", "選項C", "選項D"],
    "answer": [0],
    "score": ${perScore},
    "explanation": "為什麼是這個答案"
  }
]

規則：
- id 從 q1 開始依序編號
- 選擇題的 answer 是選項索引（從 0 開始）；填充/簡答題的 answer 是字串陣列，把學生可能寫的正確同義說法都列進去（填充題會用字面比對判分，漏列會誤判成答錯）
- 填充/簡答題的 options 一律給空陣列 []
- 每題 score 都給 ${perScore}
- 用台灣的教學用語與國字寫法，不要出現大陸用語
- 題目之間不要重複考同一個概念
- explanation 寫給學生看，兩句以內`;

async function callGemini(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`${model} 回 ${res.status}：${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${model} 沒有回傳內容（可能被安全過濾擋下或額度用盡）`);
  return JSON.parse(text);
}

let questions = null;
for (const model of MODELS) {
  try {
    process.stderr.write(`用 ${model} 出題中…\n`);
    questions = await callGemini(model);
    process.stderr.write(`${model} 生成成功\n`);
    break;
  } catch (e) {
    process.stderr.write(`${model} 失敗：${e.message}\n`);
  }
}
if (!questions) {
  console.error("所有模型都失敗了，沒有產生題庫");
  process.exit(1);
}

const list = Array.isArray(questions) ? questions : questions.questions ?? [];

/**
 * 模型偶爾會把選項索引寫成 1 開始（實測 gemini-3.5-flash 在最後一題滑掉過）。
 * 只有在「這題的所有索引都 >=1，而且最大的那個剛好等於選項數」時才整題減一——
 * 這個條件下 0-based 不可能成立，改了才安全；其餘情況一律不動，留給驗證去擋。
 */
let fixed = 0;
for (const q of list) {
  if ((q.type !== "single" && q.type !== "multiple") || !Array.isArray(q.answer)) continue;
  const idx = q.answer.map(Number);
  const n = (q.options ?? []).length;
  if (idx.length && idx.every((i) => i >= 1) && Math.max(...idx) === n) {
    q.answer = idx.map((i) => i - 1);
    fixed++;
  }
}
if (fixed) process.stderr.write(`修正了 ${fixed} 題把選項從 1 開始編號的錯誤\n`);

const bank = {
  title: `${cfg.grade}${cfg.subject}${cfg.scope ? "－" + cfg.scope : ""}`,
  meta: {
    grade: cfg.grade,
    subject: cfg.subject,
    ...(cfg.publisher ? { publisher: cfg.publisher } : {}),
    ...(cfg.scope ? { scope: cfg.scope } : {}),
    difficulty: cfg.difficulty,
    language: cfg.language,
    source: "Gemini 生成",
    createdAt: new Date().toISOString().slice(0, 10),
  },
  timeLimitMinutes: cfg.timeLimit,
  questions: list,
};

// 出廠驗證：壞掉的題庫寧可現在就吵，也不要等到上課開房才炸
const { parseQuestionBank } = await import("../src/schema.ts");
try {
  parseQuestionBank(bank);
} catch (e) {
  mkdirSync(dirname(cfg.out), { recursive: true });
  const bad = cfg.out.replace(/\.json$/, "") + ".壞掉.json";
  writeFileSync(bad, JSON.stringify(bank, null, 2), "utf8");
  console.error(`${e.message}\n\n生出來的東西存到 ${bad}，改好之後再改回正式檔名。`);
  process.exit(1);
}

mkdirSync(dirname(cfg.out), { recursive: true });
writeFileSync(cfg.out, JSON.stringify(bank, null, 2), "utf8");
console.log(`已寫入 ${cfg.out}（${bank.questions.length} 題）`);
console.log("下一步：自己看過題目，改掉不合適的，再拿去開房間。");
