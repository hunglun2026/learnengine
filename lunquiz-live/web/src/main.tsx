import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// 自架 Noto Sans TC：已按字元範圍切片，瀏覽器只下載畫面上出現的字。
// 不用 fonts.py 固定子集，因為題目是老師上傳的，事先不知道會出現哪些字。
import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/500.css";
import "@fontsource/noto-sans-tc/700.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
