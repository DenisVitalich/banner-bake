import { useState } from "react";
import { performance, ratio } from "../lib/analytics";
import { demo, type Locale } from "../lib/catalog";
import { availableChoices, choiceTitle, type Choices } from "../lib/choices";
import type { Notify } from "./toast";
import { dateLabel, type Version } from "../lib/model";
import { number, percent, t } from "../lib/strings";
import { CreativeArt } from "./art";
import { CreativePreview } from "./creative-preview";

type Props = {
  locale: Locale; versions: Version[]; choices: Choices; notify: Notify; game: string; setGame: (game: string) => void;
  create: () => void; open: (id: string) => void; launched: (version: Version) => void; refresh: () => Promise<void>;
};

export function Dashboard({ locale, versions, choices, game, setGame, create, open, launched, refresh, notify }: Props): React.JSX.Element {
  const [previewId, setPreviewId] = useState<string>();
  const games = availableChoices(choices, "game");
  const activeGame = games.some(item => item.id === game) ? game : "";
  const selected = versions.filter(version => !activeGame || version.creative.gameId === activeGame);
  const reports = selected.map(version => ({ version, report: performance(version) }));
  const preview = versions.find(version => version.id === previewId);

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
      <div className="data-note"><span className="demo-tag">{t(locale, "demo")}</span><span>{t(locale, "asOf", { date: dateLabel(demo.asOf, locale) })}</span></div>
    </div>
    <section className="listing" aria-label={t(locale, "list")}>
      <div className="list-heading"><h2>{t(locale, "list")}</h2><span>{number(locale, selected.length)}</span></div>
      <div className="ad-head ad-grid" aria-hidden="true">
        {(["creative", "status", "impressions", "clicks", "installs", "ctr", "performance"] as const).map(key =>
          <span key={key}>{key === "ctr" ? key.toUpperCase() : t(locale, key)}</span>)}
      </div>
      {!reports.length && <p className="empty-state">{t(locale, "emptyAds")}</p>}
      {reports.map(({ version, report }) => {
        const sample = demo.ads.find(ad => ad.id === version.id);
        const title = sample?.label[locale] ?? (version.creative.headline || t(locale, "noTitle"));
        const campaign = demo.campaigns.find(item => item.id === version.campaignId);
        const hasData = version.status === "live" || version.status === "paused" || version.status === "stopped" || version.status === "replaced";
        return <article key={version.id} className="ad-row ad-grid">
          <div className="ad-creative">
            <CreativeArt creative={version.creative} locale={locale} />
            <div className="ad-name"><button className="creative-link" type="button" aria-haspopup="dialog"
              onClick={() => setPreviewId(version.id)}>{title}</button>
              <small>{choiceTitle(choices, version.creative.gameId, locale)}</small>
              <small>{sample ? ["A", "B", "C"][demo.ads.indexOf(sample)] : t(locale, "version", { number: number(locale, version.version) })}
                {version.parentId && ` · ${t(locale, "replacement")}`}</small>
            </div>
          </div>
          <div className="ad-status"><span className={`pill status-${version.status}`}>{t(locale, version.status)}</span></div>
          <dl className="row-stats">
            {([
              ["impressions", number(locale, report.totals.impressions)], ["clicks", number(locale, report.totals.clicks)],
              ["installs", number(locale, report.totals.installs)],
              ["ctr", percent(locale, ratio(report.totals.clicks, report.totals.impressions))],
            ] as const).map(([key, value]) => <div key={key}>
              <dt>{key === "ctr" ? key.toUpperCase() : t(locale, key)}</dt><dd>{value}</dd>
            </div>)}
          </dl>
          <div className="diagnosis" title={campaign ? `${campaign.audience[locale]} · ${campaign.channel[locale]}` : undefined}>
            {hasData && report.shortfall && <span className="pill">{t(locale, "tooEarly")}</span>}
            <small>{t(locale, !hasData ? "collecting" : report.shortfall === "periods" ? "recent" : report.shortfall === "volume" ? "noVolume" : "installRate", {
              actual: percent(locale, ratio(report.totals.installs, report.totals.clicks)), impressions: number(locale, demo.rules.minImpressionsPerPeriod), installs: number(locale, demo.rules.minInstallsPerPeriod),
            })}</small>
          </div>
        </article>;
      })}
    </section>
    {preview && <CreativePreview version={preview} locale={locale} game={choiceTitle(choices, preview.creative.gameId, locale)}
      close={() => setPreviewId(undefined)} edit={() => open(preview.id)} launched={launched} refresh={refresh}
      removed={() => { setPreviewId(undefined); notify("creativeDeleted"); }} />}
  </main>;
}
