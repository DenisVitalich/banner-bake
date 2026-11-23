import { z } from "zod";
import source from "../starter/catalog.json";
import metrics from "../starter/demo-metrics.json";

export const localeSchema = z.enum(["ru", "en"]);
export type Locale = z.infer<typeof localeSchema>;
const translated = z.object({ ru: z.string(), en: z.string() });
const id = z.string().min(1).max(80);
const art = z.string().regex(/^art\/[a-z-]+\.png$/);
export const dateSchema = z.iso.date();
export const campaignType = z.enum(["announcement", "promotion", "giveaway"]);
const layer = z.object({ id, gameId: id, title: translated, file: art });

export const catalog = z.object({
  games: z.array(z.object({ id, title: z.string() })),
  themes: z.array(z.object({ id, title: translated })),
  backgrounds: z.array(layer.extend({ themeId: id, alt: translated })),
  characters: z.array(layer),
  campaignTypes: z.array(z.object({ id: campaignType, title: translated, postSuffix: translated })),
  format: z.object({ channel: translated, objective: translated, width: z.literal(1080), height: z.literal(1080), currency: z.literal("EUR") }),
  copy: z.array(z.object({
    id, gameId: id, themeId: id, backgroundId: id, characterId: id.nullable(),
    headline: translated, post: translated, cta: translated,
  })),
}).parse(source);

const count = z.number().int().nonnegative();
export const demo = z.object({
  asOf: z.iso.datetime(),
  rules: z.object({
    minImpressionsPerPeriod: count.positive(),
    minInstallsPerPeriod: count.positive(), requiredConsecutiveClosedPeriods: count.positive(),
  }),
  campaigns: z.array(z.object({
    id, gameId: id, themeId: id, channel: translated, audience: translated, objective: translated,
    flightStart: dateSchema, flightEnd: dateSchema,
  })),
  ads: z.array(z.object({
    id, label: translated, copyId: id, characterId: id.nullable(), status: z.literal("live"),
    campaignId: id, creativeLocale: localeSchema,
  })),
  periods: z.array(z.object({
    date: dateSchema, closed: z.boolean(), adId: id,
    impressions: count, clicks: count, installs: count,
  })),
}).parse(metrics);
