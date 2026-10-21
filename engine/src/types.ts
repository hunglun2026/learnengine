// 引擎的資料契約：題庫檔長什麼樣、房間狀態長什麼樣、前後端互相講什麼話。
// 這一份是唯一事實來源，worker 與 web 都從這裡取型別。

/** 題型。沿用 lunquiz 出題小幫手既有的分類，老師看到的名詞才會一致。 */
export type QuestionType = "single" | "multiple" | "fill" | "short";

export interface Question {
  /** 題目在這份題庫裡的固定編號，之後補題也不要重新編號 */
  id: string;
  type: QuestionType;
  /** 題幹 */
  text: string;
  /** 選擇題選項；填充/簡答留空陣列 */
  options: string[];
  /**
   * 正解。
   * single：一個選項索引；multiple：多個索引（順序不影響判分）
   * fill/short：可接受的答案字串，任一個相符就算對
   */
  answer: number[] | string[];
  /** 這題配分 */
  score: number;
  /** 解析，作答結束才會送到學生端 */
  explanation?: string;
}

/** 題庫檔（一個 .json 就是一份考卷） */
export interface QuestionBank {
  /** 供人辨識的標題，會顯示在老師端與學生端 */
  title: string;
  /** 出題設定，欄位比照 lunquiz 出題小幫手，方便兩邊互相沿用 */
  meta: {
    grade: string;
    subject: string;
    publisher?: string;
    scope?: string;
    difficulty?: string;
    language?: string;
    /** 這份題庫怎麼來的：手寫、或哪個模型生的 */
    source?: string;
    createdAt?: string;
  };
  /** 整份作答時限（分鐘）。0 或不填＝不限時，由老師手動結束 */
  timeLimitMinutes: number;
  questions: Question[];
}

/**
 * 房間狀態機。
 * 刻意不做 Kahoot 那種「全班卡在同一題」的階段；整份卷子一次發下去，
 * 學生各自照自己的速度寫，老師端即時看誰寫到哪、哪題錯。
 */
export type RoomStatus = "LOBBY" | "RUNNING" | "ENDED";

export interface AnswerRecord {
  questionId: string;
  /** 學生填的內容：選擇題是索引陣列，填充/簡答是字串 */
  value: number[] | string;
  isCorrect: boolean;
  score: number;
  /** 送出的時間戳（毫秒） */
  at: number;
}

export interface Player {
  id: string;
  name: string;
  /** 綁定的 el 帳號 id；匿名進場時為 null，之後可補綁 */
  linkedUserId: string | null;
  isOnline: boolean;
  joinedAt: number;
  lastActive: number;
  /** questionId -> 作答紀錄 */
  answers: Record<string, AnswerRecord>;
  totalScore: number;
  /** 已作答題數，老師端排序用 */
  answered: number;
  /** 已交卷 */
  submitted: boolean;
  submittedAt: number | null;
}

export interface RoomState {
  roomId: string;
  status: RoomStatus;
  bankTitle: string;
  /** 開始作答的時間戳；LOBBY 階段為 0 */
  startedAt: number;
  /** 作答截止時間戳；不限時為 0。由伺服器算，前端只負責顯示 */
  endsAt: number;
  players: Record<string, Player>;
  /** 題目總數與總分，讓學生端不必拿到正解也能顯示進度 */
  questionCount: number;
  totalScore: number;
}

/** 送到學生端的題目：**不含正解與解析**，避免直接從網路請求看到答案 */
export interface PublicQuestion {
  id: string;
  type: QuestionType;
  text: string;
  options: string[];
  score: number;
}

// ---- 訊息協定 ----

/** 學生／老師 → 伺服器 */
export type ClientMessage =
  | { type: "JOIN"; role: "player"; name: string; playerId: string; linkedUserId?: string | null }
  | { type: "JOIN"; role: "host"; hostToken: string }
  | { type: "ANSWER"; questionId: string; value: number[] | string }
  | { type: "SUBMIT" }
  | { type: "HOST_START" }
  | { type: "HOST_END" }
  | { type: "HOST_KICK"; playerId: string }
  | { type: "HOST_EXTEND"; minutes: number };

/** 伺服器 → 前端 */
export type ServerMessage =
  | { type: "STATE"; state: RoomState; questions: PublicQuestion[]; you?: Player }
  /** 只送變動的那個學生，避免每次作答都廣播整包狀態 */
  | { type: "PLAYER_UPDATE"; player: Player }
  /** 交卷或結束後才送出正解與解析 */
  | { type: "REVEAL"; questions: Question[] }
  | { type: "ERROR"; message: string };
