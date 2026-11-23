"use client";

import { useEffect, useState } from "react";
import type { Locale } from "../lib/catalog";
import type { Choices } from "../lib/choices";
import type { Upload, Version } from "../lib/model";
import { t } from "../lib/strings";
import { api } from "../lib/client";
import { Dashboard } from "./dashboard";
import { Editor } from "./editor";
import { Settings } from "./settings";
import { Analytics } from "./analytics";
import { Toast, type Notice, type Notify } from "./toast";

type Props = { locale: Locale; editor: string | null; dark: boolean; today: string; versions: Version[]; uploads: Upload[]; choices: Choices };

function remember(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
}

export function Workspace(props: Props): React.JSX.Element {
  const [locale, setLocale] = useState(props.locale);
  const [dark, setDark] = useState(props.dark);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [choices, setChoices] = useState(props.choices);
  const [editor, setEditor] = useState({ id: props.editor, key: 0 });
  const [versions, setVersions] = useState(props.versions);
  const [uploads, setUploads] = useState(props.uploads);
  const [game, setGame] = useState("");
  const screen = editor.id;
  const existing = versions.find(version => version.id === screen);

  useEffect(() => {
    function locationChanged(): void {
      const params = new URL(location.href).searchParams;
      const id = params.get("view") ?? params.get("edit");
      setEditor(current => ({ id, key: current.key + 1 }));
    }
    addEventListener("popstate", locationChanged);
    return () => removeEventListener("popstate", locationChanged);
  }, []);

  function open(id: string | null): void {
    if (id === screen) return;
    const view = id === "analytics" || id === "settings";
    history.pushState(null, "", id ? `?${view ? "view" : "edit"}=${encodeURIComponent(id)}` : "/");
    setNotice(null);
    setEditor(current => ({ id, key: current.key + 1 }));
    window.scrollTo(0, 0);
  }

  function changeLocale(value: Locale): void {
    setLocale(value);
    remember("creative-locale", value);
    document.documentElement.lang = value;
  }

  function switchTheme(): void {
    const theme = dark ? "light" : "dark";
    setDark(!dark);
    remember("creative-theme", theme);
    document.documentElement.dataset.theme = theme;
  }

  function upsert(version: Version): void {
    setVersions(current => current.some(item => item.id === version.id)
      ? current.map(item => item.id === version.id ? version : item)
      : [...current, version]);
  }

  function updated(version: Version): void {
    upsert(version);
    const currentId = new URL(location.href).searchParams.get("edit");
    if (currentId === screen || currentId === version.id) {
      history.replaceState(null, "", `?edit=${version.id}`);
      setEditor(current => current.key === editor.key ? { ...current, id: version.id } : current);
    }
  }

  async function refresh(): Promise<void> {
    const result = await api<{ versions: Version[]; uploads: Upload[]; choices: Choices }>("workspace");
    setVersions(result.versions);
    setUploads(result.uploads);
    setChoices(result.choices);
  }

  const notify: Notify = (message, kind = "success") => setNotice(current => ({ id: (current?.id ?? 0) + 1, message, kind }));

  function addUpload(upload: Upload): void {
    setUploads(current => [upload, ...current]);
  }

  function launched(version: Version): void {
    upsert(version);
    setGame("");
    if (screen) {
      history.replaceState(null, "", "/");
      setEditor(current => ({ id: null, key: current.key + 1 }));
    }
    window.scrollTo(0, 0);
    notify("launched");
    void refresh().catch(() => undefined);
  }

  return <>
    <header className="header">
      <div className="header-inner">
        <a className="brand" href="/" onClick={event => { event.preventDefault(); open(null); }}>
          <img src={dark ? "/logo-header-on-dark.png" : "/logo-header-on-light.png"} alt="Banner Bake" width={769} height={204} />
        </a>
        <nav aria-label={t(locale, "workspace")}>
          <a href="/" aria-current={!screen ? "page" : undefined} onClick={event => { event.preventDefault(); open(null); }}>{t(locale, "ads")}</a>
          <a href="?view=analytics" aria-current={screen === "analytics" ? "page" : undefined} onClick={event => { event.preventDefault(); open("analytics"); }}>{t(locale, "analytics")}</a>
          <a href="?edit=new" aria-current={screen === "new" ? "page" : undefined} onClick={event => { event.preventDefault(); open("new"); }}>{t(locale, "create")}</a>
        </nav>
        <div className="header-controls">
          <button type="button" className="theme-toggle" aria-label={t(locale, "darkTheme")} aria-pressed={dark}
            title={t(locale, "darkTheme")} onClick={switchTheme}><span aria-hidden="true">{dark ? "☀" : "☾"}</span></button>
          <a className="theme-toggle settings-toggle" href="?view=settings" title={t(locale, "settings")}
            aria-label={t(locale, "settings")} aria-current={screen === "settings" ? "page" : undefined}
            onClick={event => { event.preventDefault(); open("settings"); }}><span aria-hidden="true">⚙</span></a>
          <div className="locale" role="group" aria-label={t(locale, "interfaceLanguage")}>
            {(["ru", "en"] as const).map(value => <button key={value} type="button" lang={value}
              aria-label={value === "ru" ? "Русский" : "English"} aria-pressed={locale === value} onClick={() => changeLocale(value)}>
              {value.toUpperCase()}
            </button>)}
          </div>
        </div>
      </div>
    </header>
    {screen === "settings" ? <Settings locale={locale} choices={choices} change={setChoices} addUpload={addUpload} notify={notify} />
      : screen === "analytics" ? <Analytics locale={locale} choices={choices} today={props.today} />
      : screen === "new" || existing ? <Editor key={editor.key} locale={locale} today={props.today} initial={existing}
          versions={versions} uploads={uploads} choices={choices} addUpload={addUpload}
          back={() => open(null)} updated={updated} launched={launched} notify={notify} />
        : <Dashboard locale={locale} versions={versions} choices={choices} game={game} setGame={setGame}
            create={() => open("new")} open={open} launched={launched} refresh={refresh} notify={notify} />}
    <Toast notice={notice} locale={locale} dismiss={setNotice} />
  </>;
}
