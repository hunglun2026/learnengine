import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// 自架 Noto Sans TC（取代 Google Fonts）：已按字元範圍切片，瀏覽器只下載畫面上出現的字。
// 不用 fonts.py 固定子集，因為題庫是老師貼進來的，事先不知道會出現哪些字。
import "@fontsource/noto-sans-tc/400.css";
import "@fontsource/noto-sans-tc/500.css";
import "@fontsource/noto-sans-tc/700.css";
import "@fontsource/noto-sans-tc/900.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
