import { useState } from "react";
import { performance, ratio } from "../lib/analytics";
import { demo, type Locale } from "../lib/catalog";
import { availableChoices, choiceTitle, type Choices } from "../lib/choices";
import type { Notify } from "./toast";
import { dateLabel, type Version } from "../lib/model";
import { number, percent, t } from "../lib/strings";
import { CreativeArt } from "./art";
import { CreativeAssessment } from "./creative-assessment";
import { CreativePreview } from "./creative-preview";
import { DemoReset } from "./demo-reset";

type Props = {
  locale: Locale; versions: Version[]; choices: Choices; notify: Notify; game: string; setGame: (game: string) => void;
  create: () => void; open: (id: string) => void; launched: (version: Version) => void; refresh: () => Promise<void>;
  regenerate: (version: Version) => Promise<void>; regeneratingId?: string; resetDemo: () => Promise<void>;
};

const columns = ["creative", "status", "impressions", "clicks", "installs", "ctr", "performance"] as const;
type Column = (typeof columns)[number];
type Sort = { column: Column; direction: "ascending" | "descending" };
const ascendingColumns: readonly Column[] = ["creative", "status", "performance"];

function columnLabel(locale: Locale, column: Column): string {
  return column === "ctr" ? "CTR" : t(locale, column);
}

export function Dashboard({ locale, versions, choices, game, setGame, create, open, launched, regenerate, regeneratingId, resetDemo, refresh, notify }: Props): React.JSX.Element {
  const [previewId, setPreviewId] = useState<string>();
  const [sort, setSort] = useState<Sort | null>(null);
  const games = availableChoices(choices, "game");
  const activeGame = games.some(item => item.id === game) ? game : "";
  const reports = versions.filter(version => !activeGame || version.creative.gameId === activeGame).map(version => {
    const title = version.creative.headline || t(locale, "noTitle");
    const demoLabel = demo.ads.find(ad => ad.id === version.id)?.label[version.creative.locale];
    const status = t(locale, version.status);
    const report = performance(version);
    const { clicks, impressions, installs } = report.totals;
    const ctr = ratio(clicks, impressions);
    // Put warnings before measured results in ascending order and leave pending results unranked.
    const assessment = version.status === "live" && report.lowCtr ? -1
      : version.status !== "draft" && !report.shortfall ? ratio(installs, clicks) : null;
    const values = { creative: title, status, ...report.totals, ctr, performance: assessment };
    return { version, report, demoLabel, values };
  });
  const preview = versions.find(version => version.id === previewId);
  const rootsWithReplacements = new Set(versions.filter(version => version.parentId).map(version => version.rootId));
  const groupsByRoot = new Map<string, typeof reports>();
  for (const entry of reports) {
    const rootId = entry.version.rootId;
    const rows = groupsByRoot.get(rootId);
    if (rows) rows.push(entry);
    else groupsByRoot.set(rootId, [entry]);
  }
  const groups = Array.from(groupsByRoot.values(), rows => rows.sort((a, b) => a.version.version - b.version.version));

  if (sort) {
    const { column, direction } = sort;
    groups.sort(([left], [right]) => {
      const a = left.values[column];
      const b = right.values[column];
      if (a === b) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      const difference = typeof a === "number" && typeof b === "number" ? a - b
        : String(a).localeCompare(String(b), locale, { numeric: true, sensitivity: "base" });
      return direction === "ascending" ? difference : -difference;
    });
  }
  const directionLabel = sort && t(locale, sort.direction === "ascending" ? "sortAscending" : "sortDescending");

  function changeSort(column: Column): void {
    setSort(current => {
      const direction = current?.column === column
        ? current.direction === "ascending" ? "descending" : "ascending"
        : ascendingColumns.includes(column) ? "ascending" : "descending";
      return { column, direction };
    });
  }

  async function restoreDemoList(): Promise<void> {
    await resetDemo();
    setGame("");
    setSort(null);
  }

  function renderAd({ version, report, demoLabel, values }: typeof reports[number]): React.JSX.Element {
    const campaign = demo.campaigns.find(item => item.id === version.campaignId);
    const versionLabel = t(locale, "version", { number: number(locale, version.version) });
    const versionRole = version.parentId ? "replacement" : rootsWithReplacements.has(version.id) ? "original" : null;
    const demoLabelId = demoLabel ? `demo-label-${version.id}` : undefined;
    const titleLang = version.creative.headline ? version.creative.locale : locale;
    return <article key={version.id} className="ad-row ad-grid">
      <div className="ad-creative">
        <CreativeArt creative={version.creative} locale={locale} />
        <div className="ad-name"><button className="creative-link" type="button" aria-haspopup="dialog"
          lang={titleLang} aria-describedby={demoLabelId} onClick={event => {
            event.currentTarget.focus();
            setPreviewId(version.id);
          }}>{values.creative}</button>
          {demoLabel && <small id={demoLabelId} lang={version.creative.locale}>{demoLabel}</small>}
          <small>{choiceTitle(choices, version.creative.gameId, locale)}</small>
          {(versionRole || !demoLabel) && <small>
            {versionLabel}{versionRole && ` · ${t(locale, versionRole)}`}
          </small>}
        </div>
      </div>
      <div className="ad-status"><span className={`pill status-${version.status}`}>{values.status}</span></div>
      <dl className="row-stats">
        {([
          ["impressions", number(locale, values.impressions)], ["clicks", number(locale, values.clicks)],
          ["installs", number(locale, values.installs)], ["ctr", percent(locale, values.ctr)],
        ] as const).map(([key, value]) => <div key={key}>
          <dt>{columnLabel(locale, key)}</dt><dd>{value}</dd>
        </div>)}
      </dl>
      <div className="diagnosis" title={campaign ? `${campaign.audience[locale]} · ${campaign.channel[locale]}` : undefined}>
        <CreativeAssessment version={version} report={report} versions={versions} choices={choices} locale={locale}
          open={open} regenerate={regenerate} regeneratingId={regeneratingId} />
      </div>
    </article>;
  }

  return <main className="shell">
    <div className="page-heading">
      <div>
        <h1>{t(locale, "ads")}</h1>
        <p>{t(locale, "dashboardIntro")}</p>
      </div>
      <button className="button primary" onClick={create}><span aria-hidden="true">＋</span>{t(locale, "create")}</button>
    </div>
    <div className="toolbar">
      <label className="filter"><span>{t(locale, "game")}</span>
        <select value={activeGame} onChange={event => setGame(event.target.value)}>
          <option value="">{t(locale, "allGames")}</option>
          {games.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}
        </select>
      </label>
      <div className="demo-controls">
        <div className="data-note"><span className="demo-tag">{t(locale, "demo")}</span><span>{t(locale, "asOf", { date: dateLabel(demo.asOf, locale) })}</span></div>
        <DemoReset locale={locale} disabled={Boolean(regeneratingId)} reset={restoreDemoList} />
      </div>
    </div>
    <section className="listing" aria-label={t(locale, "list")}>
      <div className="list-heading">
        <h2>{t(locale, "list")}</h2><span>{number(locale, reports.length)}</span>
        {sort && <button className="text-button sort-reset" type="button" onClick={() => setSort(null)}>
          {t(locale, "newestFirst")}
        </button>}
      </div>
      <div className="ad-head ad-grid" role="group" aria-label={t(locale, "sortBy")}>
        {columns.map(column => {
          const active = sort?.column === column;
          return <button key={column} className="sort-header" type="button" aria-pressed={active}
            onClick={() => changeSort(column)}>
            <span>{columnLabel(locale, column)}</span>
            <span aria-hidden="true">{active ? sort.direction === "ascending" ? "↑" : "↓" : "↕"}</span>
            {active && <span className="screen-reader">{directionLabel}</span>}
          </button>;
        })}
      </div>
      <div className="mobile-sort">
        <label className="filter">
          <span>{t(locale, "sortBy")}</span>
          <select value={sort?.column ?? ""} onChange={event => {
            const column = columns.find(key => key === event.target.value);
            if (column) changeSort(column);
            else setSort(null);
          }}>
            <option value="">{t(locale, "newestFirst")}</option>
            {columns.map(column => <option key={column} value={column}>{columnLabel(locale, column)}</option>)}
          </select>
        </label>
        {sort && directionLabel && <button className="button secondary sort-direction" type="button"
          aria-label={t(locale, "reverseSort", { direction: directionLabel })} onClick={() => changeSort(sort.column)}>
          <span aria-hidden="true">{sort.direction === "ascending" ? "↑" : "↓"}</span>
        </button>}
      </div>
      {!reports.length && <p className="empty-state">{t(locale, "emptyAds")}</p>}
      {groups.map(rows => {
        const [{ version, demoLabel, values }] = rows;
        const paired = rows.length > 1;
        return <div key={version.rootId} className={paired ? "ad-group ad-group-paired" : "ad-group"}
          role={paired ? "group" : undefined} aria-label={paired ? t(locale, "creativeVersions", { title: demoLabel ?? values.creative }) : undefined}>
          {rows.map(renderAd)}
        </div>;
      })}
    </section>
    {preview && <CreativePreview version={preview} locale={locale} game={choiceTitle(choices, preview.creative.gameId, locale)}
      close={() => setPreviewId(undefined)} edit={() => open(preview.id)} launched={launched} refresh={refresh}
      removed={() => { setPreviewId(undefined); notify("creativeDeleted"); }} />}
  </main>;
}
