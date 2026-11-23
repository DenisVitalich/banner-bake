import { useRef, useState, type FormEvent } from "react";
import { campaignType, catalog, type Locale } from "../lib/catalog";
import { availableChoices, choiceKind, choiceTitle, type ChoiceChange, type ChoiceKind, type Choices } from "../lib/choices";
import { api } from "../lib/client";
import type { Upload } from "../lib/model";
import { t } from "../lib/strings";
import type { Notify } from "./toast";

type Props = { locale: Locale; choices: Choices; change: (next: Choices) => void; addUpload: (upload: Upload) => void; notify: Notify };

export function Settings({ locale, choices, change, addUpload, notify }: Props): React.JSX.Element {
  const [kind, setKind] = useState<ChoiceKind>("game");
  const [title, setTitle] = useState("");
  const [game, setGame] = useState("");
  const [theme, setTheme] = useState("");
  const [behavior, setBehavior] = useState<(typeof campaignType.options)[number]>("announcement");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const games = availableChoices(choices, "game");
  const themes = availableChoices(choices, "theme");
  const gameId = games.find(item => item.id === game)?.id ?? games[0]?.id ?? "";
  const themeId = themes.find(item => item.id === theme)?.id ?? themes[0]?.id ?? "";
  const needsImage = kind === "background" || kind === "character";
  const blocked = needsImage && (!gameId || (kind === "background" && !themeId));

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      let entry: Extract<ChoiceChange, { action: "add" }>["choice"];
      switch (kind) {
        case "game": entry = { kind, title }; break;
        case "theme": entry = { kind, title }; break;
        case "publication": entry = { kind, title, behavior }; break;
        case "background":
        case "character": {
          const photo = file.current?.files?.[0];
          if (!photo) return;
          const data = new FormData();
          data.set("image", photo);
          const upload = await api<Upload>("upload", data);
          addUpload(upload);
          entry = kind === "background" ? { kind, title, gameId, themeId, uploadId: upload.id } : { kind, title, gameId, uploadId: upload.id };
          break;
        }
        default: return kind satisfies never;
      }
      change(await api<Choices>("choices", { action: "add", choice: entry }));
      setTitle("");
      if (file.current) file.current.value = "";
      notify("choiceAdded");
    } catch {
      notify("choiceFailed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    try {
      change(await api<Choices>("choices", { action: "remove", id }));
      notify("choiceRemoved");
    } catch {
      notify("choiceFailed", "error");
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell settings-page">
    <div className="page-heading"><div><h1>{t(locale, "settings")}</h1><p>{t(locale, "settingsIntro")}</p></div></div>
    <div className="settings-layout">
      <section className="panel">
        <div className="panel-title"><h2>{t(locale, "choiceAdd")}</h2></div>
        <form onSubmit={add}>
          <fieldset className="fields" disabled={busy}>
            <label className="field"><span>{t(locale, "choiceKind")}</span>
              <select value={kind} onChange={event => setKind(choiceKind.parse(event.target.value))}>
                {choiceKind.options.map(item => <option value={item} key={item}>{t(locale, `choice-${item}`)}</option>)}
              </select>
            </label>
            <label className="field"><span>{t(locale, "choiceName")}</span>
              <input value={title} onChange={event => setTitle(event.target.value)} required maxLength={80} />
            </label>
            {needsImage && <label className="field"><span>{t(locale, "game")}</span>
              <select value={gameId} onChange={event => setGame(event.target.value)} required>
                {!games.length && <option value="">{t(locale, "choose")}</option>}
                {games.map(item => <option value={item.id} key={item.id}>{item.title[locale]}</option>)}
              </select>
            </label>}
            {kind === "background" && <label className="field"><span>{t(locale, "theme")}</span>
              <select value={themeId} onChange={event => setTheme(event.target.value)} required>
                {!themes.length && <option value="">{t(locale, "choose")}</option>}
                {themes.map(item => <option value={item.id} key={item.id}>{item.title[locale]}</option>)}
              </select>
            </label>}
            {kind === "publication" && <label className="field"><span>{t(locale, "choiceBehavior")}</span>
              <select value={behavior} onChange={event => setBehavior(campaignType.parse(event.target.value))}>
                {catalog.campaignTypes.map(item => <option value={item.id} key={item.id}>{item.title[locale]}</option>)}
              </select>
            </label>}
            {needsImage && <label className="field"><span>{t(locale, "image")}</span>
              <input key={kind} ref={file} type="file" accept="image/png,image/jpeg,image/webp" required />
              <small className="field-hint">{t(locale, kind === "character" ? "characterAssetHint" : "uploadHint")}</small>
            </label>}
            <button className="button primary settings-add" disabled={blocked} type="submit">{t(locale, "add")}</button>
          </fieldset>
        </form>
      </section>
      <section className="panel settings-list">
        <div className="panel-title"><h2>{t(locale, `choice-${kind}`)}</h2><p>{t(locale, "choiceRemoveHint")}</p></div>
        <ul>{availableChoices(choices, kind).map(item => <li key={item.id}>
          <div><strong>{item.title[locale]}</strong>
            {"gameId" in item && <small>{choiceTitle(choices, item.gameId, locale)}
              {"themeId" in item && ` · ${choiceTitle(choices, item.themeId, locale)}`}</small>}
          </div>
          <button type="button" className="button danger-outline" disabled={busy}
            aria-label={t(locale, "removeChoice", { title: item.title[locale] })} onClick={() => remove(item.id)}>{t(locale, "delete")}</button>
        </li>)}</ul>
        {!availableChoices(choices, kind).length && <p className="field-hint">{t(locale, "noChoices")}</p>}
      </section>
    </div>
  </main>;
}
