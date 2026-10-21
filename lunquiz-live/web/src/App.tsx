// 路由用網址列的 hash 判斷，不引入 router：
// 這個站只有三個畫面（首頁／老師／學生），多一個相依沒有意義。
import { useEffect, useState } from "react";
import { DialogHost } from "./dialog";
import { Home } from "./Home";
import { HostPage } from "./HostPage";
import { PlayPage } from "./PlayPage";

function readHash() {
  // #/host/ABC123 或 #/play/ABC123
  const m = location.hash.match(/^#\/(host|play)\/([A-Za-z0-9]+)/);
  return m ? { page: m[1] as "host" | "play", roomId: m[2].toUpperCase() } : null;
}

export function App() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onHash = () => setRoute(readHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      {route?.page === "host" ? (
        <HostPage roomId={route.roomId} />
      ) : route?.page === "play" ? (
        <PlayPage roomId={route.roomId} />
      ) : (
        <Home />
      )}
      <footer className="app-footer">小綸即時測驗 v{__APP_VERSION__}・鴻綸科技股份有限公司</footer>
      <DialogHost />
    </>
  );
}
