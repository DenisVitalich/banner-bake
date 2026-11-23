import { demo, type Locale } from "./catalog";
import type { Totals } from "./analytics";
import { ratio } from "./analytics";

const day = 86_400_000;
const gameIds = [...new Set(demo.campaigns.map(item => item.gameId))];
const empty: Totals = { impressions: 0, clicks: 0, installs: 0 };
export const analyticsMetrics = ["impressions", "clicks", "installs", "ctr"] as const;
export type Metric = (typeof analyticsMetrics)[number];
export type Reports = { date: string; games: Record<string, Totals> }[];

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(date) + days * day).toISOString().slice(0, 10);
}

export function spanDays(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / day) + 1;
}

export function analyticsDemo(end: string): Reports {
  return Array.from({ length: 90 }, (_, index) => {
    const games = Object.fromEntries(gameIds.map((id, gameIndex) => {
      const cycle = Math.sin(index * 0.93 + gameIndex) * 0.16 + Math.cos(index * 0.24) * 0.08;
      const impressions = Math.round((6300 - gameIndex * 2350) * (0.72 + index * (0.024 + gameIndex * 0.006) + cycle));
      const clicks = Math.round(impressions * (0.015 + gameIndex * 0.007 + index * 0.00011 + cycle * 0.009));
      const installs = Math.round(clicks * (0.18 + gameIndex * 0.043 + index * 0.0011 + cycle * 0.037));
      return [id, { impressions, clicks, installs }];
    }));
    return { date: shiftDate(end, index - 89), games };
  });
}

export function totalsFor(days: Reports, games: string[]): Totals {
  return days.reduce((total, row) => {
    for (const game of games) {
      const entry = row.games[game] ?? empty;
      total.impressions += entry.impressions;
      total.clicks += entry.clicks;
      total.installs += entry.installs;
    }
    return total;
  }, { ...empty });
}

export function metricValue(totals: Totals, metric: Metric): number {
  return metric === "ctr" ? ratio(totals.clicks, totals.impressions) ?? 0 : totals[metric];
}

export function chartDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(date));
}
