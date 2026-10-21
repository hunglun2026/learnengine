// 倒數秒數。原本直接在 render 裡算 Date.now()，只有收到伺服器訊息才重算，
// 沒人作答時畫面上的時間會停住。這裡每秒觸發一次重畫。
// 真正的「時間到」由伺服器判斷（alarm），這裡只負責顯示。
import { useEffect, useState } from "react";
import type { RoomState } from "@learnengine/engine";

export function useCountdown(state: RoomState | null): number | null {
  const running = Boolean(state && state.endsAt > 0 && state.status === "RUNNING");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);

  if (!state || !running) return null;
  return Math.max(0, Math.floor((state.endsAt - now) / 1000));
}

export function formatClock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}
