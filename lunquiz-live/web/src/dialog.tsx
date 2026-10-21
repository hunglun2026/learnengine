/**
 * 自己的確認對話框，取代瀏覽器內建的 window.confirm（內建的長相跟網站無關、顯示「網址 顯示」，
 * 學生看不懂；自動化測試也會被直接按取消）。做法照 school\class-ai\web\src\dialog.tsx。
 * 用法：const ok = await askConfirm({ message: "…", danger: true });
 * <DialogHost /> 掛在 App 最外層一次就好。
 */
import { useEffect, useRef, useState } from "react";

interface ConfirmOpts {
  title?: string;
  message: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}
type Req = { opts: ConfirmOpts; resolve: (v: boolean) => void };

let show: ((r: Req) => void) | null = null;

export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  // 還沒掛好（不該發生）就當作取消，寧可不做也不要誤交卷、誤結束
  if (!show) return Promise.resolve(false);
  return new Promise((resolve) => show!({ opts, resolve }));
}

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const cur = queue[0];

  useEffect(() => {
    show = (r) => setQueue((q) => [...q, r]);
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    // 停在主要按鈕，Enter 就能確定，Esc 取消
    if (cur) okRef.current?.focus();
  }, [cur]);

  function finish(ok: boolean) {
    if (!cur) return;
    cur.resolve(ok);
    setQueue((q) => q.slice(1));
  }

  if (!cur) return null;
  const { opts } = cur;
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && finish(false)}>
      <div
        className="dlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") finish(false);
        }}
      >
        <h2 id="dlg-title" className="dlg-title">
          {opts.title ?? "請確認"}
        </h2>
        <p className="dlg-msg">{opts.message}</p>
        <div className="dlg-actions">
          <button type="button" onClick={() => finish(false)}>
            {opts.cancelText ?? "取消"}
          </button>
          <button
            ref={okRef}
            type="button"
            className={opts.danger ? "danger" : "primary"}
            onClick={() => finish(true)}
          >
            {opts.okText ?? "確定"}
          </button>
        </div>
      </div>
    </div>
  );
}
