// 正式網址只用 classgames.hunglun.com（Steve 2026-10-21：不要有 dev）。
// pages.dev 網址 Cloudflare 不能關，所以首頁一進來就永久轉址過去。
// 檔名是 index.js＝只攔「/」：字型、程式等其他檔案不經過這裡，不會每個請求都多跑一次。
// 學生分享連結的 #d=... 在網址 # 後面，不會送到伺服器，瀏覽器轉址時會自動帶過去。
const CANONICAL = "https://classgames.hunglun.com";

export function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname.endsWith(".pages.dev")) {
    return Response.redirect(CANONICAL + url.pathname + url.search, 301);
  }
  return next();
}
