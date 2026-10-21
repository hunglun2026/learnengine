// 房間伺服器網址。正式環境前端與伺服器是同一個 Worker、同一個網址，直接連自己；
// 只有用 vite 開發模式（5180 埠）時，伺服器另外跑在 wrangler dev 的 8787。
export const WORKER_HOST =
  import.meta.env.VITE_WORKER_HOST ??
  (location.port === "5180" ? `${location.protocol}//${location.hostname}:8787` : location.origin);

/** 房間代碼：去掉容易看錯的 0/O、1/I，學生用手機輸入才不會一直打錯 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(len = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
