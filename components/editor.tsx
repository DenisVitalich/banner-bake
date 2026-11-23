import { useEffect, useState } from "react";
import type { Locale } from "../lib/catalog";
import { choiceTitle, type Choices } from "../lib/choices";
import { emptyCreative, exportFormatSchema, localDate, publication, validateCreative, type Creative, type Errors, type ExportFormat, type Upload, type Version } from "../lib/model";
import { number, t, type Message } from "../lib/strings";
import { ApiError, api, downloadPost } from "../lib/client";
import { PlacementPreview } from "./placement-preview";
import type { Notify } from "./toast";
import { Brief } from "./brief";
import { Compose } from "./compose";
import { PostDialog } from "./creative-preview";

type Props = {
  locale: Locale; today: string; initial?: Version; versions: Version[]; uploads: Upload[]; choices: Choices; notify: Notify;
  back: () => void; addUpload: (upload: Upload) => void; updated: (version: Version) => void; launched: (version: Version) => void;
};

export function Editor({ locale, today, initial, versions, uploads, choices, back, addUpload, updated, launched, notify }: Props): React.JSX.Element {
  const [record, setRecord] = useState(initial);
  const [value, setValue] = useState(() => initial?.creative ?? emptyCreative(locale, today, choices));
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<Message>();
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [confirmLaunch, setConfirmLaunch] = useState(false);
  const status = record?.status ?? "draft";
  const draft = status === "draft";
  const dirty = JSON.stringify(value) !== JSON.stringify(record?.creative);
  const post = publication(value);
  const game = choiceTitle(choices, value.gameId, locale);

  useEffect(() => {
    if (initial) return;
    const browserToday = localDate();
    if (browserToday === today) return;
    setValue(current => ({
      ...current,
      flightStart: current.flightStart === today ? browserToday : current.flightStart,
      flightEnd: current.flightEnd === today ? browserToday : current.flightEnd,
    }));
  }, [initial, today]);

  function patch(change: Partial<Creative>): void {
    setValue(current => ({ ...current, ...change }));
    setErrors(current => {
      const next = { ...current };
      for (const key of Object.keys(change) as (keyof Creative)[]) delete next[key];
      return next;
    });
    setNotice(undefined);
  }

  function showErrors(fields: Errors): void {
    setErrors(fields);
    const first = Object.keys(fields)[0];
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
  }

  async function perform(run: () => Promise<void>, fallback: Message): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await run();
    } catch (error) {
      let message = fallback;
      if (error instanceof ApiError) {
        if (Object.keys(error.fields).length && fallback !== "uploadFailed") {
          setConfirmLaunch(false);
          showErrors(error.fields);
          return;
        }
        if (error.code === "conflict" || error.code === "notAllowed" || error.code === "missing") message = error.code;
      }
      if (confirmLaunch) setNotice(message);
      else notify(message, "error");
    } finally { setBusy(false); }
  }

  function update(entry: Version): void {
    setRecord(entry);
    setValue(entry.creative);
    updated(entry);
    setErrors({});
  }

  async function save(launch: boolean): Promise<void> {
    const entry = await api<Version>(launch ? "launch" : "save", { creative: value, ref: record ? { id: record.id, revision: record.revision } : null });
    if (launch) launched(entry);
    else { update(entry); notify("saved"); }
  }

  function previewLaunch(): void {
    const invalid = validateCreative(value, true, false, choices);
    if (Object.keys(invalid).length) { showErrors(invalid); return; }
    setErrors({});
    setNotice(undefined);
    setConfirmLaunch(true);
  }

  async function upload(file: File): Promise<void> {
    await perform(async () => {
      const data = new FormData();
      data.set("image", file);
      const added = await api<Upload>("upload", data);
      addUpload(added);
      patch({ uploadId: added.id });
    }, "uploadFailed");
  }

  return <main className="shell editor">
    <button className="text-button back" onClick={back}><span aria-hidden="true">←</span> {t(locale, "back")}</button>
    <div className="page-heading edit-heading">
      <div><h1>{t(locale, record ? "edit" : "create")}</h1>
        <p>{game && <>{game} <span aria-hidden="true">·</span> </>} {t(locale, "previewIntro")}</p></div>
      <div className="edit-badges">
        {record && <span className="version-tag">{t(locale, "version", { number: number(locale, record.version) })}</span>}
        <span className={`pill status-${status}`}>{t(locale, status)}</span>
      </div>
    </div>
    <div className="editor-grid">
      <Brief choices={choices} value={value} set={patch} locale={locale} errors={errors} disabled={busy} />
      <Compose choices={choices} value={value} patch={patch} locale={locale} errors={errors} disabled={busy}
        uploads={uploads} upload={upload} versions={versions} />
      <aside className="preview">
        <div className="panel preview-panel">
          <div className="preview-heading"><h2>{t(locale, "preview")}</h2><span>{value.locale.toUpperCase()} · 1080 × 1080</span></div>
          <PlacementPreview creative={value} locale={locale} game={game} />
          <div className="preview-actions export-controls">
            <label className="field"><span>{t(locale, "exportFormat")}</span>
              <select value={format} onChange={event => setFormat(exportFormatSchema.parse(event.target.value))}>
                {exportFormatSchema.options.map(item => <option key={item} value={item}>{t(locale, `format-${item}`)}</option>)}
              </select>
            </label>
            <button className="button secondary" disabled={busy} onClick={() => perform(async () => { await downloadPost(value, format); notify("downloaded"); }, "exportFailed")}>{t(locale, "downloadPost")}</button>
          </div>
        </div>
        <div className="panel post-panel">
          <div className="preview-heading"><h2>{t(locale, "postPreview")}</h2>
            <button className="text-button" disabled={!value.post.trim()} onClick={async () => {
              try { await navigator.clipboard.writeText(post); notify("copied"); }
              catch { notify("copyError", "error"); }
            }}>{t(locale, "copyPost")}</button></div>
          <p lang={value.post.trim() ? value.locale : locale}>{value.post.trim() ? post : t(locale, "postEmpty")}</p>
        </div>
      </aside>
      <section className="panel publication-actions" aria-label={t(locale, "publish")}>
        <div className="regeneration-option">
          <label>
            <input type="checkbox" checked={value.autoRegenerate} disabled={busy} aria-describedby="auto-regenerate-hint"
              onChange={event => patch({ autoRegenerate: event.target.checked })} />
            {t(locale, "autoRegenerate")}
          </label>
          <p id="auto-regenerate-hint">{t(locale, "autoRegenerateHint")}</p>
        </div>
        {!draft && <p>{t(locale, "inherited")} {status === "live" && t(locale, "editActive")}</p>}
        <div className="publication-buttons">
          <button className="button secondary" disabled={busy || (!draft && !dirty)}
            onClick={() => perform(() => save(false), "saveFailed")}>{t(locale, "save")}</button>
          <button className="button primary" aria-haspopup="dialog" disabled={busy || (!draft && !dirty)}
            onClick={event => {
              event.currentTarget.focus();
              previewLaunch();
            }}>{t(locale, "launch")}</button>
        </div>
      </section>
    </div>
    {confirmLaunch && <PostDialog creative={value} locale={locale} game={game} busy={busy} close={() => setConfirmLaunch(false)}>
      {notice && <p className="field-error" role="alert">{t(locale, notice)}</p>}
      <p>{t(locale, "launchHelp")}</p>
      <div className="creative-dialog-actions">
        <form method="dialog"><button className="button secondary" disabled={busy}>{t(locale, "cancel")}</button></form>
        <button className="button primary" disabled={busy} onClick={() => perform(() => save(true), "launchFailed")}>{t(locale, "confirmLaunch")}</button>
      </div>
    </PostDialog>}
  </main>;
}
