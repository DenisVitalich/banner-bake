import { useEffect } from "react";
import type { Locale } from "../lib/catalog";
import { t, type Message } from "../lib/strings";

export type Notice = { id: number; message: Message; kind: "success" | "error" };
export type Notify = (message: Message, kind?: Notice["kind"]) => void;

export function Toast({ notice, locale, dismiss }: { notice: Notice | null; locale: Locale; dismiss: (value: null) => void }): React.JSX.Element {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dismiss(null), 5200);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);

  return <div role="status">
    {notice && <div className={`toast toast-${notice.kind}`} key={notice.id}>
      <span className="toast-icon" aria-hidden="true">{notice.kind === "success" ? "✓" : "!"}</span>
      <span>{t(locale, notice.message)}</span>
    </div>}
  </div>;
}
