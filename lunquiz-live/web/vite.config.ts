import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 版本號單一來源：這個資料夾的 package.json。畫面頁尾顯示的 v x.y.z 從這裡來，不在別處寫死。
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5180 },
});
