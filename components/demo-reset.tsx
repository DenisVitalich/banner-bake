import { useRef, useState } from "react";
import type { Locale } from "../lib/catalog";
import { t } from "../lib/strings";

export function DemoReset({ locale, disabled, reset }: {
  locale: Locale; disabled: boolean; reset: () => Promise<void>;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirm(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await reset();
      dialog.current?.close();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="theme-toggle demo-reset-button" disabled={disabled} aria-haspopup="dialog"
      aria-label={t(locale, "resetDemo")} title={t(locale, "resetDemo")} onClick={() => {
        setFailed(false);
        dialog.current?.showModal();
      }}><span aria-hidden="true">↻</span></button>
    <dialog ref={dialog} className="creative-dialog demo-reset-dialog" aria-labelledby="demo-reset-title"
      aria-describedby="demo-reset-description" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="creative-dialog-header">
        <div className="creative-dialog-heading"><h2 id="demo-reset-title">{t(locale, "resetDemoTitle")}</h2></div>
      </div>
      <div className="demo-reset-details">
        <p id="demo-reset-description">{t(locale, "resetDemoHelp")}</p>
        {failed && <p className="field-error" role="alert">{t(locale, "demoResetFailed")}</p>}
      </div>
      <div className="creative-dialog-footer creative-dialog-actions">
        <form method="dialog"><button className="button secondary" disabled={busy}>{t(locale, "cancel")}</button></form>
        <button type="button" className="button danger" disabled={busy} onClick={() => void confirm()}>
          {t(locale, busy ? "resettingDemo" : "resetDemo")}
        </button>
      </div>
    </dialog>
  </>;
}
