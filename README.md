# learnengine 學習互動評量引擎

鴻綸科技股份有限公司教育推廣部開發的課堂互動工具。

| 子專案 | 做什麼 | 網址 |
|---|---|---|
| `lunquiz-live` | 小綸即時測驗：老師開房，整份卷子發給學生各自作答，老師即時看到誰寫到哪、哪題錯，結束後下載 Excel 成績 | https://quiz.hunglun.com |
| `classgames` | 課堂遊戲工坊：請 Gemini 出題、貼回來，一份題庫變成五款課堂遊戲，連結傳給學生就能玩 | https://classgames.hunglun.com |
| `engine` | 共用引擎：題庫格式驗證、判分、房間狀態、成績匯出、React 元件 | |

## 開發

```bash
pnpm install
pnpm test            # engine 單元測試
pnpm -r typecheck
pnpm dev:worker      # 房間伺服器（wrangler dev，8787）
pnpm dev             # lunquiz-live 前端（vite，5180）

cd classgames/web && npm install && npm run dev   # 課堂遊戲工坊（5190）
```

## 部署

- `lunquiz-live`：push 到 `main` 由 GitHub Actions 部署成一個 Cloudflare Worker（前端靜態檔＋Durable Object 房間伺服器同一個網址）
- `classgames`：Cloudflare Pages 連這個 repo，根目錄 `classgames/web`，自動建置

## 資料與隱私

- lunquiz-live 只存房間代碼、學生自填的名字或座號與作答；結束後 24 小時（或開了沒用 12 小時）整間刪除
- classgames 沒有伺服器端資料；題庫壓縮在分享連結 `#` 後面，不會送到伺服器

## 授權

程式碼著作權屬鴻綸科技股份有限公司。字型 Noto Sans TC 採 SIL Open Font License 1.1。
