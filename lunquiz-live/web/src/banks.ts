// 內建題庫：questions/ 資料夾裡的 .json 會被打包進網站，
// 老師不必每次上傳檔案。新增一份題庫＝丟一個 .json 進去，不用改程式。
import { parseQuestionBank, type QuestionBank } from "@learnengine/engine";

const modules = import.meta.glob("../../questions/*.json", { eager: true, import: "default" });

export interface BuiltInBank {
  file: string;
  bank: QuestionBank;
}

export const BUILT_IN_BANKS: BuiltInBank[] = Object.entries(modules)
  .map(([file, raw]) => {
    try {
      return { file, bank: parseQuestionBank(raw) };
    } catch (e) {
      // 壞掉的題庫檔不該讓整個網站白畫面，開發時在 console 看得到就好
      console.error(`題庫檔 ${file} 讀不進來：`, (e as Error).message);
      return null;
    }
  })
  .filter((x): x is BuiltInBank => x !== null)
  .sort((a: BuiltInBank, b: BuiltInBank) => a.file.localeCompare(b.file));
