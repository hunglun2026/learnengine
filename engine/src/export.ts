// 成績匯出。一律產 .xlsx 不產 CSV：中文 CSV 在中文版 Excel 會變亂碼，
// 老師收到的是壞檔，這在課堂上沒有解釋空間。
import * as XLSX from "xlsx";
import type { Question, QuestionBank, RoomState } from "./types.ts";
import { ranking } from "./room.ts";

function answerToText(q: Question, value: number[] | string | undefined): string {
  if (value === undefined) return "";
  if (Array.isArray(value)) {
    // 選項索引轉成 A/B/C/D，老師看得懂的形式
    return value
      .slice()
      .sort((a, b) => a - b)
      .map((i) => String.fromCharCode(65 + i))
      .join("");
  }
  return value;
}

function correctToText(q: Question): string {
  if (q.type === "single" || q.type === "multiple") {
    return (q.answer as number[])
      .slice()
      .sort((a, b) => a - b)
      .map((i) => String.fromCharCode(65 + i))
      .join("");
  }
  return (q.answer as string[]).join(" / ");
}

/**
 * 產生成績活頁簿：
 * - 「總排名」：一人一列，看得到名次、分數、答對題數、交卷時間
 * - 「逐題明細」：一人一列、一題一欄，格子裡是學生實際填的答案，答錯會標記
 * - 「題目卷」：題目、正解、解析，方便老師事後檢討
 */
export function buildGradebook(state: RoomState, bank: QuestionBank): XLSX.WorkBook {
  const players = ranking(state);
  const qs = bank.questions;

  const summary = [
    ["名次", "姓名", "得分", "滿分", "得分率", "答對題數", "作答題數", "總題數", "交卷時間"],
    ...players.map((p, idx) => {
      const correct = Object.values(p.answers).filter((a) => a.isCorrect).length;
      return [
        idx + 1,
        p.name,
        p.totalScore,
        state.totalScore,
        state.totalScore > 0 ? Number((p.totalScore / state.totalScore).toFixed(3)) : 0,
        correct,
        p.answered,
        qs.length,
        p.submittedAt ? new Date(p.submittedAt).toLocaleString("zh-TW") : "未交卷",
      ];
    }),
  ];

  const detailHeader = ["姓名", "得分", ...qs.map((q, i) => `第${i + 1}題(${q.score}分)`)];
  const detail = [
    detailHeader,
    // 第二列先放正解，老師橫著對照最快
    ["正解", "", ...qs.map((q) => correctToText(q))],
    ...players.map((p) => [
      p.name,
      p.totalScore,
      ...qs.map((q) => {
        const a = p.answers[q.id];
        if (!a) return "未作答";
        const text = answerToText(q, a.value);
        return a.isCorrect ? text : `${text} ✗`;
      }),
    ]),
  ];

  const paper = [
    ["題號", "題型", "題目", "選項", "正解", "配分", "解析"],
    ...qs.map((q, i) => [
      i + 1,
      { single: "單選", multiple: "複選", fill: "填充", short: "簡答" }[q.type],
      q.text,
      q.options.map((o, oi) => `${String.fromCharCode(65 + oi)}. ${o}`).join("\n"),
      correctToText(q),
      q.score,
      q.explanation ?? "",
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 20 }];
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2["!cols"] = [{ wch: 14 }, { wch: 8 }, ...qs.map(() => ({ wch: 12 }))];
  const ws3 = XLSX.utils.aoa_to_sheet(paper);
  ws3["!cols"] = [{ wch: 6 }, { wch: 8 }, { wch: 50 }, { wch: 30 }, { wch: 10 }, { wch: 6 }, { wch: 50 }];

  XLSX.utils.book_append_sheet(wb, ws1, "總排名");
  XLSX.utils.book_append_sheet(wb, ws2, "逐題明細");
  XLSX.utils.book_append_sheet(wb, ws3, "題目卷");
  return wb;
}

/** 在瀏覽器端直接觸發下載 */
export function downloadGradebook(state: RoomState, bank: QuestionBank): void {
  const wb = buildGradebook(state, bank);
  XLSX.writeFile(wb, gradebookFileName(bank.title, new Date()));
}

/**
 * 檔名：<標題>_成績_2026-10-21_1053.xlsx
 * 用老師電腦的當地時間（toISOString 是 UTC，台灣早上會變成半夜的時間）；
 * 標題裡 Windows 不允許的檔名字元換成全形底線。
 */
export function gradebookFileName(title: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}_${p(at.getHours())}${p(at.getMinutes())}`;
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "＿").trim() || "測驗";
  return `${safe}_成績_${stamp}.xlsx`;
}
