import { catalog } from "./catalog";
import { availableChoices, type Choices } from "./choices";
import type { Creative } from "./model";

export function regenerateCreative(creative: Creative, choices: Choices): Creative | null {
  const scenes = availableChoices(choices, "background");
  const characters = availableChoices(choices, "character");

  for (const sample of catalog.copy) {
    if (sample.gameId !== creative.gameId || sample.themeId !== creative.themeId) continue;
    if (!scenes.some(scene => scene.id === sample.backgroundId)) continue;
    const { locale } = creative;
    const headline = sample.headline[locale];
    const post = sample.post[locale];
    const characterId = characters.some(character => character.id === sample.characterId) ? sample.characterId : null;
    const imageChanged = creative.uploadId || creative.backgroundId !== sample.backgroundId || creative.characterId !== characterId;
    if (imageChanged && headline !== creative.headline && post !== creative.post) {
      return { ...creative, backgroundId: sample.backgroundId, characterId, uploadId: null, headline, post, cta: sample.cta[locale] };
    }
  }
  return null;
}
