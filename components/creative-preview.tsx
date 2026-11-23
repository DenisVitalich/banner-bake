import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { Locale } from "../lib/catalog";
import { ApiError, api } from "../lib/client";
import { deliveryActions, publication, type Creative, type DeliveryAction, type Version } from "../lib/model";
import { number, t, type Message } from "../lib/strings";
import { PlacementPreview } from "./placement-preview";

function showModal(dialog: HTMLDialogElement | null): void {
  if (dialog && !dialog.open) dialog.showModal();
}

function isBackdrop(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

export function PostDialog({ creative, locale, game, version, busy, close, children }: {
  creative: Creative; locale: Locale; game: string; version?: Version; busy: boolean; close: () => void; children: ReactNode;
}): React.JSX.Element {
  const title = creative.headline || t(locale, "noTitle");
  const hasPlacement = creative.platforms.length > 0;
  const startedOnBackdrop = useRef(false);
  return <dialog ref={showModal} className={hasPlacement ? "creative-dialog creative-dialog-placement" : "creative-dialog"}
    aria-labelledby="creative-preview-title" onClose={close}
    onPointerDown={event => { startedOnBackdrop.current = isBackdrop(event); }}
    onClick={event => {
      if (startedOnBackdrop.current && !busy && isBackdrop(event)) event.currentTarget.close();
      startedOnBackdrop.current = false;
    }}
    onCancel={event => { if (busy) event.preventDefault(); }}>
    <div className="creative-dialog-header">
      <div className="creative-dialog-heading">
        <h2 id="creative-preview-title" lang={creative.headline ? creative.locale : locale}>{title}</h2>
        <p>{game}{version && <>
          <span>{t(locale, "version", { number: number(locale, version.version) })}</span>
          <span className={`pill status-${version.status}`} aria-live="polite">{t(locale, version.status)}</span>
        </>}</p>
      </div>
      <form method="dialog">
        <button className="button secondary icon-button" aria-label={t(locale, "closePreview")} disabled={busy}>×</button>
      </form>
    </div>
    <div className="creative-dialog-body">
      <PlacementPreview creative={creative} locale={locale} game={game} />
      {!hasPlacement && <section className="creative-dialog-post">
        <h3>{t(locale, "postPreview")}</h3>
        <p lang={creative.post.trim() ? creative.locale : locale}>{creative.post.trim() ? publication(creative) : t(locale, "postEmpty")}</p>
      </section>}
    </div>
    <div className="creative-dialog-footer">{children}</div>
  </dialog>;
}

type Props = {
  version: Version; locale: Locale; game: string; close: () => void; edit: () => void;
  refresh: () => Promise<void>; removed: () => void; launched: (version: Version) => void;
};

export function CreativePreview({ version, locale, game, close, edit, refresh, removed, launched }: Props): React.JSX.Element {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Message>();
  const { creative, status, id, revision } = version;

  async function changeStatus(action: DeliveryAction | "launch"): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      if (action === "launch") {
        const next = await api<Version>("launch", { creative, ref: { id, revision } });
        close();
        launched(next);
      } else {
        await api<Version>("transition", { id, revision, action });
        await refresh();
        if (action === "delete") removed();
      }
    } catch (error) {
      setError(action === "launch" && error instanceof ApiError && error.code === "invalid" ? "launchDetailsMissing" : "statusFailed");
      if (error instanceof ApiError && (error.code === "conflict" || error.code === "missing")) {
        await refresh().catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  return <PostDialog creative={creative} locale={locale} game={game} version={version} busy={busy} close={close}>
    {error && <p className="field-error" role="alert">{t(locale, error)}</p>}
    {confirmDelete ? <>
      <p><strong>{t(locale, "confirmDelete")}</strong> {t(locale, "deleteHelp")}</p>
      <div className="creative-dialog-actions">
        <button className="button secondary" disabled={busy} onClick={() => { setConfirmDelete(false); setError(undefined); }}>{t(locale, "cancel")}</button>
        <button className="button danger" disabled={busy} onClick={() => changeStatus("delete")}>{t(locale, "deleteCreative")}</button>
      </div>
    </> : <div className="creative-dialog-actions">
      {status === "draft" && <button className="button primary" disabled={busy} onClick={() => changeStatus("launch")}>{t(locale, "confirmLaunch")}</button>}
      <button className={`button ${status === "draft" ? "secondary" : "primary"}`} disabled={busy} onClick={edit}>{t(locale, "editCreative")}</button>
      {deliveryActions(status).map(action => <button className={`button ${action === "resume" ? "soft" : action === "delete" ? "danger-outline" : "secondary"}`}
        key={action} disabled={busy} onClick={() => action === "delete" ? setConfirmDelete(true) : void changeStatus(action)}>{t(locale, action)}</button>)}
    </div>}
  </PostDialog>;
}
