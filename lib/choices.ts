import { z } from "zod";
import { campaignType, catalog } from "./catalog";

const id = z.string().min(1).max(80);
const label = z.string().trim().min(1).max(80);
export const choiceKind = z.enum(["game", "theme", "background", "character", "publication"]);
export type ChoiceKind = z.infer<typeof choiceKind>;

const base = z.object({ id, title: z.object({ ru: label, en: label }), archived: z.boolean() });
const image = z.uuid().nullable();
const game = base.extend({ kind: z.literal("game") });
const theme = base.extend({ kind: z.literal("theme") });
const background = base.extend({ kind: z.literal("background"), gameId: id, themeId: id, uploadId: image });
const character = base.extend({ kind: z.literal("character"), gameId: id, uploadId: image });
const publication = base.extend({ kind: z.literal("publication"), behavior: campaignType });
const choiceSchema = z.discriminatedUnion("kind", [game, theme, background, character, publication]);
export const choicesSchema = z.array(choiceSchema);
export type Choice = z.infer<typeof choiceSchema>;
export type Choices = z.infer<typeof choicesSchema>;

const name = z.object({ title: label });
const draftSchema = z.discriminatedUnion("kind", [
  name.extend({ kind: z.literal("game") }),
  name.extend({ kind: z.literal("theme") }),
  name.extend({ kind: z.literal("background"), gameId: id, themeId: id, uploadId: z.uuid() }),
  name.extend({ kind: z.literal("character"), gameId: id, uploadId: z.uuid() }),
  name.extend({ kind: z.literal("publication"), behavior: campaignType }),
]);
export const choiceChangeSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), choice: draftSchema }),
  z.object({ action: z.literal("remove"), id }),
]);
export type ChoiceChange = z.infer<typeof choiceChangeSchema>;

export const defaultChoices: Choices = [
  ...catalog.games.map(item => ({ id: item.id, title: { ru: item.title, en: item.title }, kind: "game" as const, archived: false })),
  ...catalog.themes.map(item => ({ ...item, kind: "theme" as const, archived: false })),
  ...catalog.backgrounds.map(({ id, title, gameId, themeId }) => ({ id, title, gameId, themeId, kind: "background" as const, archived: false, uploadId: null })),
  ...catalog.characters.map(({ id, title, gameId }) => ({ id, title, gameId, kind: "character" as const, archived: false, uploadId: null })),
  ...catalog.campaignTypes.map(item => ({ id: item.id, title: item.title, behavior: item.id, kind: "publication" as const, archived: false })),
];

export function availableChoices<K extends ChoiceKind>(choices: Choices, kind: K, selectedId?: string | null): Extract<Choice, { kind: K }>[] {
  const active = (id: string): boolean => choices.some(choice => choice.id === id && !choice.archived);
  return choices.filter((choice): choice is Extract<Choice, { kind: K }> => {
    if (choice.kind !== kind) return false;
    if (choice.id === selectedId) return true;
    if (choice.archived) return false;
    if ((choice.kind === "background" || choice.kind === "character") && !active(choice.gameId)) return false;
    return choice.kind !== "background" || active(choice.themeId);
  });
}

export function choiceTitle(choices: Choices, id: string, locale: "ru" | "en"): string {
  return choices.find(choice => choice.id === id)?.title[locale] ?? "";
}
