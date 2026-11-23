import { demo } from "./catalog";
import type { Version } from "./model";

export type Totals = { impressions: number; clicks: number; installs: number };
type LowCtr = { peerCtr: number; window: string };
export type Performance = {
  totals: Totals;
  shortfall: "periods" | "volume" | null;
  lowCtr: LowCtr | null;
};

function sum(rows: Totals[]): Totals {
  return rows.reduce((total, row) => ({
    impressions: total.impressions + row.impressions, clicks: total.clicks + row.clicks,
    installs: total.installs + row.installs,
  }), { impressions: 0, clicks: 0, installs: 0 });
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

export function performance(version: Version): Performance {
  const campaign = demo.campaigns.find(item => item.id === version.campaignId);
  const ids = new Set(demo.ads.filter(ad => ad.campaignId === campaign?.id).map(ad => ad.id));
  const closed = demo.periods.filter(period => ids.has(period.adId) && period.closed &&
    period.date < demo.asOf.slice(0, 10) && campaign &&
    period.date >= campaign.flightStart && period.date <= campaign.flightEnd);
  const rules = demo.rules;
  const dates = [...new Set(closed.map(period => period.date))].sort().slice(-rules.requiredConsecutiveClosedPeriods);
  const ownPeriods = dates.map(date => closed.find(period => period.adId === version.id && period.date === date));
  const available = ownPeriods.filter(period => period !== undefined);
  const totals = sum(available);
  const consecutive = dates.every((date, index) => index === 0 ||
    Date.parse(date) - Date.parse(dates[index - 1]) === 86_400_000);
  if (!consecutive || available.length < rules.requiredConsecutiveClosedPeriods) {
    return { totals, shortfall: "periods", lowCtr: null };
  }
  const peers = dates.map(date => sum(closed.filter(period => period.date === date &&
    period.adId !== version.id && period.impressions >= rules.minImpressionsPerPeriod)));
  const belowPeers = available.every((period, index) => {
    const dailyPeers = peers[index];
    return period.impressions >= rules.minImpressionsPerPeriod && dailyPeers.clicks > 0 &&
      period.clicks / period.impressions < dailyPeers.clicks / dailyPeers.impressions / 2;
  });
  const cohort = sum(peers);
  const peerCtr = ratio(cohort.clicks, cohort.impressions);
  const lowCtr = belowPeers && peerCtr !== null ? { peerCtr, window: `ctr:${dates.join("/")}` } : null;
  const shortfall = available.some(period =>
    !period.clicks || period.impressions < rules.minImpressionsPerPeriod || period.installs < rules.minInstallsPerPeriod
  ) ? "volume" : null;
  return { totals, shortfall, lowCtr };
}
