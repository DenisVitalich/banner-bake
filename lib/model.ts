import { z } from "zod";
import { campaignType, catalog, dateSchema, localeSchema, platformSchema, type Locale } from "./catalog";
import { availableChoices, defaultChoices, type Choices } from "./choices";
export { platformSchema } from "./catalog";

export const statusSchema = z.enum(["draft", "live", "paused", "stopped", "replaced", "deleted"]);
export const actionSchema = z.enum(["pause", "resume", "stop", "delete"]);
export const exportFormatSchema = z.enum(["png", "html", "txt"]);
export type Status = z.infer<typeof statusSchema>;
export type DeliveryAction = z.infer<typeof actionSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type VersionRef = { id: string; revision: number };

export function deliveryActions(status: Status): DeliveryAction[] {
  switch (status) {
    case "live": return ["pause", "stop", "delete"];
    case "paused": return ["resume", "stop", "delete"];
    case "draft":
    case "stopped":
    case "replaced": return ["delete"];
    case "deleted": return [];
    default: return status satisfies never;
  }
}

const date = z.union([z.literal(""), dateSchema]);
export const creativeSchema = z.object({
  gameId: z.string(), themeId: z.string(), backgroundId: z.string(),
  characterId: z.string().nullable(), uploadId: z.uuid().nullable(),
  locale: localeSchema, type: campaignType, publicationId: z.string().nullable().default(null),
  platforms: z.array(platformSchema).max(4).refine(items => items.length === new Set(items).size).default([]),
  autoRegenerate: z.boolean().default(false),
  flightStart: date, flightEnd: date, offerStart: date, offerEnd: date,
  offer: z.string().max(500), prize: z.string().max(500), entryRules: z.string().max(1000),
  headline: z.string().max(100), post: z.string().max(3000), cta: z.string().max(30),
});
export type Creative = z.infer<typeof creativeSchema>;
export type Field = keyof Creative;
export type Errors = Partial<Record<Field, "required" | "badDates" | "invalid">>;
export type Version = {
  id: string;
  rootId: string;
  parentId: string | null;
  version: number;
  revision: number;
  status: Status;
  creative: Creative;
  campaignId: string | null;
  autoWindow: string | null;
  updatedAt: string;
};
export type Upload = { id: string; name: string };

export function localDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function emptyCreative(locale: Locale, today = localDate(), choices = defaultChoices): Creative {
  const publication = availableChoices(choices, "publication")[0];
  return {
    gameId: availableChoices(choices, "game")[0]?.id ?? "",
    themeId: availableChoices(choices, "theme")[0]?.id ?? "",
    backgroundId: "", characterId: null, uploadId: null, locale,
    type: publication?.behavior ?? "announcement", publicationId: publication?.id ?? null,
    platforms: [], autoRegenerate: true, flightStart: today, flightEnd: today,
    offerStart: "", offerEnd: "", offer: "", prize: "", entryRules: "", headline: "", post: "", cta: "",
  };
}

export function validateCreative(value: Creative, complete: boolean, bannerOnly = false, choices: Choices = defaultChoices): Errors {
  const errors: Errors = {};
  if (value.gameId && !choices.some(item => item.kind === "game" && item.id === value.gameId)) errors.gameId = "invalid";
  if (value.themeId && !choices.some(item => item.kind === "theme" && item.id === value.themeId)) errors.themeId = "invalid";
  if (value.backgroundId && !choices.some(item => item.kind === "background" && item.id === value.backgroundId && item.gameId === value.gameId && item.themeId === value.themeId)) errors.backgroundId = "invalid";
  if (value.characterId && !choices.some(item => item.kind === "character" && item.id === value.characterId && item.gameId === value.gameId)) errors.characterId = "invalid";
  if (value.publicationId && !choices.some(item => item.kind === "publication" && item.id === value.publicationId && item.behavior === value.type)) errors.type = "invalid";
  if (!bannerOnly && value.flightEnd && value.flightEnd < value.flightStart) errors.flightEnd = "badDates";
  if (value.offerEnd && value.offerEnd < value.offerStart) errors.offerEnd = "badDates";
  if (complete) {
    const fields: (keyof Creative)[] = ["headline", "cta"];
    if (!value.backgroundId && !value.uploadId) errors.backgroundId = "required";
    if (!bannerOnly) {
      fields.push("gameId", "themeId", "flightStart", "flightEnd", "post");
      if (!value.publicationId && !choices.some(item => item.kind === "publication" && item.id === value.type && !item.archived)) errors.type = "required";
      if (!value.platforms.length) errors.platforms = "required";
      if (value.type === "promotion") fields.push("offer");
      if (value.type === "giveaway") fields.push("prize", "entryRules");
    }
    if (value.type !== "announcement" || value.offerStart || value.offerEnd) fields.push("offerStart", "offerEnd");
    for (const field of fields) {
      const text = value[field];
      if (typeof text !== "string" || !text.trim()) errors[field] = "required";
    }
  }
  return errors;
}

export function copyOptions(creative: Creative): typeof catalog.copy {
  return catalog.copy.filter(item => item.gameId === creative.gameId && item.themeId === creative.themeId && item.backgroundId === creative.backgroundId);
}

export function dateLabel(date: string, locale: Locale): string {
  return date ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date)) : "";
}

export function offerDates(value: Creative): string {
  if (!value.offerStart || !value.offerEnd) return "";
  const start = dateLabel(value.offerStart, value.locale);
  return value.offerStart === value.offerEnd ? start : `${start} – ${dateLabel(value.offerEnd, value.locale)}`;
}

export function publication(value: Creative): string {
  const type = catalog.campaignTypes.find(item => item.id === value.type);
  const period = offerDates(value);
  if (!type) return value.post;
  const details: Record<string, string> = { offer: value.offer, prize: value.prize, entryRules: value.entryRules, period };
  const suffix = value.type === "announcement" ? [value.offer, period].filter(Boolean).join("\n")
    : type.postSuffix[value.locale].replace(/\{(offer|prize|entryRules|period)\}/g, (match, field: string) => details[field] ?? match);
  return [value.post, suffix].filter(Boolean).join("\n\n");
}
