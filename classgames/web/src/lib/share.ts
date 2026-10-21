// 分享連結：題庫壓縮後放在網址 # 後面。# 後面的內容不會送到任何伺服器，
// 所以學生開連結就能玩，而且沒有資料庫、沒有個資問題。
import LZString from "lz-string";
import { parseGameSet, type GameSet } from "./gameset.ts";

const KEY = "d=";

export function encodeSet(set: GameSet): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(set));
}

/** 從 location.hash 還原題庫；沒有或壞掉就回 null，不丟錯（打開空白頁比跳錯誤好） */
export function decodeHash(hash: string): GameSet | null {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(KEY)) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(h.slice(KEY.length));
    if (!json) return null;
    return parseGameSet(JSON.parse(json));
  } catch {
    return null;
  }
}

export function shareUrl(set: GameSet, loc: Pick<Location, "origin" | "pathname"> = location): string {
  return `${loc.origin}${loc.pathname}#${KEY}${encodeSet(set)}`;
}
