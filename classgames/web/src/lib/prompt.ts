// 給 Gemini 的出題指令。不呼叫任何 API：老師把指令貼到自己的 Gemini，
// 把回覆貼回來就能玩。出得好不好，取決於老師手上是哪種 Gemini，這也是 AI Pro 的差別所在。
export interface PromptInput {
  grade: string;
  subject: string;
  scope: string;
  pairCount: number;
  quizCount: number;
}

export function buildPrompt(i: PromptInput): string {
  const grade = i.grade.trim() || "國小五年級";
  const subject = i.subject.trim() || "自然";
  const scope = i.scope.trim() || "（請老師補上單元）";
  return `你是台灣的${grade}${subject}老師，要為課堂遊戲準備題庫。
單元：${scope}

請只輸出一份 JSON，不要加任何說明文字，也不要用程式碼區塊以外的格式。內容全部使用繁體中文（臺灣用語）。

JSON 格式：
{
  "title": "題庫標題",
  "grade": "${grade}",
  "subject": "${subject}",
  "scope": "${scope}",
  "pairs": [
    { "a": "左邊的詞", "b": "右邊的意思或對應" }
  ],
  "questions": [
    { "text": "題目", "options": ["選項1", "選項2", "選項3", "選項4"], "answer": 0, "explanation": "一句話解析" }
  ]
}

要求：
1. pairs 共 ${i.pairCount} 組：每邊 15 字以內，但要寫成讀得通的完整短語，不要為了省字寫成電報體。同一邊不能有重複；不同組的右邊意思不能相近，避免玩配對時有兩個答案都對。
2. questions 共 ${i.quizCount} 題：四個選項、只有一個正解，answer 是正解的編號（從 0 開始）。干擾項要合理，不要一看就知道是錯的。
3. 四個選項的字數要相近，正解不能特別長，也不要總是最詳細的那一個；正解的位置要平均分散在四個選項。
4. 難度與範圍要符合${grade}課綱，超出該年級的內容不要出；不確定屬不屬於該年級，就不要放。
5. 事實必須正確。需要更高年級知識才說得清楚的現象，或有爭議的說法，不要出；不確定的事實不要寫。
6. 用臺灣課本的說法，不要用中國大陸用語（例如視頻、軟件、默認），專有名詞用臺灣課本的寫法（例如三稜鏡、水晶體）。
7. 題目之間不要重複考同一個概念。`;
}
