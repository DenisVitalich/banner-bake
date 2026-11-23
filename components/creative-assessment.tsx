import { ratio, type Performance } from "../lib/analytics";
import { demo, type Locale } from "../lib/catalog";
import type { Choices } from "../lib/choices";
import type { Version } from "../lib/model";
import { regenerateCreative } from "../lib/regeneration";
import { number, percent, t } from "../lib/strings";

type Props = {
  version: Version; report: Performance; versions: Version[]; choices: Choices; locale: Locale;
  open: (id: string) => void; regenerate: (version: Version) => Promise<void>; regeneratingId?: string;
};

export function CreativeAssessment({ version, report, versions, choices, locale, open, regenerate, regeneratingId }: Props): React.JSX.Element {
  const busy = regeneratingId === version.id;
  const { lowCtr, shortfall, totals } = report;

  if (lowCtr && version.status === "live") {
    const draft = versions.find(item => item.parentId === version.id && item.autoWindow === lowCtr.window && item.status === "draft");
    return <>
      <span className="pill assessment-attention">{t(locale, "needsChanges")}</span>
      <small>{t(locale, "belowPeerCtr", {
        actual: percent(locale, ratio(totals.clicks, totals.impressions)), peer: percent(locale, lowCtr.peerCtr),
      })}</small>
      <div className="assessment-actions">
        {draft ? <button type="button" className="button secondary" onClick={() => open(draft.id)}>{t(locale, "openRegenerated")}</button>
          : regenerateCreative(version.creative, choices) && <button type="button" className="button soft"
            disabled={Boolean(regeneratingId)} onClick={() => void regenerate(version)}>
            {busy && <span className="generation-spinner" aria-hidden="true" />}
            {t(locale, busy ? "regenerating" : "regenerate")}
          </button>}
        <button type="button" className="text-button" disabled={busy} onClick={() => open(version.id)}>{t(locale, "editManually")}</button>
      </div>
      <div role="status" className={busy ? "assessment-progress" : "screen-reader"}>
        {busy && t(locale, "regeneratingDetails")}
      </div>
    </>;
  }

  if (version.autoWindow?.startsWith("ctr:") && !totals.impressions && (version.status === "draft" || version.status === "live")) {
    return <>
      <span className="pill assessment-updated">{t(locale, "creativeUpdated")}</span>
      <small>{t(locale, version.status === "live" ? "gatheringNewData" : "collecting")}</small>
    </>;
  }

  const hasData = version.status !== "draft";
  return <>
    {hasData && shortfall && <span className="pill">{t(locale, "tooEarly")}</span>}
    <small>{t(locale, !hasData ? "collecting" : shortfall === "periods" ? "recent" : shortfall === "volume" ? "noVolume" : "installRate", {
      actual: percent(locale, ratio(totals.installs, totals.clicks)),
      impressions: number(locale, demo.rules.minImpressionsPerPeriod), installs: number(locale, demo.rules.minInstallsPerPeriod),
    })}</small>
  </>;
}
